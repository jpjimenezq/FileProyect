import { useState } from 'react'
import { Check } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { Button, Notice } from '../components/ui'
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
        error ? <Notice kind="error">{error}</Notice> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] justify-items-center gap-4">
            {pdf && all.map((n) => (
              <button key={n} onClick={() => toggle(n)} aria-pressed={selected.has(n)} aria-label={`Página ${n}`} className={`relative flex flex-col items-center gap-1 rounded-xl p-1.5 ${selected.has(n) ? (del ? 'bg-red-50 outline-2 outline-red-500' : 'bg-brand/10 outline-2 outline-brand') : 'hover:bg-ink/5'}`}>
                <div className={selected.has(n) && del ? 'opacity-40' : ''}><PageThumb pdf={pdf} pageNum={n} width={180} /></div>
                {selected.has(n) && <span className={`absolute right-2 top-2 rounded-full p-1 text-white ${del ? 'bg-red-500' : 'bg-brand'}`}><Check size={12} /></span>}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${selected.has(n) ? (del ? 'bg-red-100 text-red-700' : 'bg-brand/15 text-brand') : 'bg-paper text-ink/60'}`}>{n}</span>
              </button>
            ))}
          </div>
        )
      }
      side={
        <>
          <p className="text-sm text-ink/60">{del ? 'Toca las páginas que quieres eliminar.' : 'Toca las páginas que quieres extraer.'}</p>
          <Field label="Seleccionar por rango" hint="Por ejemplo: 1-3, 5, 8-10">
            <div className="flex gap-2">
              <input className={`${inputCls} min-w-0 flex-1`} placeholder="1-3, 5" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyRange() }} />
              <Button onClick={applyRange}>Aplicar</Button>
            </div>
          </Field>
          {rangeError && <Notice kind="error">{rangeError}</Notice>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setSelected(new Set(all))}>Todas</Button>
            <Button className="flex-1" onClick={() => setSelected(new Set())}>Ninguna</Button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className={`rounded-full px-3 py-1 font-medium ${del ? 'bg-red-50 text-red-700' : 'bg-brand/10 text-brand'}`}>{selected.size} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
            <span className="rounded-full bg-paper px-3 py-1 text-ink/70">Resultado: {kept.length} {kept.length === 1 ? 'página' : 'páginas'}</span>
          </div>
          {selected.size > 0 && !kept.length && <Notice kind="warn">Así no quedaría ninguna página. Deja al menos una.</Notice>}
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
