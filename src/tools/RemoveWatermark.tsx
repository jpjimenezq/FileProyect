import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { PageCanvas } from '../components/PageCanvas'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { Checkbox, Notice, PagePager } from '../components/ui'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { analyzeWatermarks, removeWatermarks } from '../lib/pdf/watermark'
import type { Confidence, WmAnalysis } from '../lib/pdf/watermark'
import { useFitWidth } from '../lib/useFitWidth'
import { usePdf } from '../lib/usePdf'

const CHIP: Record<Confidence, string> = {
  alta: 'bg-emerald-100 text-emerald-800',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-paper text-ink/60',
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

  const main = error || failure ? <Notice kind="error">{error ?? failure}</Notice> : (
    <div className="flex flex-col items-center gap-4">
      <PagePager page={page} total={numPages || 1} onChange={setPage} />
      <div className="flex flex-wrap items-start justify-center gap-6">
        {([['Antes', pdf], ['Después', afterPdf]] as const).map(([label, doc]) => (
          <figure key={label} className="flex flex-col items-center gap-1.5">
            <figcaption className="text-sm font-semibold">{label}</figcaption>
            {doc ? <PageCanvas pdf={doc} pageNum={page} width={width} /> : <div className="animate-pulse rounded bg-ink/10" style={{ width, height: width * 1.3 }} />}
          </figure>
        ))}
      </div>
    </div>
  )

  const pct = Math.round(progress * 100)
  const side = (
    <div className="flex flex-col gap-3">
      {!analysis && !failure && (
        <div className="flex flex-col gap-2" role="status">
          <p className="flex justify-between text-sm font-medium"><span>Buscando marcas de agua…</span><span className="tabular-nums text-ink/60">{pct} %</span></p>
          <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {analysis && !analysis.candidates.length && (
        <Notice kind="warn">No hay ninguna marca que se pueda quitar. Si va dentro de una imagen (un escaneo), no se separa del resto.</Notice>
      )}
      {analysis?.candidates.map((c) => (
        <div key={c.id} className={`rounded-xl border p-3 transition ${selected.has(c.id) ? 'border-brand bg-brand/5' : 'border-line hover:bg-paper'}`}>
          <Checkbox
            checked={selected.has(c.id)}
            onChange={() => toggle(c.id)}
            label={<span className="block truncate font-semibold" title={c.label}>{c.label}</span>}
            description={c.detail}
          />
          <span className={`ml-[1.875rem] mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[c.confidence]}`}>{CHIP_LABEL[c.confidence]}</span>
        </div>
      ))}
      <p className="flex gap-2 text-xs leading-snug text-ink/60"><ShieldAlert size={15} className="mt-0.5 shrink-0" /> Úsalo solo con documentos tuyos o que tengas permiso para modificar.</p>
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
