import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { saveAs } from 'file-saver'
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Download, FilePlus2, FolderOpen, Italic, Columns3, Paintbrush, Plus, Redo2, Rows3, Trash2, Undo2,
} from 'lucide-react'
import {
  Evaluator, cellName, colName, emptyBook, emptySheet, formatValue, key, offsetFormula, parseCsv, resize, sheetFromRows, sheetToRows, toCsv, usedSize,
} from '../../lib/sheet/model'
import type { Cell, CellStyle, NumFmt, Workbook } from '../../lib/sheet/model'
import { exportXlsx, importXlsx } from '../../lib/sheet/xlsx'
import { peekHandoff } from '../../lib/handoff'
import { ColorPopover, MiniSelect } from './TallerControls'

const ROW_H = 26
const HEAD_H = 26
const GUTTER = 52
const DEF_W = 100
const STORAGE = 'fp_sheet_draft'
const FORMATS: { value: NumFmt; label: string }[] = [{ value: '', label: 'General' }, { value: 'int', label: 'Entero' }, { value: 'dec2', label: '2 decimales' }, { value: 'pct', label: 'Porcentaje' }, { value: 'eur', label: 'Euros' }, { value: 'date', label: 'Fecha' }]
const FILLS = ['#ffeb3b', '#c6f26b', '#a5f3fc', '#fbcfe8', '#fed7aa', '#e7e1d5'] as const

interface Pos { r: number; c: number }
interface Range { r1: number; c1: number; r2: number; c2: number }
const norm = (a: Pos, b: Pos): Range => ({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) })

function Btn({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm transition disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:min-w-10 ${active ? 'bg-brand text-white' : 'hover:bg-ink/10'}`}>
      {children}
    </button>
  )
}
const Sep = () => <span className="mx-1 hidden h-5 w-px bg-ink/15 md:block" aria-hidden />

export default function SheetEditor() {
  const [book, setBook] = useState<Workbook>(emptyBook)
  const [past, setPast] = useState<Workbook[]>([])
  const [future, setFuture] = useState<Workbook[]>([])
  const [si, setSi] = useState(0)
  const [title, setTitle] = useState('Hoja de cálculo sin título')
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 })
  const [focus, setFocus] = useState<Pos>({ r: 0, c: 0 })
  const [editing, setEditing] = useState<{ pos: Pos; text: string; fromBar?: boolean } | null>(null)
  const [scroll, setScroll] = useState({ top: 0, height: 600 })
  const [menu, setMenu] = useState(false)
  const [tab, setTab] = useState<'formato' | 'celdas'>('formato')
  /** En pantallas pequeñas solo se muestra el grupo elegido; desde tabletas, todos seguidos */
  const group = (id: typeof tab) => `${tab === id ? 'flex w-full flex-wrap items-center gap-0.5 pt-1' : 'hidden'} md:contents`
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<'saving' | 'saved'>('saved')
  const [renaming, setRenaming] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const tappedActive = useRef(false)
  const openInput = useRef<HTMLInputElement>(null)
  const clip = useRef<{ text: string; rows: string[][]; r: number; c: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const sheet = book.sheets[Math.min(si, book.sheets.length - 1)]
  const ev = useMemo(() => new Evaluator(book), [book])
  const sel = norm(anchor, focus)
  const used = usedSize(sheet)
  const rowCount = Math.max(used.rows + 50, 100, focus.r + 20)
  const colCount = Math.max(used.cols + 5, 26, focus.c + 3)
  const widths = useMemo(() => Array.from({ length: colCount }, (_, c) => sheet.colW[c] ?? DEF_W), [sheet.colW, colCount])
  const lefts = useMemo(() => { let x = 0; return widths.map((w) => { const l = x; x += w; return l }) }, [widths])
  const totalW = GUTTER + widths.reduce((a, b) => a + b, 0)

  // ── historial y guardado ──
  const commit = useCallback((next: Workbook) => {
    setPast((p) => [...p.slice(-99), book])
    setFuture([])
    setBook(next)
  }, [book])
  const undo = () => { const p = past[past.length - 1]; if (!p) return; setFuture((f) => [book, ...f]); setPast(past.slice(0, -1)); setBook(p) }
  const redo = () => { const n = future[0]; if (!n) return; setPast((p) => [...p, book]); setFuture(future.slice(1)); setBook(n) }

  useEffect(() => {
    const incoming = peekHandoff('/taller/hoja')
    if (incoming) { void open(incoming); return }
    try {
      const raw = localStorage.getItem(STORAGE)
      if (raw) { const d = JSON.parse(raw); if (d.book?.sheets?.length) { setBook(d.book); if (d.title) setTitle(d.title) } }
    } catch { /* sin almacenamiento o borrador dañado */ }
  }, [])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    clearTimeout(timer.current)
    setSaved('saving')
    timer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify({ book, title })) } catch { /* lleno o bloqueado */ }
      setSaved('saved')
    }, 800)
  }, [book, title])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScroll((s) => ({ ...s, height: el.clientHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── edición de datos ──
  const withSheet = (fn: (cells: Record<string, Cell>) => void, colW?: Record<number, number>): Workbook => {
    const cells = { ...sheet.cells }
    fn(cells)
    return { sheets: book.sheets.map((s) => (s === sheet ? { ...s, cells, colW: colW ?? s.colW } : s)) }
  }
  const setValue = (entries: [number, number, string][], base?: Workbook) => {
    const target = base ?? book
    const tsheet = target.sheets[si]
    const cells = { ...tsheet.cells }
    for (const [r, c, v] of entries) {
      const k = key(r, c)
      const prev = cells[k]
      if (v === '' && !prev?.s) delete cells[k]
      else cells[k] = { ...prev, v }
    }
    return { sheets: target.sheets.map((s, i) => (i === si ? { ...s, cells } : s)) }
  }
  const eachSel = (fn: (r: number, c: number) => void) => { for (let r = sel.r1; r <= sel.r2; r++) for (let c = sel.c1; c <= sel.c2; c++) fn(r, c) }

  const applyStyle = (patch: (s: CellStyle) => CellStyle) => {
    commit(withSheet((cells) => eachSel((r, c) => {
      const k = key(r, c)
      const prev = cells[k] ?? { v: '' }
      const s = patch({ ...prev.s })
      const clean = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== false && v !== '')) as CellStyle
      if (prev.v === '' && !Object.keys(clean).length) delete cells[k]
      else cells[k] = { v: prev.v, ...(Object.keys(clean).length ? { s: clean } : {}) }
    })))
  }
  const allHave = (test: (s: CellStyle) => boolean) => { let ok = true; eachSel((r, c) => { if (!test(sheet.cells[key(r, c)]?.s ?? {})) ok = false }); return ok }
  const activeCell = sheet.cells[key(focus.r, focus.c)]
  const toggle = (prop: 'b' | 'i') => { const on = !allHave((s) => !!s[prop]); applyStyle((s) => ({ ...s, [prop]: on })) }

  const startEdit = (pos: Pos, text?: string) => setEditing({ pos, text: text ?? sheet.cells[key(pos.r, pos.c)]?.v ?? '' })
  const finishEdit = (move: 'down' | 'right' | 'none' = 'none', save = true) => {
    if (!editing) return
    const { pos, text } = editing
    setEditing(null)
    if (save && text !== (sheet.cells[key(pos.r, pos.c)]?.v ?? '')) commit(setValue([[pos.r, pos.c, text]]))
    if (move !== 'none') { const p = { r: pos.r + (move === 'down' ? 1 : 0), c: pos.c + (move === 'right' ? 1 : 0) }; select(p) }
    box.current?.focus()
  }
  const select = (p: Pos, extend = false) => {
    const q = { r: Math.max(0, p.r), c: Math.max(0, p.c) }
    setFocus(q)
    if (!extend) setAnchor(q)
    const el = box.current
    if (!el) return
    const top = q.r * ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H + HEAD_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H + HEAD_H - el.clientHeight
    const left = GUTTER + lefts[Math.min(q.c, lefts.length - 1)]
    if (left - GUTTER < el.scrollLeft) el.scrollLeft = left - GUTTER
    else if (left + (widths[q.c] ?? DEF_W) > el.scrollLeft + el.clientWidth) el.scrollLeft = left + (widths[q.c] ?? DEF_W) - el.clientWidth
  }

  const clear = () => commit(setValue((() => { const e: [number, number, string][] = []; eachSel((r, c) => { if (sheet.cells[key(r, c)]) e.push([r, c, '']) }); return e })()))

  const fillDown = () => {
    if (sel.r1 === sel.r2) return
    const e: [number, number, string][] = []
    for (let c = sel.c1; c <= sel.c2; c++) {
      const src = sheet.cells[key(sel.r1, c)]?.v ?? ''
      for (let r = sel.r1 + 1; r <= sel.r2; r++) e.push([r, c, src[0] === '=' ? '=' + offsetFormula(src.slice(1), r - sel.r1, 0) : src])
    }
    commit(setValue(e))
  }

  const onCopy = (e: ClipboardEvent, cut = false) => {
    if (editing) return
    const rows: string[][] = []
    const shown: string[][] = []
    for (let r = sel.r1; r <= sel.r2; r++) {
      rows.push([]); shown.push([])
      for (let c = sel.c1; c <= sel.c2; c++) {
        rows[rows.length - 1].push(sheet.cells[key(r, c)]?.v ?? '')
        const v = ev.value(sheet.name, r, c)
        shown[shown.length - 1].push(typeof v === 'number' ? String(v) : formatValue(v))
      }
    }
    const text = shown.map((l) => l.join('\t')).join('\n')
    e.clipboardData.setData('text/plain', text)
    e.preventDefault()
    clip.current = { text, rows, r: sel.r1, c: sel.c1 }
    if (cut) clear()
  }
  
  const onPaste = (e: ClipboardEvent) => {
    if (editing) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const internal = clip.current && clip.current.text === text.replace(/\r\n/g, '\n').replace(/\n$/, '') ? clip.current : null
    const grid = internal ? internal.rows : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    const out: [number, number, string][] = []
    grid.forEach((line, i) => line.forEach((v, j) => {
      const value = internal && v[0] === '=' ? '=' + offsetFormula(v.slice(1), sel.r1 - internal.r, sel.c1 - internal.c) : v
      out.push([sel.r1 + i, sel.c1 + j, value])
    }))
    commit(setValue(out))
    setAnchor({ r: sel.r1, c: sel.c1 })
    setFocus({ r: sel.r1 + grid.length - 1, c: sel.c1 + Math.max(...grid.map((l) => l.length)) - 1 })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (editing) return
    const mod = e.ctrlKey || e.metaKey
    const ext = e.shiftKey
    const f = focus
    const go = (dr: number, dc: number) => { e.preventDefault(); select({ r: f.r + dr, c: f.c + dc }, ext) }
    switch (e.key) {
      case 'ArrowDown': return mod ? (e.preventDefault(), select({ r: Math.max(used.rows - 1, 0), c: f.c }, ext)) : go(1, 0)
      case 'ArrowUp': return mod ? (e.preventDefault(), select({ r: 0, c: f.c }, ext)) : go(-1, 0)
      case 'ArrowLeft': return mod ? (e.preventDefault(), select({ r: f.r, c: 0 }, ext)) : go(0, -1)
      case 'ArrowRight': return mod ? (e.preventDefault(), select({ r: f.r, c: Math.max(used.cols - 1, 0) }, ext)) : go(0, 1)
      case 'Tab': return go(0, ext ? -1 : 1)
      case 'Enter': e.preventDefault(); return ext ? select({ r: f.r - 1, c: f.c }) : startEdit(f)
      case 'F2': e.preventDefault(); return startEdit(f)
      case 'PageDown': return go(20, 0)
      case 'PageUp': return go(-20, 0)
      case 'Delete': case 'Backspace': e.preventDefault(); return clear()
      case 'Home': return mod ? (e.preventDefault(), select({ r: 0, c: 0 })) : go(0, -f.c)
    }
    if (mod) {
      const k = e.key.toLowerCase()
      if (k === 'z') { e.preventDefault(); return ext ? redo() : undo() }
      if (k === 'y') { e.preventDefault(); return redo() }
      if (k === 'b') { e.preventDefault(); return toggle('b') }
      if (k === 'i') { e.preventDefault(); return toggle('i') }
      if (k === 'd') { e.preventDefault(); return fillDown() }
      if (k === 'a') { e.preventDefault(); setAnchor({ r: 0, c: 0 }); setFocus({ r: Math.max(used.rows - 1, 0), c: Math.max(used.cols - 1, 0) }) }
      return
    }
    if (e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(f, e.key) }
  }

  // ── estructura ──
  const mutate = (axis: 'row' | 'col', at: number, count: number) => {
    commit(resize(book, si, axis, at, count))
    if (count < 0) select({ r: axis === 'row' ? Math.min(focus.r, at) : focus.r, c: axis === 'col' ? Math.min(focus.c, at) : focus.c })
  }
  const addSheet = () => {
    let n = book.sheets.length + 1
    while (book.sheets.some((s) => s.name === `Hoja ${n}`)) n++
    commit({ sheets: [...book.sheets, emptySheet(`Hoja ${n}`)] })
    setSi(book.sheets.length)
  }
  const renameSheet = (i: number, name: string) => {
    const clean = name.trim().replace(/[[\]:*?/\\']/g, '').slice(0, 31)
    setRenaming(null)
    if (!clean || clean === book.sheets[i].name || book.sheets.some((s, j) => j !== i && s.name.toLowerCase() === clean.toLowerCase())) return
    const old = book.sheets[i].name
    const q = (n: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`)
    commit({
      sheets: book.sheets.map((s, j) => ({
        ...s,
        name: j === i ? clean : s.name,
        cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v[0] === '=' ? { ...c, v: c.v.split(`${q(old)}!`).join(`${q(clean)}!`) } : c])),
      })),
    })
  }
  const deleteSheet = (i: number) => {
    if (book.sheets.length < 2 || !window.confirm(`¿Eliminar «${book.sheets[i].name}»?`)) return
    commit({ sheets: book.sheets.filter((_, j) => j !== i) })
    setSi(Math.max(0, Math.min(si, book.sheets.length - 2)))
  }

  // ── archivos ──
  const fileName = (ext: string) => `${title.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'hoja'}.${ext}`
  const open = async (f?: File) => {
    if (!f) return
    setError(undefined)
    try {
      const n = f.name.toLowerCase()
      let next: Workbook
      if (n.endsWith('.xlsx')) next = await importXlsx(await f.arrayBuffer())
      else next = { sheets: [sheetFromRows('Hoja 1', parseCsv(await f.text()))] }
      commit(next)
      setSi(0); setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 })
      setTitle(f.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError(e instanceof Error && e.message ? `No se pudo abrir el archivo: ${e.message}` : 'No se pudo abrir el archivo.')
    }
  }
  const reset = () => {
    if (Object.keys(sheet.cells).length && !window.confirm('¿Empezar una hoja nueva? Se perderá el contenido actual.')) return
    commit(emptyBook()); setSi(0); setTitle('Hoja de cálculo sin título'); setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 })
    try { localStorage.removeItem(STORAGE) } catch { /* nada que borrar */ }
  }

  // ── cabecera de columnas: cambiar ancho ──
  const startResize = (c: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX
    const w0 = widths[c]
    const move = (m: MouseEvent) => setBook((b) => ({ sheets: b.sheets.map((s, i) => (i === si ? { ...s, colW: { ...s.colW, [c]: Math.max(36, w0 + m.clientX - x0) } } : s)) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  useEffect(() => {
    const up = () => { dragging.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_H) - 3)
  const lastRow = Math.min(rowCount - 1, firstRow + Math.ceil(scroll.height / ROW_H) + 6)
  const rows = Array.from({ length: lastRow - firstRow + 1 }, (_, i) => firstRow + i)

  const inSel = (r: number, c: number) => r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2
  const barText = editing ? editing.text : activeCell?.v ?? ''

  return (
    <div className="flex flex-col">
      <div className="z-30 border-b border-line bg-white/95 backdrop-blur md:sticky md:top-16">
        <div className="mx-auto max-w-7xl px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Link to="/taller" className="text-sm text-ink/55 hover:text-brand">← Taller</Link>
            <div className="order-last flex min-w-0 basis-full flex-col sm:order-none sm:basis-0 sm:flex-1 sm:flex-row sm:items-center sm:gap-3">
              <input aria-label="Nombre de la hoja de cálculo" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 rounded-lg bg-transparent px-2 py-1 font-display text-lg font-bold hover:bg-ink/5 focus:bg-ink/5 focus:outline-none sm:flex-1" />
              <span role="status" className="shrink-0 px-2 text-xs text-ink/45">{saved === 'saving' ? 'Guardando…' : 'Guardado en este navegador'}</span>
            </div>
            <input ref={openInput} type="file" hidden accept=".xlsx,.csv,.tsv,.txt" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
            <Btn title="Hoja nueva" onClick={reset}><FilePlus2 size={17} /></Btn>
            <Btn title="Abrir un archivo (.xlsx, .csv)" onClick={() => openInput.current?.click()}><FolderOpen size={17} /></Btn>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"><Download size={16} /> Descargar <ChevronDown size={14} /></button>
              {menu && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-2xl border border-line bg-white py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10" onClick={async () => { setMenu(false); saveAs(await exportXlsx(book), fileName('xlsx')) }}>Excel (.xlsx)</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-brand/10" onClick={() => { setMenu(false); saveAs(new Blob(['﻿' + toCsv(sheetToRows(book, si), ';')], { type: 'text/csv;charset=utf-8' }), fileName('csv')) }}>CSV de esta hoja (.csv)</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-0.5">
            <Btn title="Deshacer (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={16} /></Btn>
            <Btn title="Rehacer (Ctrl+Y)" disabled={!future.length} onClick={redo}><Redo2 size={16} /></Btn>
            <div role="tablist" aria-label="Grupos de herramientas" className="ml-auto flex gap-1 rounded-full bg-paper p-1 text-sm font-semibold md:hidden">
              {([['formato', 'Formato'], ['celdas', 'Filas y columnas']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(id)}
                  className={`rounded-full px-3 py-1 transition ${tab === id ? 'bg-ink text-white' : 'text-ink/65'}`}>{label}</button>
              ))}
            </div>
            <Sep />
            <div className={group('formato')}>
            <Btn title="Negrita (Ctrl+B)" active={allHave((s) => !!s.b)} onClick={() => toggle('b')}><Bold size={16} /></Btn>
            <Btn title="Cursiva (Ctrl+I)" active={allHave((s) => !!s.i)} onClick={() => toggle('i')}><Italic size={16} /></Btn>
            <ColorPopover title="Color del texto" value={activeCell?.s?.color ?? '#16152b'} onPick={(c) => applyStyle((st) => ({ ...st, color: c }))} onClear={() => applyStyle((st) => ({ ...st, color: undefined }))} clearLabel="Color automático"
              icon={<span className="flex flex-col items-center text-sm font-bold leading-none">A<span className="mt-0.5 block h-[3px] w-4 rounded" style={{ background: activeCell?.s?.color ?? '#16152b' }} /></span>} />
            <ColorPopover title="Color de relleno" value={activeCell?.s?.bg ?? FILLS[0]} palette={FILLS} onPick={(c) => applyStyle((st) => ({ ...st, bg: c }))} onClear={() => applyStyle((st) => ({ ...st, bg: undefined }))} clearLabel="Sin relleno"
              icon={<Paintbrush size={16} />} />
            <Sep />
            <Btn title="Alinear a la izquierda" active={allHave((s) => s.align === 'left')} onClick={() => applyStyle((s) => ({ ...s, align: s.align === 'left' ? undefined : 'left' }))}><AlignLeft size={16} /></Btn>
            <Btn title="Centrar" active={allHave((s) => s.align === 'center')} onClick={() => applyStyle((s) => ({ ...s, align: s.align === 'center' ? undefined : 'center' }))}><AlignCenter size={16} /></Btn>
            <Btn title="Alinear a la derecha" active={allHave((s) => s.align === 'right')} onClick={() => applyStyle((s) => ({ ...s, align: s.align === 'right' ? undefined : 'right' }))}><AlignRight size={16} /></Btn>
            <span className="ml-1"><MiniSelect label="Formato de número" className="w-32" value={activeCell?.s?.fmt ?? ''} options={FORMATS} onChange={(v) => applyStyle((st) => ({ ...st, fmt: v || undefined }))} /></span>
            </div>
            <Sep />
            <div className={group('celdas')}>
            <Btn title="Insertar fila encima" onClick={() => mutate('row', sel.r1, 1)}><Plus size={13} /><Rows3 size={16} /></Btn>
            <Btn title="Insertar columna a la izquierda" onClick={() => mutate('col', sel.c1, 1)}><Plus size={13} /><Columns3 size={16} /></Btn>
            <Btn title="Eliminar las filas seleccionadas" onClick={() => mutate('row', sel.r1, -(sel.r2 - sel.r1 + 1))}><Trash2 size={13} /><Rows3 size={16} /></Btn>
            <Btn title="Eliminar las columnas seleccionadas" onClick={() => mutate('col', sel.c1, -(sel.c2 - sel.c1 + 1))}><Trash2 size={13} /><Columns3 size={16} /></Btn>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="w-16 rounded-lg bg-paper px-2 py-1 text-center text-xs font-semibold" aria-label="Celda activa">{sel.r1 === sel.r2 && sel.c1 === sel.c2 ? cellName(focus.r, focus.c) : `${cellName(sel.r1, sel.c1)}:${cellName(sel.r2, sel.c2)}`}</span>
            <span className="text-sm font-semibold italic text-ink/40">fx</span>
            <input aria-label="Barra de fórmulas" value={barText} placeholder="Escribe un valor o una fórmula como =SUM(A1:A5)"
              onFocus={() => { if (!editing) setEditing({ pos: focus, text: activeCell?.v ?? '', fromBar: true }) }}
              onChange={(e) => setEditing({ pos: editing?.pos ?? focus, text: e.target.value, fromBar: true })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishEdit('down') } else if (e.key === 'Escape') finishEdit('none', false) }}
              onBlur={() => { if (editing?.fromBar) finishEdit() }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm" />
          </div>
          {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
        </div>
      </div>

      <div
        ref={box}
        tabIndex={0}
        role="grid"
        aria-label="Hoja de cálculo"
        aria-rowcount={rowCount}
        aria-colcount={colCount}
        onKeyDown={onKeyDown}
        onBeforeInput={(e) => { const d = (e.nativeEvent as InputEvent).data; if (!editing && d && e.target === e.currentTarget) { e.preventDefault(); startEdit(focus, d) } }}
        onCopy={(e) => onCopy(e)}
        onCut={(e) => onCopy(e, true)}
        onPaste={onPaste}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        className="relative mx-auto h-[calc(100vh-17rem)] min-h-[360px] w-full max-w-7xl overflow-auto bg-white text-sm outline-none"
      >
        <div className="sticky top-0 z-20 flex border-b border-line bg-paper" style={{ width: totalW, height: HEAD_H }}>
          <div className="sticky left-0 z-30 shrink-0 border-r border-line bg-paper" style={{ width: GUTTER }} />
          {widths.map((w, c) => (
            <div key={c} role="columnheader" onMouseDown={(e) => { if (e.shiftKey) setFocus({ r: Math.max(used.rows - 1, 0), c }); else { setAnchor({ r: 0, c }); setFocus({ r: Math.max(used.rows - 1, 0), c }) } box.current?.focus(); e.preventDefault() }}
              className={`relative shrink-0 select-none border-r border-line text-center text-xs font-semibold leading-[26px] ${sel.c1 <= c && c <= sel.c2 ? 'bg-brand/15 text-brand' : 'text-ink/60'}`} style={{ width: w }}>
              {colName(c)}
              <span onMouseDown={(e) => startResize(c, e)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize" />
            </div>
          ))}
        </div>
        <div className="relative" style={{ width: totalW, height: rowCount * ROW_H }}>
          {rows.map((r) => (
            <div key={r} role="row" className="absolute left-0 flex" style={{ top: r * ROW_H, height: ROW_H, width: totalW }}>
              <div role="rowheader" onMouseDown={(e) => { setAnchor({ r, c: 0 }); setFocus({ r, c: Math.max(used.cols - 1, 0) }); box.current?.focus(); e.preventDefault() }}
                className={`sticky left-0 z-10 shrink-0 select-none border-b border-r border-line text-center text-xs font-semibold leading-[26px] ${sel.r1 <= r && r <= sel.r2 ? 'bg-brand/15 text-brand' : 'bg-paper text-ink/60'}`} style={{ width: GUTTER }}>
                {r + 1}
              </div>
              {widths.map((w, c) => {
                const cell = sheet.cells[key(r, c)]
                const value = ev.value(sheet.name, r, c)
                const isActive = focus.r === r && focus.c === c
                const isEditing = editing && !editing.fromBar && editing.pos.r === r && editing.pos.c === c
                const err = value !== null && typeof value === 'object'
                const align = cell?.s?.align ?? (typeof value === 'number' ? 'right' : err ? 'center' : 'left')
                return (
                  <div key={c} role="gridcell" aria-selected={inSel(r, c)}
                    onMouseDown={(e) => { if (isEditing) return; tappedActive.current = isActive; if (editing) finishEdit(); dragging.current = true; select({ r, c }, e.shiftKey); box.current?.focus(); e.preventDefault() }}
                    onMouseEnter={() => { if (dragging.current) setFocus({ r, c }) }}
                    onDoubleClick={() => startEdit({ r, c })}
                    onClick={() => { if (tappedActive.current && !editing && window.matchMedia('(pointer: coarse)').matches) startEdit({ r, c }) }}
                    className={`relative shrink-0 select-none overflow-hidden whitespace-nowrap border-b border-r border-line/70 px-1.5 leading-[25px] ${isActive ? 'z-[5] outline outline-2 -outline-offset-1 outline-brand' : inSel(r, c) ? 'bg-brand/10' : ''}`}
                    style={{
                      width: w, textAlign: align, fontWeight: cell?.s?.b ? 700 : undefined, fontStyle: cell?.s?.i ? 'italic' : undefined,
                      color: err ? '#dc2626' : cell?.s?.color, backgroundColor: !inSel(r, c) ? cell?.s?.bg : undefined,
                    }}>
                    {isEditing ? (
                      <input autoFocus value={editing.text} onChange={(e) => setEditing({ pos: editing.pos, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); finishEdit('down') }
                          else if (e.key === 'Tab') { e.preventDefault(); finishEdit('right') }
                          else if (e.key === 'Escape') { e.preventDefault(); finishEdit('none', false) }
                          e.stopPropagation()
                        }}
                        onBlur={() => finishEdit()}
                        onFocus={(e) => { const len = e.target.value.length; e.target.setSelectionRange(len, len) }}
                        className="absolute inset-0 w-full bg-white px-1.5 text-sm outline-none" style={{ textAlign: align }} />
                    ) : formatValue(value, cell?.s?.fmt)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto border-t border-line bg-paper px-2 py-1.5">
        {book.sheets.map((s, i) => (
          <div key={i} className={`flex shrink-0 items-center rounded-lg text-sm ${i === si ? 'bg-white font-semibold shadow-sm ring-1 ring-brand/40' : 'hover:bg-white/70'}`}>
            {renaming === i ? (
              <input autoFocus defaultValue={s.name} onBlur={(e) => renameSheet(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameSheet(i, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null) }} className="w-28 rounded-lg px-2 py-1 text-sm outline-none ring-1 ring-brand" />
            ) : (
              <button onClick={() => { setSi(i); setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 }); setEditing(null) }} onDoubleClick={() => setRenaming(i)} title="Doble clic para cambiar el nombre" className="px-3 py-1">{s.name}</button>
            )}
            {i === si && book.sheets.length > 1 && renaming !== i && <button aria-label={`Eliminar ${s.name}`} title="Eliminar hoja" onClick={() => deleteSheet(i)} className="pr-2 text-ink/40 hover:text-red-600"><Trash2 size={13} /></button>}
          </div>
        ))}
        <button onClick={addSheet} title="Añadir hoja" aria-label="Añadir hoja" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-white"><Plus size={16} /></button>
        <span className="ml-auto shrink-0 pl-4 text-xs text-ink/45">Fórmulas: =SUM, =AVERAGE, =IF, =VLOOKUP… · Ctrl+D rellena hacia abajo</span>
      </div>
    </div>
  )
}
