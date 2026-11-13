import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Files, HardDrive, Layers, Plus, Scissors, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageThumb } from '../components/PageThumb'
import { Segmented } from '../components/Illustrate'
import { ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { splitBySize } from '../lib/pdf/layout'
import { extractPages, pdfBlob } from '../lib/pdf/ops'
import { chapterRanges, readBookmarks } from '../lib/pdf/structure'
import { usePdf } from '../lib/usePdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Mode = 'ranges' | 'every' | 'all' | 'size' | 'chapters'
interface Range { from: number; to: number }

const validRange = (r: Range, total: number) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to <= total && r.from <= r.to
const span = (r: Range) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)

/** Cuadro punteado con la primera y la última página del grupo, como en un visor de rangos */
function RangeBox({ pdf, title, pages }: { pdf: PDFDocumentProxy; title: string; pages: number[] }) {
  const shown = pages.length <= 2 ? pages : [pages[0], pages[pages.length - 1]]
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-gray-600">{title}</p>
      <div className="flex items-center gap-3 rounded border border-dashed border-gray-400 p-3">
        {shown.map((n, i) => (
          <div key={n} className="flex items-center gap-3">
            {i === 1 && pages.length > 2 && <span className="text-xl leading-none text-gray-500">···</span>}
            <div className="flex flex-col items-center rounded bg-white p-2 shadow-sm">
              <PageThumb pdf={pdf} pageNum={n} width={150} />
              <span className="mt-1 text-xs text-gray-600">{n}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SplitWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages } = usePdf(file)
  const [mode, setMode] = useState<Mode>('ranges')
  const [ranges, setRanges] = useState<Range[]>([{ from: 1, to: 1 }])
  const [every, setEvery] = useState(2)
  const [merge, setMerge] = useState(false)
  const [maxMb, setMaxMb] = useState(5)
  const [chapters, setChapters] = useState<{ title: string; from: number; to: number }[]>()

  useEffect(() => { if (numPages) setRanges([{ from: 1, to: numPages }]) }, [numPages])
  useEffect(() => {
    if (!numPages) return
    readBookmarks(file).then((b) => setChapters(chapterRanges(b, numPages)), () => setChapters([]))
  }, [file, numPages])

  const setRange = (i: number, change: Partial<Range>) => setRanges((all) => all.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const addRange = () => setRanges((all) => {
    const from = Math.min(numPages, (all[all.length - 1]?.to ?? 0) + 1)
    return [...all, { from, to: numPages }]
  })

  const invalid = mode === 'ranges' && ranges.some((r) => !validRange(r, numPages))
  const groups = useMemo(() => {
    if (!numPages) return []
    if (mode === 'size') return []
    if (mode === 'chapters') return (chapters ?? []).map((c) => span({ from: c.from, to: c.to }))
    if (mode === 'ranges') return ranges.filter((r) => validRange(r, numPages)).map(span)
    const step = mode === 'all' ? 1 : Math.max(1, Math.floor(every) || 1)
    const all = Array.from({ length: numPages }, (_, i) => i + 1)
    return Array.from({ length: Math.ceil(numPages / step) }, (_, i) => all.slice(i * step, (i + 1) * step))
  }, [mode, ranges, every, numPages, chapters])

  const start = () => run(async (progress): Promise<Output[]> => {
    if (mode === 'size') {
      const parts = await splitBySize(file, maxMb * 1024 * 1024, progress)
      const big = parts.filter((p) => p.oversize).length
      return parts.map((p, i) => ({
        name: `${baseName(file)}_${i + 1}.pdf`,
        blob: pdfBlob(p.bytes),
        note: i === 0 && big ? `${big} página(s) pesan por sí solas más de ${maxMb} MB: van en su propio archivo.` : undefined,
      }))
    }
    if (mode === 'ranges' && merge) return [{ name: `${baseName(file)}_dividido.pdf`, blob: pdfBlob(await extractPages(file, groups.flat())) }]
    const out: Output[] = []
    for (const [i, g] of groups.entries()) {
      const title = mode === 'chapters' ? `_${(chapters?.[i]?.title ?? '').replace(/[^p{L}p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)}` : ''
      out.push({ name: `${baseName(file)}_${i + 1}${title}.pdf`, blob: pdfBlob(await extractPages(file, g)) })
      progress((i + 1) / groups.length)
    }
    return out
  })

  const LIMIT = 8
  return (
    <Workspace
      main={
        <div className="flex flex-wrap justify-center gap-8 py-4">
          <p className="w-full text-center text-sm text-gray-500">
            {file.name} · {numPages} págs. · <button onClick={reset} className="text-brand hover:underline">Cambiar archivo</button>
          </p>
          {mode === 'size' && <p className="w-full max-w-md rounded-2xl bg-paper p-5 text-center text-sm text-ink/65">Cortaremos el PDF en archivos de <b>{maxMb} MB como máximo</b>, con el mayor número de páginas posible en cada uno. Verás cuántos salen al terminar.</p>}
          {pdf && groups.slice(0, LIMIT).map((g, i) => <RangeBox key={`${mode}-${i}-${g[0]}-${g[g.length - 1]}`} pdf={pdf} title={mode === 'chapters' ? chapters?.[i]?.title ?? `Capítulo ${i + 1}` : `${mode === 'ranges' ? 'Rango' : 'Archivo'} ${i + 1}`} pages={g} />)}
          {groups.length > LIMIT && <p className="self-center text-sm text-gray-500">… y {groups.length - LIMIT} más</p>}
        </div>
      }
      side={
        <>
          <Segmented<Mode>
            label="Modo de división"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ranges', label: 'Rango', icon: Scissors, desc: 'Elige de qué página a qué página. Cada rango es un PDF.' },
              { value: 'every', label: 'Cada N', icon: Layers, desc: 'Trozos con el mismo número de páginas.' },
              { value: 'all', label: 'Todas', icon: Files, desc: 'Cada página se guarda como un PDF.' },
              { value: 'chapters', label: 'Capítulos', icon: BookOpen, desc: 'Un archivo por cada capítulo, según los marcadores del PDF.' },
              { value: 'size', label: 'Tamaño', icon: HardDrive, desc: 'Archivos que no pesen más de lo que indiques (útil para enviar por correo).' },
            ]}
          />

          {mode === 'ranges' && (
            <>
              <div className="flex flex-col gap-3">
                {ranges.map((r, i) => {
                  const bad = !validRange(r, numPages)
                  return (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm font-medium">
                        Rango {i + 1}
                        {ranges.length > 1 && <button aria-label={`Quitar rango ${i + 1}`} onClick={() => setRanges(ranges.filter((_, j) => j !== i))} className="text-gray-400 hover:text-brand"><Trash2 size={15} /></button>}
                      </div>
                      <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-sm text-gray-600">
                        de
                        <input type="number" min={1} max={numPages} aria-label={`Rango ${i + 1}, desde`} className={`${inputCls} ${bad ? 'border-red-400' : ''}`} value={r.from} onChange={(e) => setRange(i, { from: Number(e.target.value) })} />
                        a
                        <input type="number" min={1} max={numPages} aria-label={`Rango ${i + 1}, hasta`} className={`${inputCls} ${bad ? 'border-red-400' : ''}`} value={r.to} onChange={(e) => setRange(i, { to: Number(e.target.value) })} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {invalid && <p className="text-xs text-red-600">Cada rango debe estar entre 1 y {numPages}, con el inicio menor o igual que el final.</p>}
              <button onClick={addRange} className="flex items-center justify-center gap-1.5 rounded-lg border border-brand py-2 text-sm font-semibold text-brand hover:bg-brand/10"><Plus size={16} /> Añadir rango</button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> Unir todos los rangos en un único PDF</label>
            </>
          )}

          {mode === 'chapters' && chapters && chapters.length === 0 && (
            <p className="rounded-xl bg-paper p-3 text-sm text-ink/65">Este PDF no tiene marcadores. Puedes crearlos en <Link to="/marcadores-pdf" className="font-semibold text-brand hover:underline">Marcadores del PDF</Link>.</p>
          )}

          {mode === 'size' && (
            <label className="flex items-center gap-2 text-sm">
              Peso máximo
              <input type="number" min={0.1} step={0.5} className={`${inputCls} w-24`} value={maxMb} onChange={(e) => setMaxMb(Number(e.target.value))} />
              MB
            </label>
          )}

          {mode === 'every' && (
            <label className="flex items-center gap-2 text-sm">
              Dividir cada
              <input type="number" min={1} max={Math.max(1, numPages)} className={`${inputCls} w-20`} value={every} onChange={(e) => setEvery(Number(e.target.value))} />
              páginas
            </label>
          )}
        </>
      }
      action={{ label: 'Dividir PDF', disabled: mode === 'size' ? !numPages || !(maxMb > 0) : !groups.length || invalid, onClick: start }}
    />
  )
}

export default function Split() {
  return <ToolFrame id="split" accept=".pdf">{(ctx) => <SplitWork {...ctx} />}</ToolFrame>
}
