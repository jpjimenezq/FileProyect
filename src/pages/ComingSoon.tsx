import { Link } from 'react-router-dom'
import { ToolIcon } from '../app/ToolIcon'
import type { ToolDef } from '../tools/catalog'

/** Solo se muestra si una herramienta del catálogo aún no tiene componente */
export function ComingSoon({ tool }: { tool: ToolDef }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <ToolIcon tool={tool} size={64} />
      <h1 className="text-3xl font-bold">{tool.name}</h1>
      <p className="text-ink/65">{tool.description}</p>
      <p className="rounded-xl bg-white px-4 py-3 text-sm">Esta herramienta llegará pronto.</p>
      <Link to="/" className="font-semibold text-brand hover:underline">← Ver herramientas disponibles</Link>
    </div>
  )
}
