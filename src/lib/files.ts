export const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '')

export const fmtSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function matchesAccept(file: File, accept: string) {
  return accept.split(',').some((a) => {
    const rule = a.trim().toLowerCase()
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule)
    if (rule.endsWith('/*')) return file.type.startsWith(rule.slice(0, -1))
    return file.type === rule
  })
}

export const MAX_SIZE = 100 * 1024 * 1024
