import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { downloadBlob } from './docx-fill'

export type SheetRow = Record<string, unknown>

export interface ImportResult {
  added: number
  errors: string[]
}

/** Reads the first sheet of an .xlsx/.xls/.csv file into an array of row objects keyed by header. */
export async function parseSpreadsheetFile(file: File): Promise<SheetRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' })
}

/** Triggers a download of an .xlsx template with the given headers, optionally pre-filled with a sample row. */
export function downloadSpreadsheetTemplate(headers: string[], filename: string, sampleRow?: SheetRow) {
  const rows = [sampleRow ?? Object.fromEntries(headers.map(h => [h, ''] as const))]
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Шаблон')
  XLSX.writeFile(wb, filename)
}

/** Exports an array of row objects to an .xlsx file, preserving the given header order. */
export function exportRowsToSpreadsheet(headers: string[], rows: SheetRow[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export interface StyledExportOptions {
  /** Header row fill, hex without '#' (e.g. "14B8A6" for teal-500) — matches the module's in-app table header color. */
  headerColor: string
  /** Totals row fill, hex without '#'; defaults to a light tint derived from headerColor. */
  totalColor?: string
  /** Header names whose column should be summed in the totals row. Omit to skip the totals row entirely. */
  numericColumns?: string[]
  /** Label for the totals row's first cell. */
  totalLabel?: string
}

/** Builds one colored, auto-sized worksheet (header row + data + optional totals row) inside an existing workbook. */
function addStyledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: SheetRow[],
  opts: StyledExportOptions
) {
  const ws = wb.addWorksheet(sheetName)

  ws.addRow(headers)
  rows.forEach(r => ws.addRow(headers.map(h => (r[h] as string | number | undefined) ?? '')))

  const numericCols = opts.numericColumns ?? []
  let totalsRow: ExcelJS.Row | null = null
  if (numericCols.length) {
    const totals = headers.map((h, i) => {
      if (i === 0) return opts.totalLabel ?? 'Общо'
      if (!numericCols.includes(h)) return ''
      const sum = rows.reduce((s, r) => s + (Number(r[h]) || 0), 0)
      return Math.round(sum * 100) / 100
    })
    totalsRow = ws.addRow(totals)
  }

  // Auto-size each column to its widest cell (header, data, or totals).
  ws.columns.forEach((col, i) => {
    let max = String(headers[i] ?? '').length
    rows.forEach(r => { max = Math.max(max, String(r[headers[i]] ?? '').length) })
    if (totalsRow) max = Math.max(max, String(totalsRow.getCell(i + 1).value ?? '').length)
    col.width = Math.max(10, max + 3)
  })

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${opts.headerColor}` } }
  ws.getRow(1).eachCell(cell => {
    cell.fill = headerFill
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle' }
  })

  if (totalsRow) {
    const usingTint = !!opts.totalColor
    const totalFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${opts.totalColor ?? opts.headerColor}` } }
    totalsRow.eachCell(cell => {
      cell.fill = totalFill
      cell.font = { bold: true, color: { argb: usingTint ? 'FF1F2937' : 'FFFFFFFF' } }
    })
  }

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  }
  ws.eachRow(row => row.eachCell(cell => { cell.border = thinBorder }))
}

/**
 * Exports rows to a formatted .xlsx: colored header row (matching the module's in-app table header),
 * columns auto-sized to their content, and — when `numericColumns` is given — a colored totals row
 * summing those columns at the bottom. Saves via `downloadBlob` (native save in the Electron app, so
 * the file isn't tagged as downloaded-from-the-internet and opens normally in Excel).
 */
export async function exportStyledRowsToSpreadsheet(
  headers: string[],
  rows: SheetRow[],
  sheetName: string,
  filename: string,
  opts: StyledExportOptions
) {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, sheetName, headers, rows, opts)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await downloadBlob(blob, filename)
}

export interface StyledSheetSpec extends StyledExportOptions {
  sheetName: string
  headers: string[]
  rows: SheetRow[]
}

/** Same styling as `exportStyledRowsToSpreadsheet`, but bundles several sheets into a single .xlsx file. */
export async function exportStyledWorkbook(sheets: StyledSheetSpec[], filename: string) {
  const wb = new ExcelJS.Workbook()
  sheets.forEach(s => addStyledSheet(wb, s.sheetName, s.headers, s.rows, s))
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await downloadBlob(blob, filename)
}

/** Looks up a value in a row by one or more possible header names, case/whitespace-insensitive. */
export function rowGet(row: SheetRow, ...names: string[]): unknown {
  const normalized = Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v] as const)
  for (const name of names) {
    const target = name.trim().toLowerCase()
    const found = normalized.find(([k]) => k === target)
    if (found) return found[1]
  }
  return undefined
}

export function cellToStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/** Parses a date cell (Excel Date, "yyyy-mm-dd" or "dd.mm.yyyy"/"dd/mm/yyyy") into "yyyy-mm-dd". */
export function cellToDateStr(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

export function cellToNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** Finds an item in a list whose given field matches the value, case/whitespace-insensitive. */
export function findByField<T extends object>(list: T[], field: keyof T, value: string): T | undefined {
  const q = value.trim().toLowerCase()
  if (!q) return undefined
  return list.find(x => String(x[field] ?? '').trim().toLowerCase() === q)
}
