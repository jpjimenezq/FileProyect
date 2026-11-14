import { useState } from 'react'
import { ArrowLeftRight, Columns2, Rows2, Wand2 } from 'lucide-react'
import { PageCanvas } from '../components/PageCanvas'
import { Segmented } from '../components/Illustrate'
import { ToolFrame, Workspace, Field } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Checkbox, Notice, PagePager, Switch } from '../components/ui'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { resolveCut, splitPageCount, splitPagesInHalf, splitPlan } from '../lib/pdf/pages'
import type { SplitCut, SplitMode } from '../lib/pdf/pages'
import { useFitWidth } from '../lib/useFitWidth'
import { usePdf } from '../lib/usePdf'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const MODES = [
  { value: 'auto' as const, label: 'Automático', icon: Wand2, desc: 'Las páginas apaisadas se cortan por el centro y las verticales, por la mitad de alto.' },
  { value: 'vertical' as const, label: 'Vertical', icon: Columns2, desc: 'Corte vertical: izquierda y derecha. Ideal para libros escaneados a doble página.' },
  { value: 'horizontal' as const, label: 'Horizontal', icon: Rows2, desc: 'Corte horizontal: parte de arriba y parte de abajo.' },
]

/** Línea de corte discontinua y número de cada mitad, sobre la página */
function CutOverlay({ cut, rtl }: { cut: SplitCut; rtl: boolean }) {
  const vertical = cut === 'vertical'
  const nums = vertical ? (rtl ? [2, 1] : [1, 2]) : [1, 2]
  const badge = 'flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow'
  return (
    <div className={`pointer-events-none absolute inset-0 flex ${vertical ? 'flex-row' : 'flex-col'}`}>
      {nums.map((n, i) => (
        <div key={i} className={`flex flex-1 items-start justify-center pt-2 ${i === 0 ? 'bg-brand/5' : 'bg-lime/10'}`}><span className={badge}>{n}</span></div>
      ))}
      <div className={`absolute border-dashed border-brand ${vertical ? 'inset-y-0 left-1/2 -ml-px border-l-[3px]' : 'inset-x-0 top-1/2 -mt-px border-t-[3px]'}`} />
    </div>
  )
}

function SplitWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [mode, setMode] = useState<SplitMode>('auto')
  const [skipEnds, setSkipEnds] = useState(false)
  const [rtl, setRtl] = useState(false)
  const [page, setPage] = useState(1)
  const width = useFitWidth(420)

  const cur = Math.min(page, Math.max(numPages, 1))
  const splitsCur = splitPlan(numPages, skipEnds)[cur - 1]?.split ?? true
  const result = numPages ? splitPageCount(numPages, skipEnds) : 0

  return (
    <Workspace
      main={error ? <Notice kind="error">{error}</Notice> : (
        <div className="flex flex-col items-center gap-4">
          {pdf ? (
            <>
              <PageCanvas pdf={pdf} pageNum={cur} width={width}>
                {(info) => {
                  if (!splitsCur) return null
                  const cut = resolveCut(mode, info.width, info.height, 0)
                  return <CutOverlay cut={cut} rtl={rtl} />
                }}
              </PageCanvas>
              {!splitsCur && <p className="text-sm text-ink/60">Esta página se queda entera.</p>}
              <PagePager page={cur} total={numPages} onChange={setPage} />
            </>
          ) : <p className="text-sm text-ink/60">Leyendo el PDF…</p>}
        </div>
      )}
      side={
        <>
          <div>
            <p className="font-display text-2xl font-bold">{numPages ? plural(result, 'página', 'páginas') : 'Leyendo…'}</p>
            <p className="text-sm text-ink/60">{numPages ? `en el resultado (ahora tiene ${numPages})` : 'Contando páginas'}</p>
          </div>
          <Field label="Cómo cortar"><Segmented value={mode} onChange={setMode} options={MODES} label="Tipo de corte" /></Field>
          <Checkbox checked={skipEnds} onChange={setSkipEnds} label="No dividir la primera ni la última" description="Para portadas y contraportadas sueltas." />
          <Switch checked={rtl} onChange={setRtl} label="Orden de lectura de derecha a izquierda" description="Cada corte vertical empieza por la mitad derecha." />
          {skipEnds && numPages > 0 && numPages <= 2 && <Notice kind="warn">Con {plural(numPages, 'página', 'páginas')} no se dividiría ninguna.</Notice>}
          {rtl && mode === 'horizontal' && <Notice kind="info"><span className="inline-flex items-center gap-1"><ArrowLeftRight size={14} /> Con corte horizontal el orden sigue siendo de arriba a abajo.</span></Notice>}
        </>
      }
      action={{
        label: 'Dividir páginas',
        disabled: !pdf,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_dividido.pdf`, blob: pdfBlob(await splitPagesInHalf(file, { mode, rtl, skipEnds }, (f) => progress(f))) }]),
      }}
    />
  )
}

export default function SplitHalves() {
  return <ToolFrame id="split-halves" accept=".pdf">{(ctx) => <SplitWork {...ctx} />}</ToolFrame>
}
