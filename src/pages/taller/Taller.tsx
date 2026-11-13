import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FileText, FolderOpen, Table2, X } from 'lucide-react'
import { toolById } from '../../tools/catalog'
import { setHandoff } from '../../lib/handoff'

const cards = [
  {
    to: '/taller/documento',
    icon: FileText,
    color: '#2563eb',
    title: 'Documento',
    text: 'Escribe y da formato como en Word: tipos de letra, tamaños, colores, alineación, listas, tablas e imágenes.',
    chips: ['Abre y guarda .docx', 'Exporta a PDF', 'Se guarda solo'],
    tools: ['word-to-pdf', 'pdf-to-word', 'text-to-pdf'],
  },
  {
    to: '/taller/hoja',
    icon: Table2,
    color: '#16a34a',
    title: 'Hoja de cálculo',
    text: 'Tablas con fórmulas como en Excel: sumas, promedios, condicionales, varias hojas, colores y formatos de número.',
    chips: ['Abre y guarda .xlsx', 'Importa y exporta .csv', 'Fórmulas en vivo'],
    tools: ['excel-to-pdf', 'pdf-to-excel'],
  },
]

/** Qué se puede hacer con un PDF desde el Taller: primero lo más habitual al editar */
const PDF_ACTIONS: { id: string; why: string }[] = [
  { id: 'edit', why: 'Escribe, dibuja o añade imágenes encima del PDF' },
  { id: 'pdf-to-word', why: 'Edita el texto en el editor de documentos' },
  { id: 'forms', why: 'Rellena sus campos de formulario' },
  { id: 'sign', why: 'Añade tu firma' },
  { id: 'ocr', why: 'Si es un escaneo, hazlo seleccionable' },
  { id: 'split', why: 'Sepáralo o quita páginas' },
  { id: 'compress', why: 'Hazlo más ligero para enviarlo' },
  { id: 'pdf-to-excel', why: 'Saca sus tablas a una hoja de cálculo' },
]

const DOC = /\.(docx|html?|txt|md)$/i
const SHEET = /\.(xlsx|csv|tsv)$/i
const IMAGE = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i

export function Taller() {
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [pdf, setPdf] = useState<File>()
  const [error, setError] = useState<string>()

  const openFile = (f?: File) => {
    if (!f) return
    setError(undefined)
    if (DOC.test(f.name)) { setHandoff(f, '/taller/documento'); nav('/taller/documento') }
    else if (SHEET.test(f.name)) { setHandoff(f, '/taller/hoja'); nav('/taller/hoja') }
    else if (IMAGE.test(f.name)) { setHandoff(f, '/fotos-a-documento'); nav('/fotos-a-documento') }
    else if (/\.pdf$/i.test(f.name)) setPdf(f)
    else setError('Ese tipo de archivo no se puede abrir aquí. Prueba con PDF, imágenes, Word (.docx), Excel (.xlsx), CSV, texto o HTML.')
  }

  const useWith = (id: string) => {
    if (!pdf) return
    const tool = toolById(id)
    setHandoff(pdf, tool.path)
    nav(tool.path)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand">Taller</p>
      <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">Un espacio libre para tus archivos</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink/65">Abre un archivo tuyo o empieza uno nuevo. Documentos y hojas de cálculo se editan aquí mismo; con un PDF te proponemos qué hacer con él.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); openFile(e.dataTransfer.files[0]) }}
        className={`dots mt-8 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed bg-white p-8 text-center transition ${over ? 'border-brand bg-brand/5' : 'border-line'}`}
      >
        <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg,.docx,.html,.htm,.txt,.md,.xlsx,.csv,.tsv" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = '' }} />
        <button onClick={() => input.current?.click()} className="flex items-center gap-2 rounded-2xl bg-ink px-6 py-3.5 font-bold text-white hover:bg-brand"><FolderOpen size={20} /> Abrir un archivo</button>
        <p className="text-sm text-ink/55">o suéltalo aquí · PDF, fotos, Word (.docx), Excel (.xlsx), CSV, texto o HTML</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
      </div>

      {pdf && (
        <section aria-label="Qué hacer con tu PDF" className="mt-6 rounded-3xl border border-brand/30 bg-white p-6 shadow-lg shadow-brand/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">¿Qué quieres hacer con «{pdf.name}»?</h2>
              <p className="mt-1 text-sm text-ink/60">Elige una herramienta y se abre con tu archivo ya cargado.</p>
            </div>
            <button onClick={() => setPdf(undefined)} aria-label="Cerrar" className="rounded-full p-2 hover:bg-ink/5"><X size={18} /></button>
          </div>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {PDF_ACTIONS.map(({ id, why }, i) => {
              const tool = toolById(id)
              const Icon = tool.icon
              return (
                <li key={id}>
                  <button onClick={() => useWith(id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md ${i < 2 ? 'border-brand/40 bg-brand/5' : 'border-line'}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><Icon size={19} /></span>
                    <span className="min-w-0"><span className="block font-semibold">{tool.name}</span><span className="block text-sm text-ink/60">{why}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-sm text-ink/55">¿Quieres cambiar el texto original? Conviértelo a Word, edítalo en el Taller y descárgalo otra vez como PDF.</p>
        </section>
      )}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {cards.map(({ to, icon: Icon, color, title, text, chips, tools }) => (
          <div key={to} className="flex flex-col rounded-3xl border border-line bg-white p-7">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: color }}><Icon size={28} /></span>
            <h2 className="mt-5 text-2xl font-bold">{title}</h2>
            <p className="mt-2 flex-1 text-ink/65">{text}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => <li key={c} className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink/70">{c}</li>)}
            </ul>
            <Link to={to} className="group mt-5 flex items-center gap-1.5 font-semibold text-brand">Empezar uno nuevo <ArrowRight size={16} className="transition group-hover:translate-x-1" /></Link>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Te puede servir</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {tools.map((id) => { const t = toolById(id); return <li key={id}><Link to={t.path} className="rounded-full border border-line px-3 py-1 text-sm hover:border-brand hover:text-brand">{t.name}</Link></li> })}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
