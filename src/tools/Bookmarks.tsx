import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { readBookmarks, writeBookmarks } from '../lib/pdf/structure'
import type { Bookmark } from '../lib/pdf/structure'
import { usePdf } from '../lib/usePdf'

function BookmarksWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [items, setItems] = useState<Bookmark[]>()

  useEffect(() => { readBookmarks(file).then(setItems, () => setItems([])) }, [file])

  const set = (i: number, change: Partial<Bookmark>) => setItems((all) => all?.map((b, j) => (j === i ? { ...b, ...change } : b)))
  const add = () => setItems((all) => [...(all ?? []), { title: '', page: Math.min(numPages || 1, (all?.[all.length - 1]?.page ?? 0) + 1), level: 0 }])
  const indent = (i: number, d: number) => setItems((all) => all?.map((b, j) => (j === i ? { ...b, level: Math.max(0, Math.min(5, b.level + d)) } : b)))
  const valid = items?.filter((b) => b.title.trim()) ?? []

  return (
    <Workspace
      main={
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-center">
          <div className="mx-auto md:mx-0"><PdfCard file={file} showPages onRemove={reset} /></div>
          <div className="w-full max-w-xl">
            <h3 className="mb-3 font-display text-lg font-bold">Índice del documento</h3>
            {!items ? <p className="text-sm text-ink/55">Leyendo marcadores…</p> : items.length === 0 ? (
              <p className="rounded-2xl bg-paper p-4 text-sm text-ink/60">Este PDF no tiene marcadores. Añade el primero para crear un índice navegable.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((b, i) => (
                  <li key={i} className="flex items-center gap-1.5 rounded-xl border border-line bg-white p-2" style={{ marginLeft: b.level * 20 }}>
                    <input aria-label={`Título del marcador ${i + 1}`} placeholder="Título" className={`${inputCls} min-w-0 flex-1 py-1.5`} value={b.title} onChange={(e) => set(i, { title: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs text-ink/55">pág.
                      <input type="number" aria-label={`Página del marcador ${i + 1}`} min={1} max={numPages || undefined} className={`${inputCls} w-16 py-1.5`} value={b.page} onChange={(e) => set(i, { page: Number(e.target.value) })} />
                    </label>
                    <button onClick={() => indent(i, -1)} disabled={b.level === 0} aria-label="Subir de nivel" className="rounded p-1.5 text-ink/50 hover:bg-ink/5 disabled:opacity-25"><ArrowLeft size={15} /></button>
                    <button onClick={() => indent(i, 1)} disabled={i === 0 || b.level > (items[i - 1]?.level ?? 0)} aria-label="Bajar de nivel" className="rounded p-1.5 text-ink/50 hover:bg-ink/5 disabled:opacity-25"><ArrowRight size={15} /></button>
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Quitar marcador" className="rounded p-1.5 text-ink/40 hover:text-red-600"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={add} className="mt-3 flex items-center gap-1.5 rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10"><Plus size={16} /> Añadir marcador</button>
          </div>
        </div>
      }
      side={<p className="text-sm text-ink/65">Los marcadores forman el índice lateral de los visores de PDF. Usa las flechas para ponerlos dentro de otro (por ejemplo, un apartado dentro de un capítulo). Los que no tengan título se descartan.</p>}
      action={{
        label: 'Guardar marcadores',
        disabled: !items || !numPages,
        onClick: () => run(async () => [{ name: `${baseName(file)}_marcadores.pdf`, blob: pdfBlob(await writeBookmarks(file, items ?? [])), note: valid.length ? `${valid.length} marcador(es) guardados.` : 'Se quitó el índice del PDF.' }]),
      }}
    />
  )
}

export default function BookmarksTool() {
  return <ToolFrame id="bookmarks" accept=".pdf">{(ctx) => <BookmarksWork {...ctx} />}</ToolFrame>
}
