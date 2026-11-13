import { Extension } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { common, createLowlight } from 'lowlight'

export const lowlight = createLowlight(common)

/** Lenguajes que se ofrecen en el selector (nombre mostrado → identificador de lowlight) */
export const LANGUAGES: [string, string][] = [
  ['Automático', ''], ['JavaScript', 'javascript'], ['TypeScript', 'typescript'], ['Python', 'python'], ['Java', 'java'], ['C', 'c'], ['C++', 'cpp'], ['C#', 'csharp'],
  ['PHP', 'php'], ['Go', 'go'], ['Rust', 'rust'], ['Ruby', 'ruby'], ['Kotlin', 'kotlin'], ['Swift', 'swift'], ['SQL', 'sql'], ['HTML / XML', 'xml'], ['CSS', 'css'],
  ['JSON', 'json'], ['YAML', 'yaml'], ['Bash / Shell', 'bash'], ['Markdown', 'markdown'], ['Texto sin colores', 'plaintext'],
]

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
const CLOSERS = new Set(Object.values(PAIRS))
const QUOTES = new Set(['"', "'", '`'])

/**
 * Comodidades al escribir dentro de un bloque de código: cierra automáticamente paréntesis, corchetes, llaves
 * y comillas (y envuelve la selección); al escribir un cierre que ya está delante lo salta; Retroceso borra
 * el par vacío; y Tab sangra.
 */
export const CodeHelpers = Extension.create({
  name: 'codeHelpers',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) => {
            const { state } = view
            const $from = state.doc.resolve(from)
            if ($from.parent.type.name !== 'codeBlock' || text.length !== 1) return false
            const end = $from.end()
            const next = to < end ? state.doc.textBetween(to, to + 1) : ''
            const prev = from > $from.start() ? state.doc.textBetween(from - 1, from) : ''

            if (from === to && CLOSERS.has(text) && next === text) {
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to + 1)))
              return true
            }
            if (text in PAIRS) {
              if (QUOTES.has(text) && /\w/.test(prev)) return false // «don't», «it's»
              const selected = state.doc.textBetween(from, to)
              const tr = state.tr.insertText(text + selected + PAIRS[text], from, to)
              tr.setSelection(TextSelection.create(tr.doc, from + 1 + selected.length))
              view.dispatch(tr)
              return true
            }
            return false
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    const inCode = () => this.editor.isActive('codeBlock')
    return {
      Tab: () => (inCode() ? this.editor.commands.insertContent('  ') : false),
      Backspace: () => {
        if (!inCode()) return false
        const { $from, empty } = this.editor.state.selection
        if (!empty) return false
        const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset)
        const after = $from.parent.textBetween($from.parentOffset, Math.min($from.parent.content.size, $from.parentOffset + 1))
        if (before && PAIRS[before] === after) return this.editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos + 1 })
        return false
      },
    }
  },
})

export const CodeBlock = CodeBlockLowlight.configure({ lowlight, defaultLanguage: null, HTMLAttributes: { spellcheck: 'false' } })
