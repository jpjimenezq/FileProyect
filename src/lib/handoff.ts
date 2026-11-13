/** Pasa un archivo de una pantalla a otra (p. ej. del Taller a una herramienta) sin subirlo a ningún sitio. */
let pending: { file: File; target: string; at: number } | null = null

export function setHandoff(file: File, target: string) {
  pending = { file, target, at: Date.now() }
}

/** El archivo pendiente para `target`, si se dejó hace poco. No se borra: así resiste el doble montaje de React. */
export function peekHandoff(target: string): File | undefined {
  return pending && pending.target === target && Date.now() - pending.at < 30_000 ? pending.file : undefined
}
