import { useState } from 'react'
import { Check } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { extractPages, parseRanges, pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

/** Base común de "Eliminar páginas" y "Extraer páginas": se marcan páginas sobre las miniaturas */
function SelectWork({ files, run, mode }: FrameCtx & { mode: 'delete' | 'extract' }) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [text, setText] = useState('')
  const [rangeError, setRangeError] = useState<string>()
  const del = mode === 'delete'

  const toggle = (n: number) => setSelected((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next })
  const all = Array.from({ length: numPages }, (_, i) => i + 1)

  const applyRange = () => {
    try {
      setSelected(new Set(parseRanges(text, numPages).flat()))
      setRangeError(undefined)
    } catch (e) {
      setRangeError((e as Error).message)
    }
  }

  const kept = del ? all.filter((n) => !selected.has(n)) : all.filter((n) => selected.has(n))

  return (
    <Workspace
      main={
        error ? <p className="text-center text-red-600">{error}</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] justify-items-center gap-4">
            {pdf && all.map((n) => (
              <button key={n} onClick={() => toggle(n)} className={`relative rounded-lg p-1 ${selected.has(n) ? (del ? 'bg-red-100 outline-2 outline-red-500' : 'bg-green-100 outline-2 outline-green-600') : 'hover:bg-gray-100'}`}>
                <div className={selected.has(n) && del ? 'opacity-40' : ''}><PageThumb pdf={pdf} pageNum={n} width={180} /></div>
                {selected.has(n) && <span className={`absolute right-1 top-1 rounded-full p-1 text-white ${del ? 'bg-red-500' : 'bg-green-600'}`}><Check size={12} /></span>}
                <span className="text-xs text-gray-600">{n}</span>
              </button>
            ))}
          </div>
        )
      }
      side={
        <>
          <p className="text-sm text-gray-600">{del ? 'Haz clic en las páginas que quieres eliminar.' : 'Haz clic en las páginas que quieres extraer.'}</p>
          <Field label="Seleccionar por rango">
            <div className="flex gap-2">
              <input className={`${inputCls} min-w-0 flex-1`} placeholder="1-3, 5" value={text} onChange={(e) => setText(e.target.value)} />
              <button onClick={applyRange} className="rounded-lg border border-gray-300 px-3 text-sm hover:bg-gray-50">Aplicar</button>
            </div>
            {rangeError && <span className="text-xs font-normal text-red-600">{rangeError}</span>}
          </Field>
          <div className="flex gap-2 text-sm">
            <button className="flex-1 rounded-lg border border-gray-300 py-1.5 hover:bg-gray-50" onClick={() => setSelected(new Set(all))}>Todas</button>
            <button className="flex-1 rounded-lg border border-gray-300 py-1.5 hover:bg-gray-50" onClick={() => setSelected(new Set())}>Ninguna</button>
          </div>
          <p className="text-sm">{selected.size} seleccionadas · el resultado tendrá <b>{kept.length}</b> páginas.</p>
        </>
      }
      action={{
        label: del ? 'Eliminar páginas' : 'Extraer páginas',
        disabled: !selected.size || !kept.length,
        onClick: () => run(async () => [{ name: `${baseName(file)}_${del ? 'sin-paginas' : 'extraido'}.pdf`, blob: pdfBlob(await extractPages(file, kept)) }]),
      }}
    />
  )
}

export function PageSelectTool({ id, mode }: { id: string; mode: 'delete' | 'extract' }) {
  return <ToolFrame id={id} accept=".pdf">{(ctx) => <SelectWork {...ctx} mode={mode} />}</ToolFrame>
}
