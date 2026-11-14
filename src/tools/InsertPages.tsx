import { useEffect, useRef, useState } from 'react'
import { FilePlus, FileText, Plus, Undo2, X } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Button, FileButton, Notice } from '../components/ui'
import { baseName } from '../lib/files'
import { pageCount, pdfBlob } from '../lib/pdf/ops'
import { insertPages } from '../lib/pdf/pages'
import type { InsertSpec } from '../lib/pdf/pages'
import { usePdf } from '../lib/usePdf'

type Item = { id: string; at: number; file?: File; pages: number }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const where = (at: number) => (at === 0 ? 'Al principio' : `Después de la pág. ${at}`)

/** Miniaturas más pequeñas en móvil para que quepan dos por fila con su «+» */
function useThumbWidth() {
  const [w, setW] = useState(130)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const on = () => setW(mq.matches ? 130 : 96)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return w
}

/** Botón «+» entre dos páginas */
function Slot({ at, count, active, onClick }: { at: number; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${where(at)}: insertar páginas${count ? ` (${plural(count, 'inserción', 'inserciones')})` : ''}`}
      aria-pressed={active}
      className={`relative flex min-h-40 w-10 shrink-0 items-center justify-center self-stretch rounded-xl border-2 border-dashed transition ${
        active || count ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/45 hover:border-brand hover:text-brand'
      }`}
    >
      {count ? <span className="text-sm font-bold tabular-nums">+{count}</span> : <Plus size={20} />}
    </button>
  )
}

function InsertWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [items, setItems] = useState<Item[]>([])
  const [past, setPast] = useState<Item[][]>([])
  const [picker, setPicker] = useState<number>()
  const [problem, setProblem] = useState<string>()
  const seq = useRef(0)
  const thumbW = useThumbWidth()

  const change = (next: Item[]) => { setPast((p) => [...p, items]); setItems(next) }
  const add = (it: Omit<Item, 'id'>) => { change([...items, { ...it, id: `i${++seq.current}` }]); setPicker(undefined) }

  const pickPdf = async (list: File[]) => {
    const f = list[0]
    const at = picker
    if (!f || at === undefined) return
    setProblem(undefined)
    try { add({ at, file: f, pages: await pageCount(f) }) } catch { setProblem(`No se pudo leer «${f.name}». Comprueba que sea un PDF válido.`) }
  }

  const added = items.reduce((n, it) => n + it.pages, 0)
  const countAt = (at: number) => items.filter((it) => it.at === at).length
  const sorted = [...items].sort((a, b) => a.at - b.at)

  return (
    <Workspace
      main={error ? <Notice kind="error">{error}</Notice> : (
        <>
          {picker !== undefined && (
            <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-white p-3 shadow-lg">
              <p className="mr-auto text-sm font-semibold">{where(picker)}: ¿qué insertas?</p>
              <Button variant="primary" icon={FilePlus} onClick={() => add({ at: picker, pages: 1 })}>Página en blanco</Button>
              <FileButton accept=".pdf" icon={FileText} onFiles={pickPdf}>Otro PDF</FileButton>
              <Button variant="ghost" aria-label="Cancelar" onClick={() => setPicker(undefined)}><X size={16} /></Button>
            </div>
          )}
          {problem && <Notice kind="error" onClose={() => setProblem(undefined)} className="mb-4">{problem}</Notice>}
          <div className="flex flex-wrap items-start gap-x-2 gap-y-4">
            {pdf && Array.from({ length: numPages + 1 }, (_, at) => (
              <div key={at} className="flex items-start gap-2">
                <Slot at={at} count={countAt(at)} active={picker === at} onClick={() => setPicker(picker === at ? undefined : at)} />
                {at < numPages && (
                  <div className="flex flex-col items-center gap-1">
                    <PageThumb pdf={pdf} pageNum={at + 1} width={thumbW} />
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink/70">{at + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      side={
        <>
          <div>
            <p className="font-display text-2xl font-bold">{plural(items.length, 'inserción', 'inserciones')}</p>
            <p className="text-sm text-ink/60">{numPages ? `${plural(numPages + added, 'página', 'páginas')} en el resultado` : 'Leyendo el PDF…'}</p>
          </div>
          {items.length === 0 ? (
            <Notice kind="info">Pulsa un «+» entre dos páginas para meter una página en blanco u otro PDF.</Notice>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{where(it.at)}</span>
                    <span className="block truncate text-xs text-ink/60" title={it.file?.name}>{it.file ? `${it.file.name} · ${plural(it.pages, 'página', 'páginas')}` : 'Página en blanco'}</span>
                  </span>
                  <button type="button" onClick={() => change(items.filter((x) => x.id !== it.id))} aria-label="Quitar inserción" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-brand">
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" icon={Undo2} disabled={past.length === 0} onClick={() => { setItems(past[past.length - 1]); setPast(past.slice(0, -1)) }}>Deshacer último cambio</Button>
        </>
      }
      action={{
        label: 'Insertar páginas',
        disabled: items.length === 0 || !pdf,
        onClick: () => run(async (progress) => {
          const specs: InsertSpec[] = items.map((it) => (it.file ? { id: it.id, at: it.at, file: it.file } : { id: it.id, at: it.at, blank: true as const }))
          return [{ name: `${baseName(file)}_con_paginas.pdf`, blob: pdfBlob(await insertPages(file, specs, (f) => progress(f))) }]
        }),
      }}
    />
  )
}

export default function InsertPagesTool() {
  return <ToolFrame id="insert-pages" accept=".pdf">{(ctx) => <InsertWork {...ctx} />}</ToolFrame>
}
