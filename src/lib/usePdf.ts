import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf } from './pdf/render'

export function usePdf(file: File) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let alive = true
    setPdf(undefined)
    setError(undefined)
    loadPdf(file).then(
      (doc) => alive && setPdf(doc),
      (e: Error) => alive && setError(e.name === 'PasswordException' ? 'El PDF está protegido con contraseña.' : 'No se pudo leer el PDF.'),
    )
    return () => { alive = false }
  }, [file])
  return { pdf, numPages: pdf?.numPages ?? 0, error }
}
