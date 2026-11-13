import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { categories, tools } from '../tools/catalog'
import type { ToolDef } from '../tools/catalog'
import { ToolIcon } from './ToolIcon'

/** Palabras que la gente usa de verdad, aunque la herramienta se llame de otra forma */
const KEYWORDS: Record<string, string> = {
  merge: 'juntar combinar fusionar agrupar',
  split: 'cortar separar partir trocear',
  'delete-pages': 'borrar quitar eliminar hojas',
  'extract-pages': 'sacar copiar seleccionar hojas',
  order: 'reordenar mover cambiar orden',
  scan: 'camara escanear foto documento',
  compress: 'reducir peso tamano pesa mucho correo',
  repair: 'arreglar recuperar roto danado corrupto',
  ocr: 'escaneado reconocer texto leer imagen',
  'jpg-to-pdf': 'foto imagen png fotos',
  'pdf-to-jpg': 'imagen foto exportar png',
  rotate: 'girar voltear torcido',
  'page-numbers': 'numerar paginacion',
  watermark: 'sello logo borrador confidencial',
  crop: 'cortar margenes recortar',
  edit: 'escribir texto dibujar anotar',
  sign: 'firma rubrica',
  redact: 'tachar ocultar privacidad negro',
  unlock: 'quitar contrasena abrir',
  protect: 'contrasena cifrar clave encriptar',
  summarize: 'resumen resumir ia sintesis',
  translate: 'traduccion idioma ia ingles',
  'pdf-to-md': 'markdown texto',
  'pdf-to-text': 'txt texto plano copiar extraer',
  'text-to-pdf': 'txt escribir pegar markdown json nota documento crear',
  'single-page': 'larga continua vertical unir paginas una hoja',
  attachments: 'incrustados ficheros archivos dentro clip paperclip',
  bookmarks: 'indice marcadores capitulos navegacion tabla contenido',
  contrast: 'brillo oscuro desvaido limpiar escaneo claro blanco',
  'multi-page': 'folleto ahorrar papel imprimir varias por hoja n-up diapositivas',
  'scale-pages': 'tamano a4 carta a3 reducir agrandar ajustar porcentaje',
  stamp: 'sello aprobado fecha posicion borrador pagado',
  invert: 'oscuro negativo noche dark modo',
  scanner: 'escaneado aspecto fotocopia scan falso',
  'extract-images': 'fotos imagenes sacar guardar png jpg',
  'remove-blanks': 'vacias vacios blancas hojas escaner',
  flatten: 'fijar formulario bloquear rasterizar imagen',
  metadata: 'autor titulo propiedades datos ocultos privacidad informacion',
  'remove-annots': 'comentarios notas resaltados borrar limpiar',
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const Ctx = createContext<() => void>(() => {})
export const useOpenPalette = () => useContext(Ctx)

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Ctx.Provider value={() => setOpen(true)}>
      {children}
      {open && <Palette onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

/** Atajos para cuando todavía no se ha escrito nada: las tareas que más se piden */
const POPULAR = ['merge', 'split', 'compress', 'sign', 'pdf-to-word', 'summarize', 'rotate', 'protect']

const RECENT_KEY = 'fp_recent'
const MAX_RECENT = 4

// El navegador puede bloquear el almacenamiento (modo privado): la búsqueda funciona igual sin recientes
const readRecent = (): string[] => {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id) => tools.some((t) => t.id === id)).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}
const saveRecent = (id: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT))) } catch { /* sin almacenamiento */ }
}

const MAX_RESULTS = 6

function Chip({ id, onPick }: { id: string; onPick: (t: ToolDef) => void }) {
  const t = tools.find((x) => x.id === id)
  if (!t) return null
  return (
    <button onClick={() => onPick(t)} className="flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition hover:border-brand hover:bg-brand/10">
      <ToolIcon tool={t} size={24} />
      {t.name}
    </button>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [recent] = useState(readRecent)
  const navigate = useNavigate()
  const list = useRef<HTMLUListElement>(null)

  const matches = useMemo(() => {
    const q = plain(query.trim())
    if (!q) return []
    const words = q.split(/\s+/)
    // cuanto más abajo coincide la palabra (nombre, palabras clave, descripción, categoría), menos relevante
    const rank = (t: ToolDef) => {
      const fields = [plain(t.name), plain(KEYWORDS[t.id] ?? ''), plain(t.description), plain(categories.find((c) => c.id === t.category)?.name ?? '')]
      return words.reduce((sum, w) => sum + Math.max(0, fields.findIndex((f) => f.includes(w))) , 0)
    }
    return tools
      .filter((t) => {
        const hay = plain(`${t.name} ${t.description} ${KEYWORDS[t.id] ?? ''} ${categories.find((c) => c.id === t.category)?.name}`)
        return words.every((w) => hay.includes(w))
      })
      .map((t) => ({ t, r: rank(t) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.t)
  }, [query])
  const results = matches.slice(0, MAX_RESULTS)

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const open = (t: ToolDef) => {
    saveRecent(t.id)
    onClose()
    navigate(t.path)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 px-4 pt-[14vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Buscar herramienta" className="w-full max-w-xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-ink/25">
        <div className="flex items-center gap-3 px-5 py-4">
          <Search size={20} className="text-brand" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter' && results[active]) open(results[active])
            }}
            placeholder="¿Qué quieres hacer con tu PDF?"
            aria-label="Buscar herramienta"
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-ink/35"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-xs text-ink/50 sm:block">Esc</kbd>
        </div>

        {!query.trim() ? (
          <div className="flex flex-col gap-5 border-t border-line bg-paper/60 px-5 py-5">
            {recent.length > 0 && (
              <div>
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink/45">Usadas hace poco</p>
                <div className="flex flex-wrap gap-2">{recent.map((id) => <Chip key={id} id={id} onPick={open} />)}</div>
              </div>
            )}
            <div>
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink/45">Lo más pedido</p>
              <div className="flex flex-wrap gap-2">{POPULAR.map((id) => <Chip key={id} id={id} onPick={open} />)}</div>
            </div>
            <p className="text-sm text-ink/55">O escribe lo que necesitas: «juntar», «reducir peso», «quitar contraseña»…</p>
          </div>
        ) : (
          <ul ref={list} className="border-t border-line p-2">
            {results.length === 0 && <li className="px-4 py-8 text-center text-ink/60">No encontramos nada para «{query}». Prueba con otra palabra.</li>}
            {results.map((t, i) => (
              <li key={t.id} data-active={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => open(t)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${i === active ? 'bg-brand/10' : ''}`}
                >
                  <ToolIcon tool={t} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-tight">{t.name}</span>
                    <span className="block truncate text-[13px] text-ink/55">{t.description}</span>
                  </span>
                  {i === active && <CornerDownLeft size={16} className="text-brand" />}
                </button>
              </li>
            ))}
            {matches.length > MAX_RESULTS && <li className="px-4 py-2 text-center text-xs text-ink/50">y {matches.length - MAX_RESULTS} más: escribe algo más concreto para afinar</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
