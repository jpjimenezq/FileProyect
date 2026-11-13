import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface Props {
  onFiles: (files: File[]) => void
  /** Tipos admitidos, como en input[type=file]: "image/*", ".pdf"… */
  accept?: string
  multiple?: boolean
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  children?: ReactNode
}

/** Botón que abre el selector de archivos del sistema */
export function FileButton({ onFiles, accept, multiple, icon = Upload, variant = 'secondary', size = 'md', disabled, children = 'Elegir archivo' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant={variant} size={size} icon={icon} disabled={disabled} onClick={() => input.current?.click()}>{children}</Button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ''; if (list.length) onFiles(multiple ? list : list.slice(0, 1)) }}
      />
    </>
  )
}
