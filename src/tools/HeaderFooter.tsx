import { useEffect, useRef, useState } from 'react'
import { PageCanvas } from '../components/PageCanvas'
import { ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Button, Checkbox, ColorField, NumberField, PagePager, Slider } from '../components/ui'
import { baseName } from '../lib/files'
import { ALIGNS, addHeaderFooter, baselineFromEdge, emptyBlock, fillVariables, isBlockEmpty, pageHasText, toWinAnsi } from '../lib/pdf/headerfooter'
import type { HFAlign, HFBand, HFBlock } from '../lib/pdf/headerfooter'
import { pdfBlob } from '../lib/pdf/ops'
import { useFitWidth } from '../lib/useFitWidth'
import { usePdf } from '../lib/usePdf'

const VARS = ['{pagina}', '{total}', '{fecha}', '{archivo}']
const PLACEHOLDER: Record<HFAlign, string> = { l: 'Izquierda', c: 'Centro', r: 'Derecha' }
const BAND_LABEL: Record<HFBand, string> = { header: 'Encabezado (arriba)', footer: 'Pie (abajo)' }
const A4 = { w: 595, h: 842 }

interface OverlayProps {
  header: HFBlock
  footer: HFBlock
  size: number
  color: string
  margin: number
  show: boolean
  scale: number
  vars: { page: number; total: number; file: string }
}

/** Texto superpuesto en su sitio, con las variables ya sustituidas para la página que se ve */
function TextOverlay({ header, footer, size, color, margin, show, scale, vars }: OverlayProps) {
  if (!show) return null
  const date = new Date()
  return (
    <>
      {(['header', 'footer'] as const).flatMap((band) => ALIGNS.map((a) => {
        const text = toWinAnsi(fillVariables((band === 'header' ? header : footer)[a], { ...vars, date })).trim()
        if (!text) return null
        // con interlineado 1 la línea base cae a ~0,85 del alto de la caja
        const base = baselineFromEdge(band, size, margin)
        const side = a === 'l' ? { left: margin * scale } : a === 'r' ? { right: margin * scale } : { left: '50%', transform: 'translateX(-50%)' }
        const vertical = band === 'header' ? { top: (base - size * 0.85) * scale } : { bottom: (base - size * 0.15) * scale }
        return (
          <span key={`${band}${a}`} className="absolute whitespace-nowrap font-sans" style={{ ...side, ...vertical, fontSize: size * scale, lineHeight: 1, color }}>
            {text}
          </span>
        )
      }))}
    </>
  )
}

/** Hoja simulada para cuando todavía no se ha podido dibujar la página real */
function SimSheet({ width, children }: { width: number; children: (scale: number) => React.ReactNode }) {
  const scale = width / A4.w
  return (
    <div className="relative shrink-0 overflow-hidden bg-white shadow-lg" style={{ width, height: A4.h * scale }}>
      <div className="absolute inset-x-[10%] top-[12%] flex flex-col gap-2">
        {[100, 92, 100, 70, 100, 85, 100, 60, 100, 90].map((w, i) => <span key={i} className="block h-[5px] rounded bg-ink/10" style={{ width: `${w}%` }} />)}
      </div>
      {children(scale)}
    </div>
  )
}

function HeaderFooterWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const name = baseName(file)
  const { pdf, numPages, error } = usePdf(file)
  const [header, setHeader] = useState<HFBlock>(emptyBlock)
  const [footer, setFooter] = useState<HFBlock>(() => ({ ...emptyBlock(), c: 'Página {pagina} de {total}' }))
  const [size, setSize] = useState(10)
  const [color, setColor] = useState('#16152b')
  const [margin, setMargin] = useState(28)
  const [from, setFrom] = useState(1)
  const [skipFirst, setSkipFirst] = useState(false)
  const [page, setPage] = useState(1)
  const [focus, setFocus] = useState<`${HFBand}-${HFAlign}`>('footer-c')
  const inputs = useRef<Partial<Record<string, HTMLInputElement | null>>>({})
  const pageWidth = useFitWidth(380)

  useEffect(() => { setPage((p) => Math.min(Math.max(1, p), Math.max(1, numPages))) }, [numPages])

  const setBlock = (band: HFBand, a: HFAlign, v: string) => (band === 'header' ? setHeader : setFooter)((b) => ({ ...b, [a]: v }))

  const insertVar = (v: string) => {
    const [band, a] = focus.split('-') as [HFBand, HFAlign]
    const el = inputs.current[focus]
    const cur = (band === 'header' ? header : footer)[a]
    const s = el?.selectionStart ?? cur.length
    const e = el?.selectionEnd ?? cur.length
    setBlock(band, a, cur.slice(0, s) + v + cur.slice(e))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length) })
  }

  const empty = isBlockEmpty(header) && isBlockEmpty(footer)
  const total = numPages || 3
  const shownPage = numPages ? page : 2
  const show = pageHasText(shownPage, { from, skipFirst })
  const overlay = (scale: number) => (
    <TextOverlay header={header} footer={footer} size={size} color={color} margin={margin} show={show} scale={scale} vars={{ page: shownPage, total, file: name }} />
  )

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold">Así se verá{numPages ? '' : ' (ejemplo)'}</p>
          {pdf && !error ? (
            <PageCanvas pdf={pdf} pageNum={page} width={pageWidth}>
              {(info) => <div className="pointer-events-none absolute inset-0">{overlay(info.scale)}</div>}
            </PageCanvas>
          ) : (
            <SimSheet width={pageWidth}>{(scale) => <div className="pointer-events-none absolute inset-0">{overlay(scale)}</div>}</SimSheet>
          )}
          {numPages > 0 && <PagePager page={page} total={numPages} onChange={setPage} />}
          {numPages > 0 && !show && <p className="text-xs text-ink/55">Esta página no lleva texto con tus ajustes.</p>}
          <Button variant="ghost" size="sm" onClick={reset}>Cambiar de archivo</Button>
        </div>
      }
      side={
        <>
          {(['header', 'footer'] as const).map((band) => (
            <fieldset key={band} className="flex min-w-0 flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold">{BAND_LABEL[band]}</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {ALIGNS.map((a) => (
                  <input
                    key={a}
                    ref={(el) => { inputs.current[`${band}-${a}`] = el }}
                    aria-label={`${BAND_LABEL[band]}, ${PLACEHOLDER[a].toLowerCase()}`}
                    placeholder={PLACEHOLDER[a]}
                    className={`${inputCls} min-w-0 px-2 text-sm`}
                    value={(band === 'header' ? header : footer)[a]}
                    onFocus={() => setFocus(`${band}-${a}`)}
                    onChange={(e) => setBlock(band, a, e.target.value)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Insertar en la caja elegida</span>
            <div className="flex flex-wrap gap-1.5">
              {VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVar(v)}
                  className="min-h-8 rounded-full border border-line bg-white px-3 font-mono text-xs text-ink/80 transition hover:border-brand hover:text-brand pointer-coarse:min-h-10"
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink/55">Página actual, total de páginas, fecha de hoy y nombre del archivo.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Letra (pt)" value={size} onChange={setSize} min={6} max={36} />
            <NumberField label="Desde la página" value={from} onChange={setFrom} min={1} max={numPages || undefined} />
          </div>
          <ColorField label="Color" value={color} onChange={setColor} />
          <Slider label="Margen al borde" value={margin} onChange={setMargin} min={10} max={80} unit="pt" />
          <Checkbox checked={skipFirst} onChange={setSkipFirst} label="Omitir la primera página" description="Útil si empieza con una portada." />
        </>
      }
      action={{
        label: 'Añadir encabezado y pie',
        disabled: empty || !numPages,
        onClick: () => run(async (progress) => [{
          name: `${name}_con_encabezado.pdf`,
          blob: pdfBlob(await addHeaderFooter(file, { header, footer, size, color, margin, from, skipFirst }, name, progress)),
        }]),
      }}
    />
  )
}

export default function HeaderFooter() {
  return <ToolFrame id="header-footer" accept=".pdf">{(ctx) => <HeaderFooterWork {...ctx} />}</ToolFrame>
}
