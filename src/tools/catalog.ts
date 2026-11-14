import {
  ArrowDownUp, Columns2, Crop, EyeOff, FileCode2, FileImage, FileOutput, FileText, Globe, Hash, Image, Languages,
  LockOpen, Merge, Minimize2, PenLine, Pencil, Presentation, RotateCw, ScanLine, ScanText, Sheet, ShieldCheck, Sparkles,
  Split, Stamp, TextCursorInput, Trash2, Wrench, FileCheck2, FileMinus, FileType, Images, Layers, MessageSquareOff, Tags, LayoutGrid, Scaling, BadgeCheck, Contrast, Scan, AlignLeft, StretchVertical, Paperclip, Bookmark, SunMedium, ImageUp, Eraser, FilePlus2, Shuffle, SplitSquareHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type CategoryId = 'ordenar' | 'optimizar' | 'a-pdf' | 'desde-pdf' | 'editar' | 'seguridad' | 'ia'

export interface Category {
  id: CategoryId
  name: string
  color: string
}

export interface ToolDef {
  id: string
  path: string
  name: string
  description: string
  category: CategoryId
  icon: LucideIcon
  /** Fase del plan en la que se implementa; 1 = ya disponible */
  phase: 1 | 2 | 3 | 4
}

export const categories: Category[] = [
  { id: 'ordenar', name: 'Organizar', color: '#5b4bff' },
  { id: 'optimizar', name: 'Mejorar', color: '#0ea5a4' },
  { id: 'a-pdf', name: 'Crear un PDF', color: '#f59e0b' },
  { id: 'desde-pdf', name: 'Sacar de un PDF', color: '#ec4899' },
  { id: 'editar', name: 'Retocar', color: '#2563eb' },
  { id: 'seguridad', name: 'Proteger y firmar', color: '#16a34a' },
  { id: 'ia', name: 'Con IA', color: '#9333ea' },
]

const t = (id: string, path: string, name: string, description: string, category: CategoryId, icon: LucideIcon, phase: ToolDef['phase']): ToolDef => ({
  id, path: `/${path}`, name, description, category, icon, phase,
})

export const tools: ToolDef[] = [
  t('merge', 'unir-pdf', 'Unir PDF', 'Combina varios PDF en uno solo, en el orden que quieras.', 'ordenar', Merge, 1),
  t('split', 'dividir-pdf', 'Dividir PDF', 'Separa un PDF por rangos o en páginas individuales.', 'ordenar', Split, 1),
  t('delete-pages', 'eliminar-paginas', 'Eliminar páginas', 'Quita del PDF las páginas que no necesitas.', 'ordenar', Trash2, 1),
  t('extract-pages', 'extraer-paginas', 'Extraer páginas', 'Crea un PDF nuevo solo con las páginas que elijas.', 'ordenar', FileOutput, 1),
  t('order', 'ordenar-pdf', 'Ordenar PDF', 'Reorganiza las páginas arrastrándolas.', 'ordenar', ArrowDownUp, 1),
  t('multi-page', 'varias-paginas-por-hoja', 'Varias páginas por hoja', 'Agrupa 2, 4, 6 o 9 páginas en cada hoja para ahorrar papel.', 'ordenar', LayoutGrid, 1),
  t('single-page', 'pdf-a-una-pagina', 'PDF a una sola página', 'Une todas las páginas en una sola página larga.', 'ordenar', StretchVertical, 1),
  t('remove-blanks', 'quitar-paginas-en-blanco', 'Quitar páginas en blanco', 'Detecta y elimina las hojas vacías de tu PDF.', 'ordenar', FileMinus, 1),
  t('scan', 'escanear-a-pdf', 'Escanea a PDF', 'Escanea documentos con la cámara y guárdalos como PDF.', 'ordenar', ScanLine, 1),
  t('insert-pages', 'insertar-paginas', 'Insertar páginas', 'Mete páginas en blanco u otro PDF en la posición que elijas.', 'ordenar', FilePlus2, 1),
  t('interleave', 'intercalar-paginas', 'Intercalar páginas', 'Mezcla dos PDF página a página, por ejemplo anversos y reversos escaneados.', 'ordenar', Shuffle, 1),
  t('split-halves', 'dividir-paginas-por-la-mitad', 'Dividir páginas por la mitad', 'Corta cada página en dos: libros escaneados a doble página o A3 a A4.', 'ordenar', SplitSquareHorizontal, 1),

  t('compress', 'comprimir-pdf', 'Comprimir PDF', 'Reduce el tamaño del archivo manteniendo la calidad.', 'optimizar', Minimize2, 1),
  t('repair', 'reparar-pdf', 'Reparar PDF', 'Recupera datos de PDF dañados.', 'optimizar', Wrench, 1),
  t('ocr', 'ocr-pdf', 'OCR PDF', 'Convierte PDF escaneados en PDF con texto seleccionable.', 'optimizar', ScanText, 1),

  t('text-to-pdf', 'texto-a-pdf', 'Texto a PDF', 'Convierte texto, Markdown o JSON en un PDF.', 'a-pdf', AlignLeft, 1),
  t('jpg-to-pdf', 'jpg-a-pdf', 'JPG a PDF', 'Convierte imágenes JPG, PNG o WebP en un PDF.', 'a-pdf', Image, 1),
  t('photos-to-doc', 'fotos-a-documento', 'Fotos a documento', 'Junta tus fotos e imágenes y consigue un PDF, un Word editable, texto u otro formato.', 'a-pdf', ImageUp, 1),
  t('word-to-pdf', 'word-a-pdf', 'WORD a PDF', 'Convierte documentos DOC y DOCX a PDF.', 'a-pdf', FileText, 1),
  t('ppt-to-pdf', 'powerpoint-a-pdf', 'POWERPOINT a PDF', 'Convierte presentaciones PPT y PPTX a PDF.', 'a-pdf', Presentation, 1),
  t('excel-to-pdf', 'excel-a-pdf', 'EXCEL a PDF', 'Convierte hojas de cálculo XLS y XLSX a PDF.', 'a-pdf', Sheet, 1),
  t('html-to-pdf', 'html-a-pdf', 'HTML a PDF', 'Convierte páginas web o archivos HTML a PDF.', 'a-pdf', Globe, 1),

  t('pdf-to-jpg', 'pdf-a-jpg', 'PDF a JPG', 'Convierte cada página del PDF en una imagen JPG.', 'desde-pdf', FileImage, 1),
  t('pdf-to-text', 'pdf-a-texto', 'PDF a texto', 'Extrae el texto del PDF en un archivo .txt.', 'desde-pdf', FileType, 1),
  t('extract-images', 'extraer-imagenes', 'Extraer imágenes', 'Saca todas las imágenes incrustadas en el PDF.', 'desde-pdf', Images, 1),
  t('pdf-to-word', 'pdf-a-word', 'PDF a WORD', 'Convierte tu PDF en un documento Word editable.', 'desde-pdf', FileText, 1),
  t('pdf-to-ppt', 'pdf-a-powerpoint', 'PDF a POWERPOINT', 'Convierte tu PDF en una presentación PowerPoint.', 'desde-pdf', Presentation, 1),
  t('pdf-to-excel', 'pdf-a-excel', 'PDF a EXCEL', 'Extrae tablas del PDF a una hoja de Excel.', 'desde-pdf', Sheet, 1),
  t('pdf-to-pdfa', 'pdf-a-pdfa', 'PDF a PDF/A', 'Convierte tu PDF a PDF/A para archivado a largo plazo.', 'desde-pdf', FileCheck2, 1),

  t('scale-pages', 'escalar-paginas', 'Escalar páginas', 'Ajusta las páginas a A4, Carta u otro tamaño o porcentaje.', 'editar', Scaling, 1),
  t('stamp', 'estampar-pdf', 'Estampar PDF', 'Añade un sello de texto o imagen en la posición que elijas.', 'editar', BadgeCheck, 1),
  t('invert', 'invertir-colores', 'Invertir colores', 'Pasa tu PDF a modo oscuro: fondo negro y texto blanco.', 'editar', Contrast, 1),
  t('scanner', 'efecto-escaner', 'Efecto escáner', 'Haz que tu PDF parezca escaneado o fotocopiado.', 'editar', Scan, 1),
  t('attachments', 'adjuntos-pdf', 'Adjuntos del PDF', 'Mira, descarga, añade o quita los archivos dentro de un PDF.', 'editar', Paperclip, 1),
  t('bookmarks', 'marcadores-pdf', 'Marcadores del PDF', 'Crea y edita el índice del documento.', 'editar', Bookmark, 1),
  t('contrast', 'ajustar-contraste', 'Ajustar contraste', 'Mejora escaneos oscuros o desvaídos con brillo y contraste.', 'editar', SunMedium, 1),
  t('flatten', 'aplanar-pdf', 'Aplanar PDF', 'Convierte formularios y capas en contenido fijo.', 'editar', Layers, 1),
  t('metadata', 'metadatos-pdf', 'Metadatos del PDF', 'Consulta, edita o borra el autor, el título y otros datos ocultos.', 'editar', Tags, 1),
  t('remove-annots', 'quitar-anotaciones', 'Quitar anotaciones', 'Elimina comentarios, resaltados y notas del PDF.', 'editar', MessageSquareOff, 1),
  t('rotate', 'rotar-pdf', 'Rotar PDF', 'Gira todas las páginas o solo las que elijas.', 'editar', RotateCw, 1),
  t('page-numbers', 'numeros-de-pagina', 'Insertar números de página', 'Añade numeración con la posición y formato que prefieras.', 'editar', Hash, 1),
  t('watermark', 'marca-de-agua', 'Insertar marca de agua', 'Estampa texto o una imagen sobre tus páginas.', 'editar', Stamp, 1),
  t('remove-watermark', 'quitar-marca-de-agua', 'Quitar marca de agua', 'Detecta las marcas de agua de texto o imagen y las elimina de tus páginas.', 'editar', Eraser, 1),
  t('crop', 'recortar-pdf', 'Recortar PDF', 'Recorta los márgenes de tus páginas.', 'editar', Crop, 1),
  t('edit', 'editar-pdf', 'Editar PDF', 'Añade texto, formas, imágenes y dibujos al PDF.', 'editar', Pencil, 1),
  t('forms', 'formularios-pdf', 'Formularios PDF', 'Rellena los campos de formularios PDF y guárdalos.', 'editar', TextCursorInput, 1),

  t('unlock', 'desbloquear-pdf', 'Desbloquear PDF', 'Quita la contraseña y las restricciones del PDF.', 'seguridad', LockOpen, 1),
  t('protect', 'proteger-pdf', 'Proteger PDF', 'Cifra tu PDF con una contraseña.', 'seguridad', ShieldCheck, 1),
  t('sign', 'firmar-pdf', 'Firmar PDF', 'Firma documentos tú mismo.', 'seguridad', PenLine, 1),
  t('redact', 'censurar-pdf', 'Censurar PDF', 'Oculta de forma permanente el contenido sensible.', 'seguridad', EyeOff, 1),
  t('compare', 'comparar-pdf', 'Comparar PDF', 'Compara dos PDF y resalta las diferencias.', 'seguridad', Columns2, 1),

  t('summarize', 'resumir-pdf', 'Resumir con IA', 'Obtén un resumen de tu PDF con inteligencia artificial.', 'ia', Sparkles, 1),
  t('translate', 'traducir-pdf', 'Traducir PDF', 'Traduce tu PDF a otro idioma con IA.', 'ia', Languages, 1),
  t('pdf-to-md', 'pdf-a-markdown', 'PDF a Markdown', 'Convierte tu PDF en texto Markdown.', 'ia', FileCode2, 1),
]

export const toolById = (id: string) => tools.find((x) => x.id === id)!
export const toolsOf = (category: CategoryId) => tools.filter((x) => x.category === category)
export const categoryOf = (tool: ToolDef) => categories.find((c) => c.id === tool.category)!
