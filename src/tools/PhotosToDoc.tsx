import { useEffect, useState } from 'react'
import { PagePreview } from '../components/PagePreview'
import { ImageLightbox, ZoomButton } from '../components/Lightbox'
import { ChevronDown, FileImage, FileText, FileType, Images, Maximize, RotateCw, ScanText, X } from 'lucide-react'
import { AddMore } from '../components/Dropzone'
import { Segmented } from '../components/Illustrate'
import { SortableGrid } from '../components/SortableGrid'
import { Select } from '../components/ui'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import type { ImageOptions } from '../lib/pdf/ops'
import { convertImages, prepareImage, preparedToDocx, preparedToPdf, recognizeAll, textToDocx } from '../lib/doc/photos'
import type { OutFormat } from '../lib/doc/photos'

const ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg'
type Kind = 'pdf' | 'word' | 'word-text' | 'txt' | 'images'

const ACTION_LABEL: Record<Kind, string> = { pdf: 'Crear PDF', word: 'Crear Word', 'word-text': 'Crear Word editable', txt: 'Extraer texto', images: 'Convertir fotos' }

function useObjectUrl(file: File) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

function Thumb({ file, turn, opts, onTurn, onRemove }: { file: File; turn: number; opts?: ImageOptions; onTurn: () => void; onRemove: () => void }) {
  const url = useObjectUrl(file)
  const [big, setBig] = useState(false)
  return (
    <div className="relative flex w-36 flex-col items-center gap-2 sm:w-44">
      <div className="absolute right-1 top-1 z-30 flex gap-1">
        <button type="button" onClick={onTurn} aria-label="Girar 90°" title="Girar 90°" className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-white hover:bg-brand"><RotateCw size={14} /></button>
        <button type="button" onClick={onRemove} aria-label="Quitar" title="Quitar" className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-white hover:bg-red-600"><X size={14} /></button>
      </div>
      {opts ? (
        <PagePreview file={file} opts={opts} turn={turn} />
      ) : (
        <div className="group/zoom relative flex h-[152px] w-[132px] items-center sm:h-[200px] sm:w-[176px] justify-center overflow-hidden bg-white shadow">
          {url && <img src={url} alt={file.name} draggable={false} className="max-h-full max-w-full transition-transform" style={{ transform: `rotate(${turn}deg)`, ...(turn % 180 ? { maxWidth: 190, maxHeight: 170 } : {}) }} />}
          {url && <ZoomButton onOpen={() => setBig(true)} />}
        </div>
      )}
      {big && url && <ImageLightbox src={url} name={file.name} turn={turn} onClose={() => setBig(false)} />}
      <p className="w-full truncate text-center text-xs font-medium" title={file.name}>{file.name}</p>
    </div>
  )
}

function PhotosWork({ files, setFiles, addFiles, run }: FrameCtx) {
  const [kind, setKind] = useState<Kind>('pdf')
  const [page, setPage] = useState<ImageOptions>({ orientation: 'auto', size: 'a4', margin: 20 })
  const [lang, setLang] = useState('spa')
  const [format, setFormat] = useState<OutFormat>('png')
  const [pageOpen, setPageOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  const [turns, setTurns] = useState<Map<File, number>>(new Map())
  const setP = <K extends keyof ImageOptions>(k: K, v: ImageOptions[K]) => setPage((o) => ({ ...o, [k]: v }))
  const turn = (f: File) => setTurns((m) => new Map(m).set(f, ((m.get(f) ?? 0) + 90) % 360))
  const name = files.length === 1 ? baseName(files[0]) : 'fotos'
  const pageSummary = `${{ a4: 'A4', letter: 'Carta', fit: 'Como la foto' }[page.size]}${page.size === 'fit' ? '' : ` · ${{ auto: 'Automática', portrait: 'Vertical', landscape: 'Horizontal' }[page.orientation]}`} · Margen ${{ 0: 'ninguno', 20: 'pequeño', 50: 'grande' }[page.margin] ?? page.margin}`
  const usesPage = kind === 'pdf' || kind === 'word'
  const usesOcr = kind === 'word-text' || kind === 'txt'

  const start = () => run(async (progress) => {
    const images = []
    for (const [i, f] of files.entries()) { images.push(await prepareImage(f, turns.get(f) ?? 0)); progress(((i + 1) / files.length) * 0.25) }
    const rest = (f: number) => progress(0.25 + f * 0.7)
    switch (kind) {
      case 'pdf': return [{ name: `${name}.pdf`, blob: pdfBlob(await preparedToPdf(images, page, rest)) }]
      case 'word': return [{ name: `${name}.docx`, blob: await preparedToDocx(images, page, name) }]
      case 'word-text': {
        const text = await recognizeAll(images, lang, rest)
        const out: Output[] = [{ name: `${name}.docx`, blob: await textToDocx(text, name), note: text.every((t) => !t) ? 'No se reconoció texto. Prueba con una foto más nítida o elige otro idioma.' : undefined }]
        return out
      }
      case 'txt': {
        const text = await recognizeAll(images, lang, rest)
        return [{ name: `${name}.txt`, blob: new Blob([text.join('\n\n')], { type: 'text/plain;charset=utf-8' }), preview: text.join('\n\n---\n\n') }]
      }
      case 'images': return convertImages(images, format)
    }
  })

  return (
    <Workspace
      main={
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-ink/60">Arrastra para ordenar las páginas. Gira cada foto si hace falta.</p>
            <AddMore accept={ACCEPT} onFiles={addFiles} label="Añadir fotos" />
          </div>
          <SortableGrid
            minCol="9rem"
            items={files}
            keyOf={(f, i) => `${f.name}-${f.size}-${i}`}
            onChange={setFiles}
            render={(f) => <Thumb file={f} turn={turns.get(f) ?? 0} opts={usesPage ? page : undefined} onTurn={() => turn(f)} onRemove={() => setFiles(files.filter((x) => x !== f))} />}
          />
        </>
      }
      side={
        <>
          <Field label="¿Qué quieres obtener?">
            <Segmented<Kind>
              label="Resultado"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'pdf', label: 'PDF', icon: FileText, desc: 'Un PDF con una foto por página.' },
                { value: 'word', label: 'Word', icon: FileType, desc: 'Un documento Word con las fotos, una por página.' },
                { value: 'word-text', label: 'Word editable', icon: ScanText, desc: 'Lee el texto de las fotos y lo deja en un Word que puedes editar.' },
                { value: 'txt', label: 'Texto', icon: FileText, desc: 'Solo el texto de las fotos, en un archivo .txt.' },
                { value: 'images', label: 'Otro formato', icon: Images, desc: 'Las mismas fotos en PNG, JPG o WebP.' },
              ]}
            />
          </Field>
          {usesPage && (
            <div className="rounded-2xl border border-line">
              <button
                type="button"
                aria-expanded={pageOpen}
                aria-controls="ajustes-pagina"
                onClick={() => setPageOpen((o) => !o)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left hover:bg-ink/5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Ajustes de página</span>
                  {!pageOpen && <span className="block truncate text-xs text-ink/55">{pageSummary}</span>}
                </span>
                <ChevronDown size={18} className={`shrink-0 text-ink/60 transition ${pageOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {pageOpen && (
                <div id="ajustes-pagina" className="flex flex-col gap-4 border-t border-line p-3">
                  <Field label="Tamaño de página">
                    <Segmented<ImageOptions['size']>
                      label="Tamaño de página"
                      value={page.size}
                      onChange={(v) => setP('size', v)}
                      options={[
                        { value: 'a4', label: 'A4', icon: FileText },
                        { value: 'letter', label: 'Carta', icon: FileText },
                        { value: 'fit', label: 'Como la foto', icon: Maximize, desc: 'Cada página tiene justo el tamaño de su foto.' },
                      ]}
                    />
                  </Field>
                  {page.size !== 'fit' && (
                    <Field label="Orientación">
                      <Segmented<ImageOptions['orientation']>
                        label="Orientación"
                        value={page.orientation}
                        onChange={(v) => setP('orientation', v)}
                        options={[{ value: 'auto', label: 'Automática' }, { value: 'portrait', label: 'Vertical' }, { value: 'landscape', label: 'Horizontal' }]}
                      />
                    </Field>
                  )}
                  <Field label="Margen">
                    <Segmented<number> label="Margen" value={page.margin} onChange={(v) => setP('margin', v)} options={[{ value: 0, label: 'Ninguno' }, { value: 20, label: 'Pequeño' }, { value: 50, label: 'Grande' }]} />
                  </Field>
                </div>
              )}
            </div>
          )}
          {usesOcr && (
            <Select label="Idioma del texto" hint="La primera vez se descarga el idioma (necesitas conexión)." value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="spa">Español</option><option value="eng">Inglés</option><option value="fra">Francés</option><option value="deu">Alemán</option>
              <option value="por">Portugués</option><option value="ita">Italiano</option><option value="spa+eng">Español + Inglés</option>
            </Select>
          )}
          {kind === 'images' && (
            <Field label="Formato">
              <Segmented<OutFormat> label="Formato" value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG', icon: FileImage }, { value: 'jpg', label: 'JPG', icon: FileImage }, { value: 'webp', label: 'WebP', icon: FileImage }]} />
            </Field>
          )}
        </>
      }
      action={{ label: ACTION_LABEL[kind], disabled: !files.length, onClick: start }}
    />
  )
}

export default function PhotosToDoc() {
  return <ToolFrame id="photos-to-doc" accept={ACCEPT} multiple>{(ctx) => <PhotosWork {...ctx} />}</ToolFrame>
}
