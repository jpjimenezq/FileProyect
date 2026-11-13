import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Files, HardDrive, Layers, Plus, Scissors, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageThumb } from '../components/PageThumb'
import { Segmented } from '../components/Illustrate'
import { Button, Checkbox, NumberField, Notice } from '../components/ui'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { splitBySize } from '../lib/pdf/layout'
import { extractPages, pdfBlob } from '../lib/pdf/ops'
import { chapterRanges, readBookmarks } from '../lib/pdf/structure'
import { usePdf } from '../lib/usePdf'
import { useFitWidth } from '../lib/useFitWidth'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Mode = 'ranges' | 'every' | 'all' | 'size' | 'chapters'
interface Range { from: number; to: number }

const validRange = (r: Range, total: number) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to <= total && r.from <= r.to
const span = (r: Range) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)

/** Cuadro punteado con la primera y la última página del grupo, como en un visor de rangos */
function RangeBox({ pdf, title, pages }: { pdf: PDFDocumentProxy; title: string; pages: number[] }) {
  const shown = pages.length <= 2 ? pages : [pages[0], pages[pages.length - 1]]
  // el cuadro se encoge en pantallas estrechas para no provocar scroll horizontal
  const fit = useFitWidth(400, 64)
  const thumb = Math.max(80, Math.min(150, Math.floor((fit - 110) / 2)))
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      <p className="text-sm text-ink/60">{title}</p>
      <div className="flex max-w-full items-center gap-2 rounded-2xl border border-dashed border-ink/25 p-2.5 sm:gap-3 sm:p-3">
        {shown.map((n, i) => (
          <div key={n} className="flex items-center gap-2 sm:gap-3">
            {i === 1 && pages.length > 2 && <span className="text-xl leading-none text-ink/45">···</span>}
            <div className="flex flex-col items-center rounded-lg bg-white p-1.5 shadow-sm sm:p-2">
              <PageThumb pdf={pdf} pageNum={n} width={thumb} />
              <span className="mt-1 rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink/60">{n}</span>
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
        note: i === 0 && big ? `${big === 1 ? '1 página pesa' : `${big} páginas pesan`} por sí ${big === 1 ? 'sola' : 'solas'} más de ${maxMb} MB y ${big === 1 ? 'va' : 'van'} en su propio archivo.` : undefined,
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
        <div className="flex flex-wrap justify-center gap-6 py-4 sm:gap-8">
          <p className="w-full text-center text-sm text-ink/60">
            <span className="break-all">{file.name}</span> · {numPages} {numPages === 1 ? 'pág.' : 'págs.'} · <button onClick={reset} className="text-brand hover:underline">Cambiar archivo</button>
          </p>
          {mode === 'size' && <Notice kind="info" className="w-full max-w-md">Cortaremos el PDF en archivos de <b>{maxMb} MB como máximo</b>. Verás cuántos salen al terminar.</Notice>}
          {pdf && groups.slice(0, LIMIT).map((g, i) => <RangeBox key={`${mode}-${i}-${g[0]}-${g[g.length - 1]}`} pdf={pdf} title={mode === 'chapters' ? chapters?.[i]?.title ?? `Capítulo ${i + 1}` : `${mode === 'ranges' ? 'Rango' : 'Archivo'} ${i + 1}`} pages={g} />)}
          {groups.length > LIMIT && <p className="self-center text-sm text-ink/60">… y {groups.length - LIMIT} más</p>}
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
                {ranges.map((r, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      Rango {i + 1}
                      {ranges.length > 1 && <button aria-label={`Quitar rango ${i + 1}`} onClick={() => setRanges(ranges.filter((_, j) => j !== i))} className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-brand pointer-coarse:h-10 pointer-coarse:w-10"><Trash2 size={16} /></button>}
                    </div>
                    <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-sm text-ink/60">
                      de
                      <NumberField ariaLabel={`Rango ${i + 1}, desde`} min={1} max={numPages} value={r.from} onChange={(v) => setRange(i, { from: v })} />
                      a
                      <NumberField ariaLabel={`Rango ${i + 1}, hasta`} min={1} max={numPages} value={r.to} onChange={(v) => setRange(i, { to: v })} />
                    </div>
                  </div>
                ))}
              </div>
              {invalid && <Notice kind="error">Usa páginas de 1 a {numPages}, con el inicio menor o igual que el final.</Notice>}
              <Button icon={Plus} className="border-brand text-brand hover:bg-brand/10" onClick={addRange}>Añadir rango</Button>
              <Checkbox checked={merge} onChange={setMerge} label="Unir todos los rangos en un único PDF" />
            </>
          )}

          {mode === 'chapters' && chapters && chapters.length === 0 && (
            <Notice kind="info">Este PDF no tiene marcadores. Puedes crearlos en <Link to="/marcadores-pdf" className="font-semibold text-brand hover:underline">Marcadores del PDF</Link>.</Notice>
          )}

          {mode === 'size' && <NumberField label="Peso máximo" unit="MB" min={0.1} step={0.5} value={maxMb} onChange={setMaxMb} />}

          {mode === 'every' && <NumberField label="Dividir cada" unit="págs." min={1} max={Math.max(1, numPages)} value={every} onChange={setEvery} />}
        </>
      }
      action={{ label: 'Dividir PDF', disabled: mode === 'size' ? !numPages || !(maxMb > 0) : !groups.length || invalid, onClick: start }}
    />
  )
}

export default function Split() {
  return <ToolFrame id="split" accept=".pdf">{(ctx) => <SplitWork {...ctx} />}</ToolFrame>
}
