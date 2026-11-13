import { categoryOf } from '../tools/catalog'
import type { ToolDef } from '../tools/catalog'

export function ToolIcon({ tool, size = 28 }: { tool: ToolDef; size?: number }) {
  const Icon = tool.icon
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl text-white" style={{ background: categoryOf(tool).color, width: size, height: size }}>
      <Icon size={size * 0.55} strokeWidth={2.2} />
    </span>
  )
}
