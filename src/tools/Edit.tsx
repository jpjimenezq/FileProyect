import { AnnotateEditor } from '../components/AnnotateEditor'
import { ToolFrame } from '../components/ToolFrame'
import { applyAnnotations } from '../lib/pdf/annotate'

export default function Edit() {
  return (
    <ToolFrame id="edit" accept=".pdf">
      {(ctx) => <AnnotateEditor {...ctx} tools={['edittext', 'text', 'rect', 'highlight', 'pen', 'image']} actionLabel="Guardar cambios" suffix="editado" apply={applyAnnotations} />}
    </ToolFrame>
  )
}
