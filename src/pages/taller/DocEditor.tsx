import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { saveAs } from 'file-saver'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, Code2, Download, Sigma, FilePlus2, FolderOpen, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered,
  Minus, Printer, Quote, Redo2, RemoveFormatting, Strikethrough, Table2, Underline, Undo2,
} from 'lucide-react'
import { CodeBlock, CodeHelpers } from '../../lib/doc/codeExtensions'
import { LatexBlock } from '../../lib/doc/latex'
import '../../lib/doc/loadFonts'
import { FontPicker } from './FontPicker'
import { LanguagePicker } from './LanguagePicker'
import { exportDocx } from '../../lib/doc/docxExport'
import type { PMNode } from '../../lib/doc/docxExport'
import { importDocx } from '../../lib/doc/docxImport'
import { callTool, useCapabilities } from '../../lib/api'
import { peekHandoff } from '../../lib/handoff'

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
const STORAGE = 'fp_doc_draft'

const toPx = (pt: number) => `${Math.round((pt * 4) / 3 * 10) / 10}px`
const fromPx = (px?: string) => (px ? Math.round((parseFloat(px) * 3) / 4) : undefined)

function Btn({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm transition disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:min-w-10 ${active ? 'bg-brand text-white' : 'hover:bg-ink/10'}`}
    >
      {children}
    </button>
  )
}
const Sep = () => <span className="mx-1 hidden h-5 w-px bg-ink/15 md:block" aria-hidden />

/** Lee un archivo de texto o HTML y lo deja como contenido del editor */
async function readIntoEditor(editor: Editor, file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) editor.commands.setContent((await importDocx(await file.arrayBuffer())) as never)
  else if (name.endsWith('.html') || name.endsWith('.htm')) editor.commands.setContent(await file.text())
  else {
    const lines = (await file.text()).split(/\r?\n/)
    editor.commands.setContent({ type: 'doc', content: lines.map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) })
  }
}

export default function DocEditor() {
  const caps = useCapabilities()
  const [title, setTitle] = useState('Documento sin título')
  const [saved, setSaved] = useState<'saving' | 'saved'>('saved')
  const [menu, setMenu] = useState(false)
  const [tab, setTab] = useState<'texto' | 'parrafo' | 'insertar'>('texto')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const openInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false, autolink: true } }),
      CodeBlock,
      LatexBlock,
      CodeHelpers,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Empieza a escribir aquí…' }),
    ],
    content: '',
    editorProps: { attributes: { 'aria-label': 'Contenido del documento', spellcheck: 'true', lang: 'es' } },
  })

  // recuperar el borrador guardado en este navegador (o abrir el archivo que llega desde el Taller)
  useEffect(() => {
    if (!editor) return
    const incoming = peekHandoff('/taller/documento')
    if (incoming) {
      void readIntoEditor(editor, incoming).then(() => setTitle(incoming.name.replace(/.[^.]+$/, ''))).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.'))
      return
    }
    try {
      const raw = localStorage.getItem(STORAGE)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.json) editor.commands.setContent(d.json)
        if (d.title) setTitle(d.title)
      }
    } catch { /* sin almacenamiento o borrador dañado */ }
  }, [editor])

  const persist = useCallback((json: unknown, name: string) => {
    clearTimeout(timer.current)
    setSaved('saving')
    timer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify({ json, title: name, savedAt: Date.now() })) } catch { /* lleno o bloqueado */ }
      setSaved('saved')
    }, 700)
  }, [])

  useEffect(() => {
    if (!editor) return
    const onUpdate = () => persist(editor.getJSON(), title)
    editor.on('update', onUpdate)
    return () => { editor.off('update', onUpdate) }
  }, [editor, persist, title])

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      const text = e.isInitialized ? e.getText() : ''
      const style = e.getAttributes('textStyle')
      return {
        bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
        bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), code: e.isActive('codeBlock'), latex: e.isActive('latexBlock'), lang: (e.getAttributes('codeBlock').language as string | null) ?? '',
        link: e.isActive('link'), inTable: e.isActive('table'),
        heading: ([1, 2, 3] as const).find((l) => e.isActive('heading', { level: l })) ?? 0,
        align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
        font: (style.fontFamily as string | undefined)?.split(',')[0].replace(/["']/g, '') ?? '',
        size: fromPx(style.fontSize as string | undefined),
        color: (style.color as string | undefined) ?? '#111111',
        canUndo: e.can().undo(), canRedo: e.can().redo(),
        words: text.trim().split(/\s+/).filter(Boolean).length, chars: text.length,
      }
    },
  })

  if (!editor || !st) return <p className="py-24 text-center text-ink/50">Cargando el editor…</p>
  const chain = () => editor.chain().focus()
  /** En pantallas pequeñas solo se muestra el grupo elegido; desde tabletas, todos seguidos */
  const group = (id: typeof tab) => `${tab === id ? 'flex w-full flex-wrap items-center gap-0.5 pt-1' : 'hidden'} md:contents`

  const fileName = (ext: string) => `${title.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'documento'}.${ext}`

  const downloadDocx = async () => saveAs(await exportDocx(editor.getJSON() as PMNode, { title }), fileName('docx'))

  const downloadPdf = async () => {
    setBusy('Creando el PDF…')
    setError(undefined)
    try {
      const docx = new File([await exportDocx(editor.getJSON() as PMNode, { title })], fileName('docx'))
      const out = await callTool('word-to-pdf', docx, {}, () => {})
      saveAs(out.blob, fileName('pdf'))
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'No se pudo crear el PDF.'} Puedes usar «Imprimir» y elegir «Guardar como PDF».`)
    } finally {
      setBusy(undefined)
    }
  }

  const open = async (f?: File) => {
    if (!f) return
    setError(undefined)
    try {
      await readIntoEditor(editor, f)
      setTitle(f.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.')
    }
  }

  const insertImage = (f?: File) => {
    if (!f || !f.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new window.Image()
      img.onload = () => {
        const scale = Math.min(1, 480 / img.naturalWidth)
        chain().setImage({ src, width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) }).run()
      }
      img.src = src
    }
    reader.readAsDataURL(f)
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) chain().unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinkOpen(false)
  }

  const reset = () => {
    if (!editor.isEmpty && !window.confirm('¿Empezar un documento nuevo? Se perderá el contenido actual.')) return
    editor.commands.clearContent(true)
    setTitle('Documento sin título')
    try { localStorage.removeItem(STORAGE) } catch { /* nada que borrar */ }
  }

  const serverPdf = caps !== null && caps !== 'offline' && caps.tools['word-to-pdf']

  return (
    <div className="doc-editor">
      <div className="no-print border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Link to="/taller" className="text-sm text-ink/55 hover:text-brand">← Taller</Link>
            <input aria-label="Nombre del documento" value={title} onChange={(e) => { setTitle(e.target.value); persist(editor.getJSON(), e.target.value) }} className="order-last min-w-0 basis-full rounded-lg bg-transparent px-2 py-1 font-display sm:order-none sm:basis-0 sm:flex-1 text-lg font-bold hover:bg-ink/5 focus:bg-ink/5 focus:outline-none" />
            <span className="hidden text-xs text-ink/45 md:inline">{saved === 'saving' ? 'Guardando…' : 'Guardado en este navegador'}</span>
            <input ref={openInput} type="file" hidden accept=".docx,.html,.htm,.txt,.md" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
            <Btn title="Documento nuevo" onClick={reset}><FilePlus2 size={17} /></Btn>
            <Btn title="Abrir un archivo (.docx, .html, .txt)" onClick={() => openInput.current?.click()}><FolderOpen size={17} /></Btn>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"><Download size={16} /> Descargar <ChevronDown size={14} /></button>
              {menu && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-2xl border border-line bg-white py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10" onClick={() => { setMenu(false); void downloadDocx() }}>Word (.docx)</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10 disabled:opacity-40" disabled={!serverPdf} onClick={() => { setMenu(false); void downloadPdf() }}>PDF {serverPdf ? '' : '(no disponible ahora)'}</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10" onClick={() => { setMenu(false); saveAs(new Blob([editor.getText({ blockSeparator: '\n\n' })], { type: 'text/plain;charset=utf-8' }), fileName('txt')) }}>Texto (.txt)</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10" onClick={() => { setMenu(false); saveAs(new Blob([`<!doctype html><meta charset="utf-8"><title>${title}</title>${editor.getHTML()}`], { type: 'text/html;charset=utf-8' }), fileName('html')) }}>Página web (.html)</button>
                  <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-brand/10" onClick={() => { setMenu(false); window.print() }}><Printer size={15} /> Imprimir / guardar como PDF</button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="no-print sticky top-16 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-3 py-1.5 md:py-2">
          <div className="flex flex-wrap items-center gap-0.5">
            <Btn title="Deshacer" disabled={!st.canUndo} onClick={() => chain().undo().run()}><Undo2 size={16} /></Btn>
            <Btn title="Rehacer" disabled={!st.canRedo} onClick={() => chain().redo().run()}><Redo2 size={16} /></Btn>
            <div role="tablist" aria-label="Grupos de herramientas" className="ml-auto flex gap-1 rounded-full bg-paper p-1 text-sm font-semibold md:hidden">
              {([['texto', 'Texto'], ['parrafo', 'Párrafo'], ['insertar', 'Insertar']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(id)}
                  className={`rounded-full px-3 py-1 transition ${tab === id ? 'bg-ink text-white' : 'text-ink/65'}`}>{label}</button>
              ))}
            </div>
            <Sep />
            <div className={group('texto')}>
            <select aria-label="Estilo del párrafo" value={st.heading} onChange={(e) => { const l = Number(e.target.value); if (l) chain().setHeading({ level: l as 1 | 2 | 3 }).run(); else chain().setParagraph().run() }} className="h-8 rounded-lg border border-line bg-white px-2 text-sm">
              <option value={0}>Párrafo</option><option value={1}>Título 1</option><option value={2}>Título 2</option><option value={3}>Título 3</option>
            </select>
            <FontPicker value={st.font} onPick={(f) => chain().setFontFamily(f).run()} />
            <select aria-label="Tamaño de letra" value={st.size ?? ''} onChange={(e) => (e.target.value ? chain().setFontSize(toPx(Number(e.target.value))).run() : chain().unsetFontSize().run())} className="h-8 w-[4.5rem] rounded-lg border border-line bg-white px-2 text-sm">
              <option value="">11</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Sep />
            <Btn title="Negrita (Ctrl+B)" active={st.bold} onClick={() => chain().toggleBold().run()}><Bold size={16} /></Btn>
            <Btn title="Cursiva (Ctrl+I)" active={st.italic} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></Btn>
            <Btn title="Subrayado (Ctrl+U)" active={st.underline} onClick={() => chain().toggleUnderline().run()}><Underline size={16} /></Btn>
            <Btn title="Tachado" active={st.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough size={16} /></Btn>
            <label title="Color del texto" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-ink/10 pointer-coarse:h-10 pointer-coarse:w-10">
              <span className="flex flex-col items-center text-sm font-bold leading-none">A<span className="mt-0.5 block h-[3px] w-4 rounded" style={{ background: st.color }} /></span>
              <input type="color" aria-label="Color del texto" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#111111'} onChange={(e) => chain().setColor(e.target.value).run()} />
            </label>
            <label title="Resaltar" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-ink/10 pointer-coarse:h-10 pointer-coarse:w-10">
              <Highlighter size={16} />
              <input type="color" aria-label="Color de resaltado" className="sr-only" defaultValue="#ffff00" onChange={(e) => chain().setHighlight({ color: e.target.value }).run()} />
            </label>
            <Btn title="Quitar formato" onClick={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></Btn>
            </div>
            <Sep />
            <div className={group('parrafo')}>
            <Btn title="Alinear a la izquierda" active={st.align === 'left'} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={16} /></Btn>
            <Btn title="Centrar" active={st.align === 'center'} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={16} /></Btn>
            <Btn title="Alinear a la derecha" active={st.align === 'right'} onClick={() => chain().setTextAlign('right').run()}><AlignRight size={16} /></Btn>
            <Btn title="Justificar" active={st.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()}><AlignJustify size={16} /></Btn>
            <Sep />
            <Btn title="Lista con viñetas" active={st.bullet} onClick={() => chain().toggleBulletList().run()}><List size={16} /></Btn>
            <Btn title="Lista numerada" active={st.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
            <Btn title="Cita" active={st.quote} onClick={() => chain().toggleBlockquote().run()}><Quote size={16} /></Btn>
            </div>
            <div className={group('insertar')}>
            <Btn title="Bloque de código" active={st.code} onClick={() => chain().toggleCodeBlock().run()}><Code2 size={16} /></Btn>
            {st.code && <LanguagePicker value={st.lang} onPick={(id) => chain().updateAttributes('codeBlock', { language: id || null }).run()} />}
            <Btn title="Fórmula matemática (LaTeX)" active={st.latex} onClick={() => chain().insertLatex().run()}><Sigma size={16} /></Btn>
            <Btn title="Línea horizontal" onClick={() => chain().setHorizontalRule().run()}><Minus size={16} /></Btn>
            <Sep />
            <Btn title="Enlace" active={st.link} onClick={() => { setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? ''); setLinkOpen((o) => !o) }}><Link2 size={16} /></Btn>
            <input ref={imageInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { insertImage(e.target.files?.[0]); e.target.value = '' }} />
            <Btn title="Insertar imagen" onClick={() => imageInput.current?.click()}><ImagePlus size={16} /></Btn>
            <Btn title="Insertar tabla 3×3" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></Btn>
            </div>
          </div>

          {st.inTable && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-paper px-2 py-1.5 text-xs font-semibold">
              <span className="text-ink/50">Tabla:</span>
              {([['Fila arriba', () => chain().addRowBefore().run()], ['Fila abajo', () => chain().addRowAfter().run()], ['Columna izq.', () => chain().addColumnBefore().run()], ['Columna der.', () => chain().addColumnAfter().run()], ['Combinar celdas', () => chain().mergeCells().run()], ['Dividir celda', () => chain().splitCell().run()], ['Quitar fila', () => chain().deleteRow().run()], ['Quitar columna', () => chain().deleteColumn().run()], ['Quitar tabla', () => chain().deleteTable().run()]] as [string, () => void][]).map(([label, fn]) => (
                <button key={label} onMouseDown={(e) => e.preventDefault()} onClick={fn} className={`rounded-lg px-2 py-1 hover:bg-white ${label.startsWith('Quitar') ? 'text-red-600' : ''}`}>{label}</button>
              ))}
            </div>
          )}
          {linkOpen && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); applyLink() }}>
              <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… (vacío para quitar el enlace)" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" />
              <button className="rounded-lg bg-ink px-4 text-sm font-semibold text-white">Aplicar</button>
            </form>
          )}
          {(busy || error) && <p role={error ? 'alert' : 'status'} className={`mt-2 rounded-lg px-3 py-1.5 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-brand/10'}`}>{error ?? busy}</p>}
        </div>
      </div>

      <div className="bg-ink/5 px-2 py-8 print:p-0">
        <div className="doc-paper mx-auto w-[794px] max-w-full bg-white px-4 py-6 shadow-xl shadow-ink/10 sm:px-16 sm:py-16">
          <EditorContent editor={editor} />
        </div>
      </div>
      <p className="no-print border-t border-line bg-white py-2 text-center text-xs text-ink/50">{st.words.toLocaleString('es-ES')} palabras · {st.chars.toLocaleString('es-ES')} caracteres</p>
    </div>
  )
}
