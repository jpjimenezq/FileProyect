import { Link } from 'react-router-dom'
import { ArrowRight, Ban, Check, Lock, Search, Sparkles } from 'lucide-react'
import { ToolIcon } from '../app/ToolIcon'
import { useOpenPalette } from '../app/Palette'
import { categories, toolById, tools } from '../tools/catalog'
import type { ToolDef } from '../tools/catalog'

function ToolTile({ tool }: { tool: ToolDef }) {
  return (
    <Link to={tool.path} className="group relative flex items-start gap-3 rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg hover:shadow-brand/10">
      <ToolIcon tool={tool} size={44} />
      <span className="min-w-0">
        <span className="block font-display text-[17px] font-bold leading-tight group-hover:text-brand">{tool.name}</span>
        <span className="mt-1 block text-sm leading-snug text-ink/60">{tool.description}</span>
      </span>
    </Link>
  )
}

/** Tres tarjetas inclinadas: la pila de "papeles" de la portada */
function Stack() {
  const cards = [
    { id: 'merge', rot: '-rotate-6', pos: 'left-0 top-6', line: 'Une 12 PDF en uno' },
    { id: 'sign', rot: 'rotate-3', pos: 'left-24 top-24', line: 'Firma sin imprimir' },
    { id: 'summarize', rot: '-rotate-2', pos: 'left-6 top-[11.5rem]', line: 'Resume 40 páginas' },
  ]
  return (
    <div aria-hidden className="relative mx-auto hidden h-[21rem] w-[22rem] lg:block">
      {cards.map((c) => {
        const t = toolById(c.id)
        return (
          <div key={c.id} className={`absolute ${c.pos} ${c.rot} flex w-64 items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-xl shadow-ink/10`}>
            <ToolIcon tool={t} size={46} />
            <div>
              <p className="font-display text-lg font-bold leading-tight">{t.name}</p>
              <p className="text-sm text-ink/60">{c.line}</p>
            </div>
          </div>
        )
      })}
      <span className="absolute -right-2 top-2 rotate-12 rounded-full bg-lime px-3 py-1.5 text-sm font-bold shadow-md">Sin marcas de agua</span>
    </div>
  )
}

export function Home() {
  const openPalette = useOpenPalette()

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-lime px-3.5 py-1.5 text-sm font-semibold"><Check size={14} /> {tools.length} herramientas PDF, gratis para empezar</p>
          <h1 className="text-5xl font-extrabold leading-[1.02] md:text-6xl">Tus PDF, <span className="rounded-xl bg-brand px-2 text-white">en tus manos</span>.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink/70">Une, divide, firma, convierte y resume documentos PDF en un solo lugar. Sin anuncios, sin marcas de agua y sin conservar tus archivos.</p>

          <button onClick={openPalette} className="mt-8 flex w-full max-w-xl items-center gap-3 rounded-2xl border-2 border-ink bg-white px-5 py-4 text-left text-lg shadow-[5px_5px_0_0_#16152b] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_#16152b]">
            <Search className="text-ink/50" />
            <span className="flex-1 text-ink/45">¿Qué quieres hacer con tu PDF?</span>
            <kbd className="hidden rounded-md border border-line px-2 py-0.5 text-sm text-ink/50 sm:block pointer-coarse:hidden">Ctrl K</kbd>
          </button>
          <p className="mt-4 text-sm text-ink/60">Ejemplos: <b>juntar</b>, <b>reducir peso</b>, <b>firmar</b>, <b>pasar a Word</b></p>
        </div>
        <Stack />
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 md:grid-cols-3">
        {[
          { icon: Lock, title: 'Tus archivos, tuyos', text: 'Solo los usamos para darte el resultado y no los conservamos: se descartan al terminar.' },
          { icon: Ban, title: 'Sin anuncios ni marcas de agua', text: 'Ni en el plan gratuito. Lo que descargas es tu documento, limpio.' },
          { icon: Sparkles, title: 'IA incluida', text: 'Resume y traduce documentos largos. Tienes una cuota gratis cada mes.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-3xl border border-line bg-white p-6">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-lime"><Icon size={22} /></span>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1.5 text-ink/65">{text}</p>
          </div>
        ))}
      </section>

      <section id="herramientas" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-16">
        <h2 className="mb-8 text-3xl font-extrabold md:text-4xl">Todas las herramientas</h2>

        <div className="flex flex-col gap-10">
          {categories.map((c) => {
            const list = tools.filter((t) => t.category === c.id)
            return (
              <div key={c.id}>
                <h3 className="mb-4 flex items-center gap-3 text-xl font-bold">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} /> {c.name}
                  <span className="text-sm font-medium text-ink/40">{list.length}</span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((t) => <ToolTile key={t.id} tool={t} />)}</div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex flex-col items-start justify-between gap-5 rounded-[2rem] border border-line bg-white p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-extrabold md:text-3xl">Taller: escribe y calcula sin salir de aquí</h2>
            <p className="mt-2 max-w-xl text-ink/65">Un editor de documentos tipo Word y una hoja de cálculo tipo Excel, con tus archivos .docx y .xlsx.</p>
          </div>
          <Link to="/taller" className="flex shrink-0 items-center gap-2 rounded-2xl bg-ink px-6 py-3.5 font-bold text-white hover:bg-brand">Abrir el Taller <ArrowRight size={18} /></Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-ink p-8 text-white md:flex-row md:items-center md:p-12">
          <div>
            <h2 className="text-3xl font-extrabold md:text-4xl">Gratis para empezar. <span className="text-lime">Pro</span> cuando necesites más.</h2>
            <p className="mt-3 max-w-xl text-white/70">Más conversiones al día, archivos de hasta 100 MB y 20 veces más IA, por lo que cuesta un café al mes.</p>
          </div>
          <Link to="/precios" className="flex shrink-0 items-center gap-2 rounded-2xl bg-lime px-7 py-4 text-lg font-bold text-ink hover:bg-white">Ver planes <ArrowRight size={20} /></Link>
        </div>
      </section>
    </>
  )
}
