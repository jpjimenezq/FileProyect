import type { Cell, CellStyle, NumFmt, Workbook } from './model'
import { Evaluator, key, parseKey, usedSize } from './model'

const FMT_CODE: Record<Exclude<NumFmt, ''>, string> = { dec2: '#,##0.00', int: '#,##0', pct: '0.00%', eur: '#,##0.00 "€"', date: 'dd/mm/yyyy' }

function fmtFromCode(code?: string): NumFmt {
  if (!code || code === 'General') return ''
  if (/[dy]/i.test(code.replace(/"[^"]*"/g, '')) && /[dmy]/i.test(code)) return 'date'
  if (code.includes('%')) return 'pct'
  if (/[€$]/.test(code)) return 'eur'
  if (/0\.0/.test(code)) return 'dec2'
  if (/0/.test(code)) return 'int'
  return ''
}

const argb = (hex?: string) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? `FF${hex.slice(1).toUpperCase()}` : undefined)
const hexOf = (a?: string) => (a && /^[0-9a-f]{8}$/i.test(a) && a.toUpperCase() !== 'FF000000' ? `#${a.slice(2).toLowerCase()}` : undefined)

export async function exportXlsx(book: Workbook): Promise<Blob> {
  const { Workbook: XWorkbook } = await import('exceljs')
  const wb = new XWorkbook()
  wb.creator = 'FileProyect'
  const ev = new Evaluator(book)
  for (const sheet of book.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    for (const [c, w] of Object.entries(sheet.colW)) ws.getColumn(Number(c) + 1).width = Math.max(4, Math.round(w / 7))
    for (const k in sheet.cells) {
      const [r, c] = parseKey(k)
      const cell: Cell = sheet.cells[k]
      const target = ws.getCell(r + 1, c + 1)
      const value = ev.value(sheet.name, r, c)
      if (cell.v[0] === '=' && cell.v.length > 1) {
        const result = value !== null && typeof value === 'object' ? { error: value.error as '#REF!' } : value ?? undefined
        target.value = { formula: cell.v.slice(1), result } as never
      } else if (value !== null && typeof value !== 'object') target.value = value
      const s = cell.s
      if (s) {
        if (s.b || s.i || s.color) target.font = { bold: s.b, italic: s.i, color: argb(s.color) ? { argb: argb(s.color)! } : undefined }
        if (s.bg && argb(s.bg)) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(s.bg)! } }
        if (s.align) target.alignment = { horizontal: s.align }
        if (s.fmt) target.numFmt = FMT_CODE[s.fmt]
      }
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function importXlsx(data: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const { Workbook: XWorkbook } = await import('exceljs')
  const wb = new XWorkbook()
  await wb.xlsx.load(data as ArrayBuffer)
  const sheets: Workbook['sheets'] = []
  wb.eachSheet((ws) => {
    const cells: Record<string, Cell> = {}
    const colW: Record<number, number> = {}
    ws.columns?.forEach((col, i) => { if (col?.width) colW[i] = Math.round(col.width * 7) })
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      row.eachCell({ includeEmpty: false }, (c, cn) => {
        const v = c.value as unknown
        let text = ''
        if (v === null || v === undefined) text = ''
        else if (typeof v === 'object' && v !== null && 'formula' in v && (v as { formula?: string }).formula) text = `=${(v as { formula: string }).formula}`
        else if (typeof v === 'object' && v !== null && 'sharedFormula' in v) {
          const res = (v as { result?: unknown }).result
          text = res === undefined || res === null ? '' : String(res)
        } else if (v instanceof Date) text = String(Math.round(v.getTime() / 86400000 + 25569))
        else if (typeof v === 'object' && v !== null && 'richText' in v) text = (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('')
        else if (typeof v === 'object' && v !== null && 'text' in v) text = String((v as { text: unknown }).text)
        else if (typeof v === 'object' && v !== null && 'error' in v) text = String((v as { error: string }).error)
        else text = String(v)
        const s: CellStyle = {}
        if (c.font?.bold) s.b = true
        if (c.font?.italic) s.i = true
        const fc = hexOf(c.font?.color?.argb)
        if (fc) s.color = fc
        const fill = c.fill as { type?: string; fgColor?: { argb?: string } } | undefined
        const bg = fill?.type === 'pattern' ? hexOf(fill.fgColor?.argb) : undefined
        if (bg) s.bg = bg
        const al = c.alignment?.horizontal
        if (al === 'left' || al === 'center' || al === 'right') s.align = al
        const fmt = fmtFromCode(c.numFmt)
        if (fmt) s.fmt = fmt
        if (text !== '' || Object.keys(s).length) cells[key(rn - 1, cn - 1)] = Object.keys(s).length ? { v: text, s } : { v: text }
      })
    })
    sheets.push({ name: ws.name, cells, colW })
  })
  if (!sheets.length) sheets.push({ name: 'Hoja 1', cells: {}, colW: {} })
  return { sheets }
}

export { usedSize }
