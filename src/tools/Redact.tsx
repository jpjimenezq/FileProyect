import { AnnotateEditor } from '../components/AnnotateEditor'
import { ToolFrame } from '../components/ToolFrame'
import { applyRedactions } from '../lib/pdf/redact'

export default function Redact() {
  return (
    <ToolFrame id="redact" accept=".pdf">
      {(ctx) => <AnnotateEditor {...ctx} tools={['redact']} actionLabel="Censurar PDF" suffix="censurado" apply={applyRedactions} />}
    </ToolFrame>
  )
}
