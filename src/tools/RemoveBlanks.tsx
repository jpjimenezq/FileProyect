import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { BLANK_THRESHOLD, pageInk } from '../lib/pdf/blank'
import type { BlankLevel } from '../lib/pdf/blank'
import { extractPages, pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

function BlanksWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [ink, setInk] = useState<number[]>()
  const [level, setLevel] = useState<BlankLevel>('normal')
  // las páginas que el usuario cambia a mano respecto a lo detectado
  const [flipped, setFlipped] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!pdf) return
    let alive = true
    pageInk(pdf).then((r) => { if (alive) setInk(r) })
    return () => { alive = false }
  }, [pdf])

  const detected = (i: number) => (ink ? ink[i] < BLANK_THRESHOLD[level] : false)
  const isBlank = (i: number) => detected(i) !== flipped.has(i)
  const blanks = Array.from({ length: numPages }, (_, i) => i).filter(isBlank)
  const keep = Array.from({ length: numPages }, (_, i) => i + 1).filter((n) => !isBlank(n - 1))

  const toggle = (i: number) => setFlipped((s) => { const next = new Set(s); next.has(i) ? next.delete(i) : next.add(i); return next })

  return (
    <Workspace
      main={
        error ? <p className="text-center text-red-600">{error}</p> : (
          <>
            <p className="mb-4 text-center text-sm text-ink/60">{!ink ? 'Buscando páginas en blanco…' : 'Las páginas marcadas en rojo se eliminarán. Haz clic en una para cambiarla.'}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-4">
              {pdf && Array.from({ length: numPages }, (_, i) => (
                <button key={i} onClick={() => toggle(i)} disabled={!ink} className={`relative rounded-lg p-1 ${isBlank(i) ? 'bg-red-100 outline-2 outline-red-500' : 'hover:bg-ink/5'}`}>
                  <div className={isBlank(i) ? 'opacity-40' : ''}><PageThumb pdf={pdf} pageNum={i + 1} width={140} /></div>
                  {isBlank(i) && <span className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"><Check size={12} /></span>}
                  <span className="text-xs text-ink/60">{i + 1}</span>
                </button>
              ))}
            </div>
          </>
        )
      }
      side={
        <>
          <Field label="Qué cuenta como en blanco">
            <Segmented<BlankLevel>
              label="Sensibilidad"
              value={level}
              onChange={(v) => { setLevel(v); setFlipped(new Set()) }}
              options={[
                { value: 'strict', label: 'Totalmente' },
                { value: 'normal', label: 'Normal' },
                { value: 'lenient', label: 'Casi vacía' },
              ]}
            />
          </Field>
          <p className="text-sm">{ink ? <><b>{blanks.length}</b> de {numPages} páginas se eliminarán.</> : 'Analizando…'}</p>
          <p className="text-xs text-ink/55">«Casi vacía» también elimina páginas con ruido de escáner o una marca diminuta.</p>
        </>
      }
      action={{
        label: 'Quitar páginas en blanco',
        disabled: !ink || blanks.length === 0 || keep.length === 0,
        onClick: () => run(async () => [{ name: `${baseName(file)}_sin-blancos.pdf`, blob: pdfBlob(await extractPages(file, keep)), note: `Se quitaron ${blanks.length} página(s) en blanco.` }]),
      }}
    />
  )
}

export default function RemoveBlanks() {
  return <ToolFrame id="remove-blanks" accept=".pdf">{(ctx) => <BlanksWork {...ctx} />}</ToolFrame>
}
