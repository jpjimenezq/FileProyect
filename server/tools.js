import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { BIN, UserError, run } from './exec.js'

const PDF = { exts: ['.pdf'], magic: ['pdf'] }
const input = (exts, ...magic) => ({ exts, magic })

/** Comprueba la cabecera del archivo para no pasar basura a los binarios */
const CHECKS = {
  pdf: (b) => b.subarray(0, 1024).includes('%PDF-'),
  office: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])) || b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
  rtf: (b) => b.subarray(0, 5).toString('latin1') === String.raw`{\rtf`,
  text: (b) => !b.includes(0),
}

/** `magic` es una lista de tipos de contenido aceptados */
export function sniff(buf, magic) {
  return [].concat(magic).some((kind) => CHECKS[kind](buf))
}

const PRESETS = { low: '/printer', recommended: '/ebook', extreme: '/screen' }

export const compressArgs = (input, output, level) => [
  '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=${PRESETS[level] ?? PRESETS.recommended}`,
  '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${output}`, input,
]

/** qpdf lee los argumentos de un fichero: así las contraseñas no aparecen en la lista de procesos */
export const protectArgs = (input, output, { password, allowPrint = true, allowCopy = true }) => [
  '--encrypt', password, allowPrint && allowCopy ? password : randomBytes(12).toString('hex'), '256',
  ...(allowPrint ? [] : ['--print=none']),
  ...(allowCopy ? [] : ['--extract=n']),
  '--modify=none', '--', input, output,
]

async function withArgFile(dir, args, cmd, extra = {}) {
  const file = path.join(dir, 'args.txt')
  await fs.writeFile(file, args.join('\n'), { mode: 0o600 })
  try {
    return await run(cmd, [`@${file}`], extra)
  } finally {
    await fs.rm(file, { force: true })
  }
}

async function soffice(dir, input, target, infilter) {
  const out = path.join(dir, 'out')
  await fs.mkdir(out, { recursive: true })
  const args = [
    '--headless', '--norestore', '--nolockcheck', '--nodefault',
    `-env:UserInstallation=${pathToFileURL(path.join(dir, 'lo-profile')).href}`,
    ...(infilter ? [`--infilter=${infilter}`] : []),
    '--convert-to', target, '--outdir', out, input,
  ]
  const r = await run(BIN.soffice, args, { timeout: 180_000, env: { HOME: dir } })
  const ext = target.split(':')[0]
  const result = path.join(out, `${path.parse(input).name}.${ext}`)
  try { await fs.access(result) } catch { throw new UserError('No se pudo convertir el archivo. Puede estar dañado o protegido.', 422) }
  if (r.code !== 0) throw new UserError('La conversión falló.', 422)
  return result
}

const officeToPdf = (id, accept) => ({
  id, bin: 'soffice', inputs: [accept], suffix: '', ext: 'pdf', mime: 'application/pdf',
  run: async ({ dir, files }) => ({ path: await soffice(dir, files[0], 'pdf') }),
})

const fromPdf = (id, ext, target, infilter, mime, note) => ({
  id, bin: 'soffice', inputs: [PDF], suffix: '', ext, mime, note,
  run: async ({ dir, files }) => ({ path: await soffice(dir, files[0], target, infilter) }),
})

export const TOOLS = {
  compress: {
    bin: 'gs', inputs: [PDF], suffix: '_comprimido', ext: 'pdf', mime: 'application/pdf',
    async run({ dir, files, opts }) {
      const out = path.join(dir, 'out.pdf')
      const r = await run(BIN.gs, compressArgs(files[0], out, opts.level), { timeout: 300_000 })
      if (r.code !== 0) throw new UserError('No se pudo comprimir el PDF.', 422)
      const [before, after] = await Promise.all([fs.stat(files[0]), fs.stat(out)])
      // si no se gana nada, se devuelve el original
      if (after.size >= before.size) return { path: files[0], note: 'El PDF ya estaba optimizado: no se pudo reducir más.' }
      return { path: out, note: `Reducido un ${Math.round((1 - after.size / before.size) * 100)}% (${Math.round(before.size / 1024)} KB → ${Math.round(after.size / 1024)} KB).` }
    },
  },
  repair: {
    bin: 'qpdf', inputs: [PDF], suffix: '_reparado', ext: 'pdf', mime: 'application/pdf',
    async run({ dir, files }) {
      const out = path.join(dir, 'out.pdf')
      const q = await run(BIN.qpdf, [files[0], out])
      if ((q.code === 0 || q.code === 3) && (await fs.stat(out).catch(() => null))) return { path: out }
      // segundo intento: reescribir con Ghostscript
      const g = await run(BIN.gs, ['-sDEVICE=pdfwrite', '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, files[0]], { timeout: 300_000 }).catch(() => null)
      if (g?.code === 0 && (await fs.stat(out).catch(() => null))) return { path: out, note: 'Reparado reescribiendo el documento; puede haber cambios de formato.' }
      throw new UserError('No se pudo reparar el PDF: está demasiado dañado.', 422)
    },
  },
  protect: {
    bin: 'qpdf', inputs: [PDF], suffix: '_protegido', ext: 'pdf', mime: 'application/pdf',
    async run({ dir, files, opts }) {
      if (typeof opts.password !== 'string' || !opts.password) throw new UserError('Indica una contraseña.')
      if (/[\r\n]/.test(opts.password)) throw new UserError('La contraseña no puede tener saltos de línea.')
      const out = path.join(dir, 'out.pdf')
      const r = await withArgFile(dir, protectArgs(files[0], out, opts), BIN.qpdf)
      if (r.code !== 0 && r.code !== 3) throw new UserError('No se pudo proteger el PDF.', 422)
      return { path: out }
    },
  },
  unlock: {
    bin: 'qpdf', inputs: [PDF], suffix: '_desbloqueado', ext: 'pdf', mime: 'application/pdf',
    async run({ dir, files, opts }) {
      const out = path.join(dir, 'out.pdf')
      const pw = typeof opts.password === 'string' ? opts.password : ''
      if (/[\r\n]/.test(pw)) throw new UserError('La contraseña no puede tener saltos de línea.')
      const r = await withArgFile(dir, [`--password=${pw}`, '--decrypt', files[0], out], BIN.qpdf)
      if (r.code === 2 && /password/i.test(r.stderr)) throw new UserError('Contraseña incorrecta.', 422)
      if (r.code !== 0 && r.code !== 3) throw new UserError('No se pudo desbloquear el PDF.', 422)
      return { path: out }
    },
  },
  'pdf-to-pdfa': {
    bin: 'gs', inputs: [PDF], suffix: '_pdfa', ext: 'pdf', mime: 'application/pdf',
    async run({ dir, files }) {
      const out = path.join(dir, 'out.pdf')
      const r = await run(BIN.gs, [
        '-dPDFA=2', '-dPDFACompatibilityPolicy=1', '-sColorConversionStrategy=UseDeviceIndependentColor',
        '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, files[0],
      ], { timeout: 300_000 })
      if (r.code !== 0) throw new UserError('No se pudo convertir a PDF/A.', 422)
      return { path: out, note: 'Convertido a un PDF compatible con PDF/A-2b. Para cumplimiento certificado, valídalo con veraPDF.' }
    },
  },
  'word-to-pdf': officeToPdf('word-to-pdf', input(['.doc', '.docx', '.odt', '.rtf'], 'office', 'rtf')),
  'ppt-to-pdf': officeToPdf('ppt-to-pdf', input(['.ppt', '.pptx', '.odp'], 'office')),
  'excel-to-pdf': officeToPdf('excel-to-pdf', input(['.xls', '.xlsx', '.ods', '.csv'], 'office', 'text')),
  'html-to-pdf': officeToPdf('html-to-pdf', input(['.html', '.htm'], 'text')),
  'pdf-to-word': fromPdf('pdf-to-word', 'docx', 'docx:MS Word 2007 XML', 'writer_pdf_import',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'La conversión de PDF a Word es aproximada: revisa el formato del resultado.'),
  'pdf-to-ppt': fromPdf('pdf-to-ppt', 'pptx', 'pptx', 'impress_pdf_import',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Cada página se convierte en una diapositiva; el texto puede quedar en bloques sueltos.'),
}

// html-to-pdf usa el filtro web de Writer para respetar el diseño de la página
TOOLS['html-to-pdf'].run = async ({ dir, files }) => ({ path: await soffice(dir, files[0], 'pdf:writer_web_pdf_Export') })
