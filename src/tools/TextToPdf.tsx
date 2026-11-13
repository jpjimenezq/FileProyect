import { useEffect, useState } from 'react'
import { FileCode2, Pencil, Type } from 'lucide-react'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { textToPdf } from '../lib/pdf/textpdf'

type Kind = 'text' | 'markdown' | 'code'

const guessKind = (name: string): Kind => (/\.(md|markdown)$/i.test(name) ? 'markdown' : /\.(json|csv|log|xml|js|ts|py|html?|css|sql|ya?ml)$/i.test(name) ? 'code' : 'text')

/** Si es JSON válido se reformatea con sangría para que se lea bien */
const prettyJson = (name: string, text: string) => {
  if (!/\.json$/i.test(name)) return text
  try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return text }
}

function TextWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>(() => guessKind(file.name))
  const [size, setSize] = useState(11)

  useEffect(() => { file.text().then((t) => setText(prettyJson(file.name, t))) }, [file])

  return (
    <Workspace
      main={
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink/60">{file.name} · <button onClick={reset} className="text-brand hover:underline">Empezar de nuevo</button></p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Escribe o pega aquí tu texto…"
            className={`${inputCls} min-h-[26rem] w-full resize-y bg-white p-4 leading-relaxed ${kind === 'code' ? 'font-mono text-[13px]' : ''}`}
          />
          <p className="text-xs text-ink/50">{text.length.toLocaleString('es-ES')} caracteres</p>
        </div>
      }
      side={
        <>
          <Field label="Formato del texto">
            <Segmented<Kind>
              label="Formato"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'text', label: 'Texto', icon: Type, desc: 'Párrafos normales.' },
                { value: 'markdown', label: 'Markdown', icon: Pencil, desc: 'Convierte # títulos y - listas en un documento con formato.' },
                { value: 'code', label: 'Código', icon: FileCode2, desc: 'Letra monoespaciada que conserva la sangría (JSON, código, tablas).' },
              ]}
            />
          </Field>
          <Field label={`Tamaño de letra: ${size} pt`}>
            <input type="range" min={8} max={18} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </Field>
          <p className="text-xs text-ink/55">Solo se admiten letras del alfabeto latino (con tildes y ñ). Otros alfabetos se sustituyen por «?».</p>
        </>
      }
      action={{
        label: 'Crear PDF',
        disabled: !text.trim(),
        onClick: () => run(async () => [{ name: `${baseName(file) === 'texto' ? 'documento' : baseName(file)}.pdf`, blob: pdfBlob(await textToPdf([text], { mono: kind === 'code', fontSize: size })) }]),
      }}
    />
  )
}

/** Botón bajo la zona de subida para empezar a escribir sin tener un archivo */
function WriteButton({ ctx }: { ctx: FrameCtx }) {
  return (
    <div className="mt-6 flex justify-center">
      <button onClick={() => ctx.setFiles([new File([''], 'texto.txt', { type: 'text/plain' })])} className="flex items-center gap-2 rounded-xl border-2 border-brand px-6 py-3 font-semibold text-brand hover:bg-brand/10">
        <Pencil size={18} /> Escribir o pegar texto
      </button>
    </div>
  )
}

export default function TextToPdf() {
  return (
    <ToolFrame id="text-to-pdf" accept=".txt,.md,.markdown,.json,.csv,.log,.xml,.html,.htm,.js,.ts,.py,.css,.sql,.yml,.yaml" emptyExtra={(ctx) => <WriteButton ctx={ctx} />}>
      {(ctx) => <TextWork {...ctx} />}
    </ToolFrame>
  )
}
