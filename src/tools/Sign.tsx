import { AnnotateEditor } from '../components/AnnotateEditor'
import { ToolFrame } from '../components/ToolFrame'
import { applyAnnotations } from '../lib/pdf/annotate'

export default function Sign() {
  return (
    <ToolFrame id="sign" accept=".pdf">
      {(ctx) => <AnnotateEditor {...ctx} tools={['signature', 'text']} actionLabel="Firmar PDF" suffix="firmado" apply={applyAnnotations} />}
    </ToolFrame>
  )
}
