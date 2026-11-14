import { createElement, lazy } from 'react'
import type { ComponentType } from 'react'

/** Herramientas que procesa el backend: comparten el componente ServerTool */
const server = (id: string): ComponentType =>
  lazy(() => import('./ServerTool').then((m) => ({ default: () => createElement(m.ServerTool, { id }) })))

/** Componentes de las herramientas implementadas (carga diferida por ruta) */
export const implemented: Record<string, ComponentType> = {
  merge: lazy(() => import('./Merge')),
  split: lazy(() => import('./Split')),
  'delete-pages': lazy(() => import('./DeletePages')),
  'extract-pages': lazy(() => import('./ExtractPages')),
  order: lazy(() => import('./Order')),
  rotate: lazy(() => import('./Rotate')),
  'insert-pages': lazy(() => import('./InsertPages')),
  interleave: lazy(() => import('./Interleave')),
  'split-halves': lazy(() => import('./SplitHalves')),
  'jpg-to-pdf': lazy(() => import('./JpgToPdf')),
  'photos-to-doc': lazy(() => import('./PhotosToDoc')),
  'pdf-to-jpg': lazy(() => import('./PdfToJpg')),
  'page-numbers': lazy(() => import('./PageNumbers')),
  watermark: lazy(() => import('./Watermark')),
  'remove-watermark': lazy(() => import('./RemoveWatermark')),
  crop: lazy(() => import('./Crop')),
  edit: lazy(() => import('./Edit')),
  sign: lazy(() => import('./Sign')),
  redact: lazy(() => import('./Redact')),
  compare: lazy(() => import('./Compare')),
  forms: lazy(() => import('./Forms')),
  scan: lazy(() => import('./Scan')),
  ocr: lazy(() => import('./Ocr')),
  'pdf-to-md': lazy(() => import('./PdfToMarkdown')),
  'pdf-to-excel': lazy(() => import('./PdfToExcel')),
  'pdf-to-text': lazy(() => import('./PdfToText')),
  'text-to-pdf': lazy(() => import('./TextToPdf')),
  'single-page': lazy(() => import('./SinglePage')),
  attachments: lazy(() => import('./Attachments')),
  bookmarks: lazy(() => import('./Bookmarks')),
  contrast: lazy(() => import('./Contrast')),
  'multi-page': lazy(() => import('./MultiPage')),
  'scale-pages': lazy(() => import('./ScalePages')),
  stamp: lazy(() => import('./Stamp')),
  invert: lazy(() => import('./Invert')),
  scanner: lazy(() => import('./Scanner')),
  'extract-images': lazy(() => import('./ExtractImages')),
  'remove-blanks': lazy(() => import('./RemoveBlanks')),
  flatten: lazy(() => import('./Flatten')),
  metadata: lazy(() => import('./Metadata')),
  'remove-annots': lazy(() => import('./RemoveAnnotations')),
  summarize: lazy(() => import('./Summarize')),
  translate: lazy(() => import('./Translate')),
  ...Object.fromEntries(
    ['compress', 'repair', 'pdf-to-pdfa', 'word-to-pdf', 'ppt-to-pdf', 'excel-to-pdf', 'html-to-pdf', 'pdf-to-word', 'pdf-to-ppt', 'protect', 'unlock'].map((id) => [id, server(id)]),
  ),
}
