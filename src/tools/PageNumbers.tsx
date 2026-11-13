import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { addPageNumbers, pdfBlob } from '../lib/pdf/ops'
import type { NumberOptions } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

const POSITIONS: NumberOptions['position'][] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

const sampleLabel = (o: NumberOptions, total: number) => {
  const n = o.first + 2 // el ejemplo se ve en la 3.ª página
  return o.format === 'n' ? `${n}` : o.format === 'page-n' ? `Página ${n}` : `Página ${n} de ${total || 10}`
}

/** Hoja en miniatura: se hace clic en una zona para elegir dónde va el número y se ve el resultado al instante */
function PositionPicker({ o, total, onPick }: { o: NumberOptions; total: number; onPick: (p: NumberOptions['position']) => void }) {
  return (
    <div className="mx-auto w-[190px]">
      <div className="relative h-[250px] rounded border border-gray-400 bg-white shadow-sm">
        {/* líneas de texto simuladas */}
        <div className="absolute inset-x-6 top-12 flex flex-col gap-2">
          {[100, 92, 100, 70, 100, 85, 100, 60].map((w, i) => <span key={i} className="block h-[5px] rounded bg-gray-200" style={{ width: `${w}%` }} />)}
        </div>
        {POSITIONS.map((p) => {
          const on = o.position === p
          return (
            <button
              key={p}
              type="button"
              aria-label={`${p[0] === 't' ? 'Arriba' : 'Abajo'} ${p[1] === 'l' ? 'izquierda' : p[1] === 'c' ? 'centro' : 'derecha'}`}
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={`absolute flex h-8 w-1/3 items-center ${p[0] === 't' ? 'top-0' : 'bottom-0'} ${p[1] === 'l' ? 'left-0 justify-start pl-1.5' : p[1] === 'c' ? 'left-1/3 justify-center' : 'right-0 justify-end pr-1.5'}`}
            >
              {on ? (
                <span className="whitespace-nowrap rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">{sampleLabel(o, total)}</span>
              ) : (
                <span className="h-3 w-3 rounded-full border-2 border-dashed border-gray-300 hover:border-brand" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NumbersWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [o, setO] = useState<NumberOptions>({ position: 'bc', format: 'n', first: 1, from: 1, size: 12, margin: 28 })
  const set = <K extends keyof NumberOptions>(k: K, v: NumberOptions[K]) => setO((p) => ({ ...p, [k]: v }))

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <Field label="¿Dónde va el número? Haz clic en la hoja">
            <PositionPicker o={o} total={numPages} onPick={(p) => set('position', p)} />
          </Field>
          <Field label="Formato">
            <Segmented<NumberOptions['format']>
              label="Formato"
              value={o.format}
              onChange={(v) => set('format', v)}
              options={[
                { value: 'n', label: '3' },
                { value: 'page-n', label: 'Página 3' },
                { value: 'page-n-of-N', label: `Pág. 3 de ${numPages || 10}` },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Empezar en">
              <input type="number" min={0} className={inputCls} value={o.first} onChange={(e) => set('first', Number(e.target.value))} />
            </Field>
            <Field label="Desde la página">
              <input type="number" min={1} max={numPages || undefined} className={inputCls} value={o.from} onChange={(e) => set('from', Math.max(1, Number(e.target.value)))} />
            </Field>
          </div>
          <Field label={`Tamaño de letra: ${o.size} pt`}>
            <input type="range" min={8} max={24} value={o.size} onChange={(e) => set('size', Number(e.target.value))} />
          </Field>
        </>
      }
      action={{
        label: 'Insertar números',
        disabled: !numPages,
        onClick: () => run(async () => [{ name: `${baseName(file)}_numerado.pdf`, blob: pdfBlob(await addPageNumbers(file, o)) }]),
      }}
    />
  )
}

export default function PageNumbers() {
  return <ToolFrame id="page-numbers" accept=".pdf">{(ctx) => <NumbersWork {...ctx} />}</ToolFrame>
}
