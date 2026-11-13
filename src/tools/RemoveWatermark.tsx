import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from 'lucide-react'
import { PageCanvas } from '../components/PageCanvas'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { analyzeWatermarks, removeWatermarks } from '../lib/pdf/watermark'
import type { Confidence, WmAnalysis } from '../lib/pdf/watermark'
import { useFitWidth } from '../lib/useFitWidth'
import { usePdf } from '../lib/usePdf'

const CHIP: Record<Confidence, string> = {
  alta: 'bg-emerald-100 text-emerald-800',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-gray-100 text-gray-600',
}
const CHIP_LABEL: Record<Confidence, string> = { alta: 'Probable marca de agua', media: 'Quizá sea una marca', baja: 'Parece un encabezado o un pie' }

function Work({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [analysis, setAnalysis] = useState<WmAnalysis>()
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState<string>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [after, setAfter] = useState<File>()
  const width = useFitWidth(300, 96)
  const afterPdf = usePdf(after ?? file).pdf

  // 1. buscar qué parece una marca de agua
  useEffect(() => {
    if (!pdf) return
    let alive = true
    analyzeWatermarks(pdf, file, (f) => alive && setProgress(f)).then(
      (a) => {
        if (!alive) return
        setAnalysis(a)
        setSelected(new Set(a.candidates.filter((c) => c.confidence === 'alta').map((c) => c.id)))
      },
      () => alive && setFailure('No se pudo analizar este PDF.'),
    )
    return () => { alive = false }
  }, [pdf, file])

  // 2. cómo queda con lo elegido (se ve la página ya sin la marca, no un tapado)
  useEffect(() => {
    if (!analysis) return
    if (!selected.size) { setAfter(undefined); return }
    let alive = true
    const timer = setTimeout(() => {
      removeWatermarks(file, analysis, selected).then(({ bytes }) => { if (alive) setAfter(new File([bytes as BlobPart], file.name, { type: 'application/pdf' })) }, () => undefined)
    }, 150)
    return () => { alive = false; clearTimeout(timer) }
  }, [analysis, selected, file])

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const main = error || failure ? <p className="text-center text-red-600">{error ?? failure}</p> : (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3 text-sm">
        <button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft /></button>
        <span>Página {page} de {numPages || '…'}</span>
        <button aria-label="Página siguiente" disabled={page >= numPages} onClick={() => setPage(page + 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronRight /></button>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-6">
        {([['Antes', pdf], ['Después', afterPdf]] as const).map(([label, doc]) => (
          <figure key={label} className="flex flex-col items-center gap-1.5">
            <figcaption className="text-sm font-semibold">{label}</figcaption>
            {doc ? <PageCanvas pdf={doc} pageNum={page} width={width} /> : <div className="animate-pulse bg-gray-200" style={{ width, height: width * 1.3 }} />}
          </figure>
        ))}
      </div>
    </div>
  )

  const side = (
    <div className="flex flex-col gap-3">
      {!analysis && !failure && (
        <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="animate-spin" size={16} /> Buscando marcas de agua… {Math.round(progress * 100)} %</p>
      )}
      {analysis && !analysis.candidates.length && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No se encontró ninguna marca de agua que se pueda quitar. Si está dentro de una imagen (un escaneo, una foto), no se puede separar del resto.</p>
      )}
      {analysis?.candidates.map((c) => (
        <label key={c.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition ${selected.has(c.id) ? 'border-brand bg-brand/5' : 'border-gray-200 hover:bg-gray-50'}`}>
          <input type="checkbox" className="mt-1 h-4 w-4" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold" title={c.label}>{c.label}</span>
            <span className="block text-xs text-gray-500">{c.detail}</span>
            <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[c.confidence]}`}>{CHIP_LABEL[c.confidence]}</span>
          </span>
        </label>
      ))}
      <p className="flex gap-2 text-xs leading-snug text-gray-500"><ShieldAlert size={15} className="mt-0.5 shrink-0" /> Úsalo solo con documentos tuyos o que tengas permiso para modificar.</p>
    </div>
  )

  return (
    <Workspace
      main={main}
      side={side}
      action={{
        label: 'Quitar marca de agua',
        disabled: !analysis || !selected.size,
        onClick: () => run(async (progress): Promise<Output[]> => {
          progress(0.2)
          const { bytes, failed } = await removeWatermarks(file, analysis!, selected)
          progress(1)
          const note = failed.length ? `En ${failed.length === 1 ? 'la página' : 'las páginas'} ${failed.join(', ')} no se pudo quitar todo lo elegido (su contenido está organizado de otra forma).` : undefined
          return [{ name: `${baseName(file)}_sin_marca.pdf`, blob: pdfBlob(bytes), note }]
        }),
      }}
    />
  )
}

export default function RemoveWatermark() {
  return <ToolFrame id="remove-watermark" accept=".pdf">{(ctx) => <Work {...ctx} />}</ToolFrame>
}
