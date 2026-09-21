import ExcelJS from 'exceljs'
import { downloadBlob } from './docx-fill'

export type SheetRow = Record<string, unknown>

export interface ImportResult {
  added: number
  errors: string[]
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells
}

function parseCsv(text: string): SheetRow[] {
  const lines: string[] = []
  let line = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { line += '""'; i++ }
      else { quoted = !quoted; line += char }
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      if (line) lines.push(line)
      line = ''
    } else line += char
  }
  if (line) lines.push(line)
  if (!lines.length) return []
  const delimiter = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ';' : ','
  const headers = parseCsvLine(lines[0], delimiter).map(h => h.replace(/^\uFEFF/, '').trim())
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line, delimiter)
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))
  })
}

function excelCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result
    if ('text' in value) return value.text
    if ('richText' in value) return value.richText.map(part => part.text).join('')
  }
  return value
}

/** Reads the first sheet of an .xlsx or .csv file into an array of row objects keyed by header. */
export async function parseSpreadsheetFile(file: File): Promise<SheetRow[]> {
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text())
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const sheet = wb.worksheets[0]
  if (!sheet) return []
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(value => String(excelCellValue(value) ?? '').trim())
  const rows: SheetRow[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values = row.values as ExcelJS.CellValue[]
    rows.push(Object.fromEntries(headers.map((header, i) => [header, excelCellValue(values[i + 1]) ?? ''])))
  })
  return rows
}

/** Triggers a download of an .xlsx template with the given headers, optionally pre-filled with a sample row. */
export function downloadSpreadsheetTemplate(headers: string[], filename: string, sampleRow?: SheetRow) {
  void exportRowsToSpreadsheet(headers, [sampleRow ?? Object.fromEntries(headers.map(h => [h, ''] as const))], 'Шаблон', filename)
}

/** Exports an array of row objects to an .xlsx file, preserving the given header order. */
export async function exportRowsToSpreadsheet(headers: string[], rows: SheetRow[], sheetName: string, filename: string) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  ws.addRow(headers)
  rows.forEach(row => ws.addRow(headers.map(header => row[header] ?? '')))
  const buf = await wb.xlsx.writeBuffer()
  await downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
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

/** Strips characters Windows/macOS disallow in filenames, so a filter label can drop straight into one. */
function sanitizeFilenamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim()
}

/**
 * Builds an export filename as "<base>_<filter1>_<filter2>..._<yyyy-mm-dd>.xlsx" — any active filter
 * label (ХТУ, status, paid/unpaid, ...) gets folded in so a filtered export is distinguishable from
 * the full list on disk. Falsy filters (no filter applied) are skipped.
 */
export function exportFilename(base: string, filters: (string | null | undefined | false)[], ext = 'xlsx'): string {
  const parts = [base, ...filters.filter((f): f is string => !!f).map(sanitizeFilenamePart)]
  return `${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.${ext}`
}

/** Looks up a value in a row by one or more possible header names, case/whitespace-insensitive. */
export function rowGet(row: SheetRow, ...names: string[]): unknown {
  const normalized = Object.entries(row).map(([k, v]) => [normalizeHeader(k), v] as const)
  for (const name of names) {
    const target = normalizeHeader(name)
    const found = normalized.find(([k]) => k === target)
    if (found) return found[1]
  }
  return undefined
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\u00A0/g, ' ').trim().toLowerCase().replace(/[€$£]/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
}

export function cellToStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/** Parses a date cell (Excel Date, "yyyy-mm-dd" or "dd.mm.yyyy"/"dd/mm/yyyy", 2- or 4-digit year) into "yyyy-mm-dd". */
export function cellToDateStr(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/)
  if (m) {
    const [, d, mo, yRaw] = m
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

export function cellToNum(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let text = String(v).replace(/\u00A0/g, ' ').trim().replace(/[€$£]/g, '').replace(/\s+/g, '')
  if (!text) return 0
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    text = text.replace(new RegExp(`\\${thousands}`, 'g'), '').replace(decimal, '.')
  } else if (comma >= 0) {
    text = text.replace(',', '.')
  }
  text = text.replace(/[^\d.+-]/g, '')
  const n = Number(text)
  return isNaN(n) ? 0 : n
}

/** Finds an item in a list whose given field matches the value, case/whitespace-insensitive. */
export function findByField<T extends object>(list: T[], field: keyof T, value: string): T | undefined {
  const q = normStr(value)
  if (!q) return undefined
  return list.find(x => normStr(String(x[field] ?? '')) === q)
}

/** Normalises a string for loose comparison: lowercase, collapse whitespace, strip dots,
 *  and strip spaces around hyphens so "A - B" ≡ "A-B". */
function normStr(s: string): string {
  return s.trim().toLowerCase().replace(/\./g, '').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ')
}

function normalizeWords(s: string): string[] {
  return normStr(s).split(' ').filter(Boolean)
}

/**
 * True if the words of the shorter name all appear among the words of the longer one — regardless
 * of order or position. So a shortened form ("Помпено" vs "Помпено напояване") or a qualified/variant
 * form of a shorter base name ("Царевица за силаж" / "Други зеленчуци" vs "Царевица" / "Зеленчуци")
 * counts as the same thing. Meant for small curated lists (crops, irrigation methods, ХТУ) where a
 * shortened/qualified name should still count as the same record — not for open-ended freeform names
 * (contractors, invoice numbers) where this could match the wrong record.
 */
export function namesMatch(a: string, b: string): boolean {
  const aWords = normalizeWords(a)
  const bWords = normalizeWords(b)
  if (aWords.length === 0 || bWords.length === 0) return false
  const aSet = new Set(aWords)
  const bSet = new Set(bWords)
  const [shorter, longer] = aWords.length <= bWords.length ? [aSet, bSet] : [bSet, aSet]
  for (const w of shorter) if (!longer.has(w)) return false
  return true
}

/** Like `findByField`, but falls back to `namesMatch` against each entry's field when there's no exact match. */
export function findSimilarByField<T extends object>(list: T[], field: keyof T, value: string): T | undefined {
  const exact = findByField(list, field, value)
  if (exact) return exact
  if (!value.trim()) return undefined
  return list.find(x => namesMatch(String(x[field] ?? ''), value))
}
