/** Une clases de Tailwind ignorando los valores vacíos */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
