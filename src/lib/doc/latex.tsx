import { useEffect, useRef, useState } from 'react'
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Check } from 'lucide-react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    latexBlock: { insertLatex: (latex?: string) => ReturnType }
  }
}

export const renderLatex = (latex: string) => katex.renderToString(latex, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' })

function LatexView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? '')
  const [editing, setEditing] = useState(latex === '')
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editing) area.current?.focus() }, [editing])

  let html = ''
  try { html = latex.trim() ? renderLatex(latex) : '' } catch { html = '' }

  return (
    <NodeViewWrapper className={`latex-block my-3 rounded-2xl border transition ${selected || editing ? 'border-brand/60 bg-white shadow-sm' : 'border-transparent hover:border-line'}`} contentEditable={false}>
      {editing && editor.isEditable ? (
        <div className="grid gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-2" onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}>
          <div className="relative bg-white">
            <span className="absolute left-3 top-2 select-none text-[11px] font-bold uppercase tracking-widest text-brand">LaTeX</span>
            <textarea ref={area} aria-label="Código LaTeX" value={latex} onChange={(e) => updateAttributes({ latex: e.target.value })} rows={Math.min(8, Math.max(3, latex.split(String.fromCharCode(10)).length))} spellCheck={false}
              className="block h-full min-h-24 w-full resize-none bg-transparent px-3 pb-3 pt-7 font-mono text-sm outline-none" />
          </div>
          <div className="relative flex min-h-24 items-center justify-center overflow-x-auto bg-paper/50 px-3 py-3" aria-label="Vista previa de la fórmula">
            <div dangerouslySetInnerHTML={{ __html: html }} />
            <button type="button" aria-label="Terminar" title="Terminar" onClick={() => setEditing(false)} className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white hover:bg-brand"><Check size={16} /></button>
          </div>
        </div>
      ) : (
        <div role="button" tabIndex={0} aria-label="Fórmula" onClick={() => editor.isEditable && setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true) }} className="cursor-pointer overflow-x-auto px-3 py-2 text-center"
          dangerouslySetInnerHTML={{ __html: html || '<span style="color:#bbb;font-size:22px">Σ</span>' }} />
      )}
    </NodeViewWrapper>
  )
}

/** Bloque de fórmula matemática escrita en LaTeX (se muestra con KaTeX) */
export const LatexBlock = Node.create({
  name: 'latexBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { latex: { default: '', parseHTML: (el) => el.getAttribute('data-latex') ?? '', renderHTML: (attrs) => ({ 'data-latex': attrs.latex }) } }
  },
  parseHTML() { return [{ tag: 'div[data-latex-block]' }] },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-latex-block': '', style: 'text-align:center' }), String(node.attrs.latex ?? '')]
  },
  addNodeView() { return ReactNodeViewRenderer(LatexView) },
  addCommands() {
    return { insertLatex: (latex = '') => ({ commands }) => commands.insertContent({ type: this.name, attrs: { latex } }) }
  },
})
