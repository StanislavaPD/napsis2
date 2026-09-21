import { useState, useRef } from 'react'
import PizZip from 'pizzip'
import { useStore } from '../store'
import type { Contract, Act, IrrigRequest, Contractor } from '../types'
import { Btn, FormRow, Input, NumberInput, Select, Autocomplete, num, DownloadIcon, PrinterIcon, SaveIcon, FileTextIcon, ToolsIcon, WaterDropIcon } from './ui'
import { fillDocxTemplate, downloadBlob, openInDefaultApp, docxFillErrorMessage, type DocxTagData } from '../lib/docx-fill'

const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
const DOC_TYPES = ['Акт', 'Фактура', 'Протокол', 'Разписка', 'Друго']

/** Formats an "yyyy-mm-dd" date string as "dd.mm.yy". */
function formatShortDate(date?: string): string {
  if (!date) return '__.__.__'
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y.slice(2)}`
}

/** Formats an "yyyy-mm-dd" date string as "dd.mm." (day and month only, no year). */
function formatDayMonth(date?: string): string {
  if (!date) return '...................'
  const [, m, d] = date.split('-')
  if (!m || !d) return date
  return `${d}.${m}.`
}

/** Derives the Bulgarian month name from an "yyyy-mm-dd" date string. */
function monthNameFromDate(date?: string): string {
  if (!date) return ''
  const m = parseInt(date.split('-')[1], 10)
  return MONTHS[m - 1] ?? ''
}

/** Escapes text for safe insertion into an HTML or XML string. */
function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Formats a дка (area) value for a generated document: whole numbers print without decimals (55, not 55.00); fractional values keep up to 2. */
function numArea(v: number | string): string {
  const n = Number(v)
  return isNaN(n) ? '0' : n.toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Pads a list with `null` placeholders so it renders at least `min` table rows (blank ones for manual filling), matching the real template's pre-ruled blank rows. */
function padRows<T>(rows: T[], min: number): (T | null)[] {
  return rows.length >= min ? rows : [...rows, ...Array(min - rows.length).fill(null)]
}

const BG_ONES = ['', 'едно', 'две', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет']
const BG_TEENS = ['десет', 'единадесет', 'дванадесет', 'тринадесет', 'четиринадесет', 'петнадесет', 'шестнадесет', 'седемнадесет', 'осемнадесет', 'деветнадесет']
const BG_TENS = ['', '', 'двадесет', 'тридесет', 'четиридесет', 'петдесет', 'шестдесет', 'седемдесет', 'осемдесет', 'деветдесет']
const BG_HUNDREDS = ['', 'сто', 'двеста', 'триста', 'четиристотин', 'петстотин', 'шестстотин', 'седемстотин', 'осемстотин', 'деветстотин']

/** Spells out a 0-99 number in Bulgarian words. */
function bgTwoDigits(n: number): string {
  if (n === 0) return 'нула'
  if (n >= 10 && n < 20) return BG_TEENS[n - 10]
  const t = Math.floor(n / 10), o = n % 10
  if (t && o) return `${BG_TENS[t]} и ${BG_ONES[o]}`
  return t ? BG_TENS[t] : BG_ONES[o]
}

/** Spells out a 0-999 number in Bulgarian words (e.g. 310 -> "триста и десет", 325 -> "триста двадесет и пет"). */
function bgThreeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rem = n % 100
  if (!h) return bgTwoDigits(rem)
  if (!rem) return BG_HUNDREDS[h]
  // bgTwoDigits already inserts its own "и" when rem has both tens and ones (e.g. "двадесет и пет") —
  // in that case join with a plain space; otherwise (a bare ten/teen remainder) join with "и".
  const hasInternalAnd = rem >= 20 && rem % 10 !== 0
  return `${BG_HUNDREDS[h]}${hasInternalAnd ? ' ' : ' и '}${bgTwoDigits(rem)}`
}

/** Spells out a non-negative integer (up to millions) in Bulgarian words. */
function numberToWordsBG(n: number): string {
  if (n === 0) return 'нула'
  const millions = Math.floor(n / 1000000)
  const thousands = Math.floor((n % 1000000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions === 1) parts.push('един милион')
  else if (millions > 1) parts.push(`${bgThreeDigits(millions)} милиона`)
  if (thousands === 1) parts.push('хиляда')
  else if (thousands > 1) parts.push(`${bgThreeDigits(thousands)} хиляди`)
  if (rest > 0) parts.push(bgThreeDigits(rest))
  return parts.join(' ')
}

/** "две хиляди триста четиридесет и пет . петдесет и шест" style spelled-out amount, split on the decimal point. */
function amountToWordsBG(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const intPart = Math.floor(rounded)
  const decPart = Math.round((rounded - intPart) * 100)
  return `${numberToWordsBG(intPart)} . ${bgTwoDigits(decPart)}`
}

/** ИН по ДДС shown in the contract: auto-derived as "BG"+БУЛСТАТ when the contractor is marked VAT-registered. */
function vatDisplay(cont: Contractor | undefined): string {
  if (cont?.vatRegistered) return `BG${cont.bulstat || ''}`
  return cont?.vatNumber || '………………'
}

/**
 * Signature-line name: for a company, the МОЛ/manager (not the firm name) — nobody signs "/ Агро
 * Фарм ЕООД /". For a private person or ЗП, their own name, with a leading "ЗП" label stripped
 * since it's redundant on a signature line.
 */
function signatureName(cont: Contractor | undefined): string {
  if (!cont) return ''
  if (cont.entityType === 'legal') return cont.contact || cont.name || ''
  return cont.name.replace(/^\s*зп\.?\s+/i, '').trim()
}

/** Triggers a browser download of a text/HTML blob, saved as a Word-openable .doc file. */
function downloadWordHtml(html: string, filename: string) {
  const fullDoc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>@page{size:A4;margin:2cm 2cm 2.5cm 2cm}</style>
</head>
<body>${html}</body></html>`
  const blob = new Blob(['﻿', fullDoc], { type: 'application/msword' })
  downloadBlob(blob, filename)
}

// ─── OOXML (real .docx) BUILDERS ──────────────────────────────────────────────
const DOCX_NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14"'

/** A run of text in the document's base font (Times New Roman 9pt), optionally bold/caps. */
function xw(text: string | number | undefined | null, bold = false, caps = false, size = 18): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bold ? '<w:b/>' : ''}${caps ? '<w:caps/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

/** A manual page break, so the next paragraph starts on a fresh page. */
function xPageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

type XParaOpts = { jc?: 'left' | 'center' | 'right' | 'both'; indent?: boolean; before?: number; after?: number }

/** A paragraph wrapping the given run(s) XML. */
function xp(runsXml: string, opts: XParaOpts = {}): string {
  const props: string[] = []
  if (opts.jc) props.push(`<w:jc w:val="${opts.jc}"/>`)
  // Always set indentation explicitly (zero when not indenting) so paragraphs never inherit a
  // stray left/first-line indent from the source template's Normal style — this was showing up as
  // unwanted space in front of table headers and values.
  props.push(opts.indent ? '<w:ind w:firstLine="708"/>' : '<w:ind w:left="0" w:right="0" w:firstLine="0"/>')
  if (opts.before != null || opts.after != null) props.push(`<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 0}"/>`)
  return `<w:p><w:pPr>${props.join('')}</w:pPr>${runsXml}</w:p>`
}

/** A paragraph built from [text, bold, caps] run parts. */
function xpm(parts: [string | number | undefined | null, boolean?, boolean?][], opts: XParaOpts = {}): string {
  return xp(parts.map(([t, b, c]) => xw(t, !!b, !!c)).join(''), opts)
}

/** A centered bold section heading paragraph. */
function xHeading(text: string, before = 240): string {
  return xp(xw(text, true), { jc: 'center', before })
}

/** A justified, first-line-indented body paragraph, from plain text or [text,bold,caps] parts. */
function xBody(parts: string | [string | number | undefined | null, boolean?, boolean?][], before = 80): string {
  const arr = Array.isArray(parts) ? parts : [[parts, false] as [string, boolean]]
  return xpm(arr, { jc: 'both', indent: true, before })
}

interface XCellOpts { bold?: boolean; gridSpan?: number; width?: number; align?: 'left' | 'center' | 'right'; vMerge?: 'restart' | 'continue'; subText?: string; shade?: string; fontSize?: number }

/** A table cell; vMerge:'continue' cells render empty (they visually inherit the cell above). */
function xtc(text: string | number | undefined | null, opts: XCellOpts = {}): string {
  const tcPr: string[] = []
  if (opts.width) tcPr.push(`<w:tcW w:w="${opts.width}" w:type="dxa"/>`)
  if (opts.gridSpan) tcPr.push(`<w:gridSpan w:val="${opts.gridSpan}"/>`)
  if (opts.vMerge === 'restart') tcPr.push('<w:vMerge w:val="restart"/>')
  if (opts.vMerge === 'continue') tcPr.push('<w:vMerge/>')
  if (opts.shade) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`)
  tcPr.push('<w:tcMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tcMar>')
  tcPr.push('<w:vAlign w:val="center"/>')
  const jc = opts.align === 'right' ? 'right' : opts.align === 'center' ? 'center' : 'left'
  let content = opts.vMerge === 'continue' ? '<w:p/>' : (text !== undefined && text !== null && text !== '' ? xp(xw(text, opts.bold, false, opts.fontSize ?? 18), { jc }) : '<w:p/>')
  if (opts.subText && opts.vMerge !== 'continue') {
    const subRun = `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${esc(opts.subText)}</w:t></w:r>`
    content += xp(subRun, { jc })
  }
  return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${content}</w:tc>`
}

function xtr(cellsXml: string, heightTwips?: number): string {
  const trPr = heightTwips ? `<w:trPr><w:trHeight w:val="${heightTwips}" w:hRule="atLeast"/></w:trPr>` : ''
  return `<w:tr>${trPr}${cellsXml}</w:tr>`
}

/** A bordered table with the given column widths (twips). */
function xtable(rowsXml: string, colWidths: number[], indent = 0, center = false): string {
  const total = colWidths.reduce((s, w) => s + w, 0)
  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>'
  const ind = indent ? `<w:tblInd w:w="${indent}" w:type="dxa"/>` : ''
  const jc = center ? '<w:jc w:val="center"/>' : ''
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${jc}${ind}${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl>`
}

// ─── DOCX TEMPLATE UPLOAD + FILL ──────────────────────────────────────────────
interface TagInfo { tag: string; label: string }

/** Upload widget for an existing .docx blank + button that fills its {tags} with the current form data and downloads it. */
function TemplateUpload({
  accent, templateFile, onFileChange, onFill, filling, fillError, tags,
}: {
  accent: { border: string; text: string }
  templateFile: File | null
  onFileChange: (f: File | null) => void
  onFill: () => void
  filling: boolean
  fillError: string
  tags: TagInfo[]
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [showTags, setShowTags] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer transition-colors ${accent.border}`}
        onClick={() => ref.current?.click()}
      >
        <input
          ref={ref}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
        />
        {templateFile ? (
          <p className={`text-sm font-medium ${accent.text}`}>📎 {templateFile.name}</p>
        ) : (
          <>
            <p className="text-xs font-medium text-gray-500">Прикачи качена бланка (.docx)</p>
            <p className="text-xs text-gray-400 mt-0.5">Шаблонът трябва да съдържа {'{тагове}'} за автоматично попълване</p>
          </>
        )}
      </div>

      {templateFile && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={onFill} disabled={filling} className="flex-1">
              {filling ? 'Попълване…' : '⚙️ Попълни бланката и изтегли'}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => onFileChange(null)}>✕</Btn>
          </div>
          {fillError && <p className="text-xs text-red-500">{fillError}</p>}
          <button
            type="button"
            onClick={() => setShowTags(s => !s)}
            className="text-xs text-gray-400 hover:text-gray-600 underline self-start"
          >
            {showTags ? 'Скрий таговете за бланката' : 'Кои тагове да сложа в бланката?'}
          </button>
          {showTags && (
            <div className="bg-gray-50 rounded-lg p-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 max-h-40 overflow-y-auto">
              {tags.map(t => (
                <p key={t.tag}><code className="text-gray-700 bg-white px-1 rounded border border-gray-100">{'{' + t.tag + '}'}</code> — {t.label}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function calcContract(f: Partial<Contract>): Partial<Contract> {
  const totalDka = Number(f.area ?? 0) * Number(f.irrigationCount ?? 0)
  const waterCubic = totalDka * Number(f.cubicPerDka ?? 0)
  const value = waterCubic * Number(f.unitPrice ?? 0)
  return { ...f, totalDka, waterCubic, value }
}

function calcAct(f: Partial<Act>): Partial<Act> {
  const value = Number(f.waterCubic ?? 0) * Number(f.unitPrice ?? 0)
  return { ...f, value }
}

// ─── CONTRACT GENERATOR ───────────────────────────────────────────────────────
function ContractGenerator() {
  const { contractors, htus, irrigationMethods, crops, contracts, setContracts } = useStore()
  const [form, setForm] = useState<Partial<Contract>>({
    date: new Date().toISOString().slice(0, 10),
    number: '',
    contractorId: contractors[0]?.id ?? '',
    htuId: htus[0]?.id ?? '',
    village: htus[0]?.village ?? '',
    irrigationMethodId: irrigationMethods[0]?.id ?? '',
    cropId: crops[0]?.id ?? '',
    area: 0, irrigationCount: 0, totalDka: 0, cubicPerDka: 0, waterCubic: 0, unitPrice: 0.0128, value: 0,
    irrigationNumber: '', month: '',
  })
  const [saved, setSaved] = useState(false)

  const [meteringMethod, setMeteringMethod] = useState<'device' | 'norm' | 'technical'>('norm')

  interface ExtraRow {
    id: string
    htuId: string
    village: string
    cropId: string
    irrigationMethodId: string
    area: number
    cubicPerDka: number
    irrigationCount: number
    unitPrice: number
  }
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([])

  function addExtraRow() {
    setExtraRows(rows => [...rows, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      htuId: htus[0]?.id ?? '', village: htus[0]?.village ?? '', cropId: crops[0]?.id ?? '',
      irrigationMethodId: irrigationMethods[0]?.id ?? '', area: 0, cubicPerDka: 0, irrigationCount: 0, unitPrice: 0.0128,
    }])
  }
  function updateExtraRow(id: string, patch: Partial<ExtraRow>) {
    setExtraRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function removeExtraRow(id: string) {
    setExtraRows(rows => rows.filter(r => r.id !== id))
  }

  const cont = contractors.find(c => c.id === form.contractorId)
  const htu = htus.find(h => h.id === form.htuId)
  const method = irrigationMethods.find(m => m.id === form.irrigationMethodId)
  const crop = crops.find(c => c.id === form.cropId)

  function computeTableRows() {
    const primaryRow = {
      equipment: htu?.equipment ?? '', village: form.village ?? '', cropName: crop?.name ?? '',
      methodName: method?.name ?? '', area: Number(form.area ?? 0), cubicPerDka: Number(form.cubicPerDka ?? 0),
      irrigationCount: form.irrigationCount ?? 0, unitPrice: Number(form.unitPrice ?? 0),
    }
    const tableRows = [
      primaryRow,
      ...extraRows.map(r => ({
        equipment: htus.find(h => h.id === r.htuId)?.equipment ?? '', village: r.village,
        cropName: crops.find(c => c.id === r.cropId)?.name ?? '',
        methodName: irrigationMethods.find(m => m.id === r.irrigationMethodId)?.name ?? '',
        area: r.area, cubicPerDka: r.cubicPerDka, irrigationCount: r.irrigationCount, unitPrice: r.unitPrice,
      })),
    ].map(r => {
      const waterPerWatering = r.area * r.cubicPerDka
      const rowTotal = waterPerWatering * r.unitPrice
      const perWatering = r.irrigationCount ? rowTotal / r.irrigationCount : 0
      const subTypeMatch = r.methodName.split(' - ')
      const methodSubType = subTypeMatch.length > 1 ? subTypeMatch[1].trim().toLowerCase() : ''
      return {
        ...r,
        waterCubic: waterPerWatering,
        rowTotal,
        perWatering,
        methodSubType,
        isGravity: r.methodName.toLowerCase().includes('гравитач'),
        isPumped: r.methodName.toLowerCase().includes('помпен'),
      }
    })
    const totalNoVat = tableRows.reduce((sum, r) => sum + r.rowTotal, 0)
    const totalWithVat = totalNoVat * 1.2
    return { tableRows, totalNoVat, totalWithVat }
  }

  function buildContractHtml(): string {
    const { tableRows, totalNoVat, totalWithVat } = computeTableRows()
    const base = 'font-family:"Times New Roman",Times,serif;font-size:9pt;color:#000'
    const pJ = `${base};text-align:justify;text-indent:1.25cm;margin:4pt 0 0 0`
    const pC = `${base};text-align:center;font-weight:bold;margin:12pt 0 0 0`
    const td = `border:0.5pt solid #000;padding:2pt 3pt;${base}`
    const tdR = `${td};text-align:right`
    const tdC = `${td};text-align:center`
    const tdH = `${td};text-align:center;background:#F2F2F2`
    const proxyClause = cont?.hasProxy
      ? `, чрез пълномощник ${esc(cont.proxyName || '…')}, ЕГН ${esc(cont.proxyEgn || '…')}, съгласно нот. зав. пълномощно № ${esc(cont.notaryDeedNumber || '…')}, издадено от нотариус ${esc(cont.notaryName || '…')} с район на действие: ${esc(cont.notaryJurisdiction || '…')}`
      : ''
    const party2Html = (!cont || cont.entityType === 'legal')
      ? `<p style="${pJ}"><b>2. </b>„<b>${esc(cont?.name || '……………………………………………………………………………………………….')}</b>”, ЕИК
      ${esc(cont?.bulstat || '………………….……')}, със седалище и адрес на управление:
      ${esc(cont?.address || '………………………………………………………………………………………………………')}, ИН по ДДС ${esc(vatDisplay(cont))}, представлявано от
      ${esc(cont?.contact || '………………….……………………….')} – управител${proxyClause}, тел. ${esc(cont?.phone || '……………………….')}, наричано по-долу <b>ВОДОПОЛЗВАТЕЛ</b>,</p>`
      : cont.entityType === 'farmer'
      ? `<p style="${pJ}">Земеделски производител: ${esc(cont.name || '…')}, ЕИК ${esc(cont.bulstat || '…')}, ЕГН ${esc(cont.egn || '…')}, л.к. № ${esc(cont.idCardNumber || '…')}, изд. на ${esc(cont.idCardIssuedDate || '…')} и с адрес по л.к.: ${esc(cont.address || '…')}${proxyClause}, тел. ${esc(cont.phone || '……………………….')}, наричано <b>ВОДОПОЛЗВАТЕЛ</b>,</p>`
      : `<p style="${pJ}">Физическо лице: ${esc(cont.name || '…')}, ЕГН ${esc(cont.egn || '…')}, л.к. № ${esc(cont.idCardNumber || '…')}, изд. на ${esc(cont.idCardIssuedDate || '…')} и с адрес по л.к.: ${esc(cont.address || '…')}${proxyClause}, тел. ${esc(cont.phone || '……………………….')}, наричано <b>ВОДОПОЛЗВАТЕЛ</b>,</p>`

    const tableRowsHtml = padRows(tableRows, 3).map((r, i) => r === null ? `
      <tr>
        <td style="${tdC}">${i + 1}</td>
        <td style="${td}"></td><td style="${td}"></td><td style="${td}"></td>
        <td style="${tdR}"></td><td style="${tdR}"></td><td style="${tdR}"></td>
        <td style="${tdR}"></td><td style="${tdR}"></td><td style="${tdC}"></td>
        <td style="${tdR}"></td><td style="${tdR}"></td><td style="${tdR}"></td>
      </tr>` : `
      <tr>
        <td style="${tdC}">${i + 1}</td>
        <td style="${td}">${esc(r.equipment)}</td>
        <td style="${td}">${esc(r.village)}</td>
        <td style="${td}">${esc(r.cropName)}</td>
        <td style="${tdR}">${numArea(r.area)}</td>
        <td style="${tdR}">${num(r.cubicPerDka, 0)}</td>
        <td style="${tdR}">${num(r.waterCubic, 0)}</td>
        <td style="${tdR}">${r.isGravity ? `${num(r.waterCubic, 0)}${r.methodSubType ? `<div style="font-size:9pt;color:#666">${esc(r.methodSubType)}</div>` : ''}` : ''}</td>
        <td style="${tdR}">${r.isPumped ? `${num(r.waterCubic, 0)}${r.methodSubType ? `<div style="font-size:9pt;color:#666">${esc(r.methodSubType)}</div>` : ''}` : ''}</td>
        <td style="${tdC}">${r.irrigationCount || ''}</td>
        <td style="${tdR}">${num(r.unitPrice, 4)}</td>
        <td style="${tdR}">${num(r.perWatering, 2)}</td>
        <td style="${tdR};font-weight:bold">${num(r.rowTotal, 2)}</td>
      </tr>`).join('')

    return `
      <div style="text-align:center;margin-bottom:24pt;position:relative">
        <p style="${base};font-weight:bold;margin:0">Д О Г О В О Р</p>
        <p style="${base};font-weight:bold;margin:0">ЗА ДОСТАВКА НА ВОДА ЗА НАПОЯВАНЕ</p>
        <p style="${base};text-align:right;margin:0">${esc(form.number || '___')}/${esc(formatShortDate(form.date))}</p>
      </div>

      <p style="${pJ}">Днес, ${esc(formatDayMonth(form.date))} 2026. в гр. Ямбол, между:</p>

      <p style="${pJ}"><b>1. </b>„<b style="text-transform:uppercase">Напоителни системи</b> “<b>ЕАД</b> – клон „Средна Тунджа”, ЕИК: 831160078, със седалище и адрес
      на управление гр. Сливен, ул. „Д. Пехливанов” № 2, вписано в Търговския регистър при Агенция по
      вписванията, представлявано от управителя инж. Митошка Ишмериева и гл. счетоводител Стоянка Карагьозова,
      наричано по-долу <b>ДОСТАВЧИК</b></p>
      <p style="${base};margin:4pt 0 0 2.5cm">и</p>
      ${party2Html}
      <p style="${pJ};margin-top:24pt">се сключи настоящия договор.</p>

      <p style="${pC}">I. ПРЕДМЕТ НА ДОГОВОРА</p>
      <p style="${pJ}"><b>Чл.1.</b> ДОСТАВЧИКЪТ се задължава да доставя срещу възнаграждение вода за напояване за имоти и по култури,
      заявени от ВОДОПОЛЗВАТЕЛЯ, както следва:</p>

      <table style="width:18.63cm;max-width:18.63cm;margin-left:auto;margin-right:auto;border-collapse:collapse;margin-top:14pt;table-layout:fixed">
        <colgroup>
          <col style="width:0.55cm"><col style="width:1.33cm"><col style="width:1.54cm"><col style="width:1.32cm">
          <col style="width:1.15cm"><col style="width:2.00cm"><col style="width:1.25cm"><col style="width:1.48cm">
          <col style="width:1.48cm"><col style="width:1.38cm"><col style="width:1.33cm"><col style="width:1.71cm"><col style="width:2.13cm">
        </colgroup>
        <thead>
          <tr>
            <th style="${tdH}" rowspan="3">№</th>
            <th style="${tdH}" rowspan="3">напоителен канал, ПС</th>
            <th style="${tdH}" rowspan="3">землище</th>
            <th style="${tdH}" rowspan="3">култура</th>
            <th style="${tdH}" rowspan="2">Засети площи</th>
            <th style="${tdH}" rowspan="3">Напоителна норма м³/дка</th>
            <th style="${tdH}" colspan="4">Начин на доставка (водни маси)</th>
            <th style="${tdH}" rowspan="2">Цена по Заповед</th>
            <th style="${tdH}" rowspan="2">Дължима цена за поливката, без ДДС</th>
            <th style="${tdH}" rowspan="2">Дължима цена за всички поливки, без ДДС</th>
          </tr>
          <tr>
            <th style="${tdH}">Общо</th>
            <th style="${tdH}">Гравитачно</th>
            <th style="${tdH}">Помпено</th>
            <th style="${tdH}">поливки</th>
          </tr>
          <tr>
            <th style="${tdH}">дка</th>
            <th style="${tdH}">м³</th>
            <th style="${tdH}">м³</th>
            <th style="${tdH}">м³</th>
            <th style="${tdH}">брой</th>
            <th style="${tdH}">€</th>
            <th style="${tdH}">€</th>
            <th style="${tdH}">€</th>
          </tr>
        </thead>
        <tbody>${tableRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td style="${tdR};font-weight:bold;font-size:11pt;padding-top:8pt;padding-bottom:8pt" colspan="12">Общо прогнозна цена по договор без ДДС</td>
            <td style="${tdR};font-weight:bold;font-size:11pt;padding-top:8pt;padding-bottom:8pt">${num(totalNoVat, 2)}</td>
          </tr>
          <tr>
            <td style="${tdR};font-weight:bold;font-size:11pt;padding-top:8pt;padding-bottom:8pt" colspan="12">Общо прогнозна цена по договор с ДДС</td>
            <td style="${tdR};font-weight:bold;font-size:11pt;padding-top:8pt;padding-bottom:8pt">${num(totalWithVat, 2)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="${base};font-size:8pt;color:#666;margin:12pt 0 0 0">*Добавят се необходимия брой редове</p>

      <p style="${pC}">II. ОТЧИТАНЕ</p>
      <p style="${pJ};margin-top:14pt"><b>Чл.2.</b> Доставената вода се отчита след всяка поливка по един от следните начини:</p>
      <table style="width:6.57in;border-collapse:collapse;margin-top:14pt;table-layout:fixed">
        <colgroup><col style="width:5.96in"><col style="width:0.61in"></colgroup>
        <tr><td style="${td};padding:10pt 8pt">по показание на монтираното водомерно устройство</td><td style="${tdC};padding:10pt 8pt">${meteringMethod === 'device' ? 'Х' : ''}</td></tr>
        <tr><td style="${td};padding:10pt 8pt">по напоителна норма, съгласно Наредба за нормите за водопотребление</td><td style="${tdC};padding:10pt 8pt">${meteringMethod === 'norm' ? 'Х' : ''}</td></tr>
        <tr><td style="${td};padding:10pt 8pt">по технически параметри на поливна техника (описва се вида техника и се прилагат съответните документи, както и конкретните параметри) и времетраене на поливката</td><td style="${tdC};padding:10pt 8pt">${meteringMethod === 'technical' ? 'Х' : ''}</td></tr>
      </table>

      <p style="${pC}">IІІ. ЦЕНА НА УСЛУГАТА. ЦЕНА НА ЗАЯВКА И ОБЩА ЦЕНА. ОКОНЧАТЕЛНА ЦЕНА.</p>
      <p style="${pJ}"><b>Чл.3.</b> (1) Цената на услугата „доставка на вода за напояване“ за куб. метър е определена, както следва:
      доставка на вода за напояване по гравитачен път <b>0.0128</b> евро без ДДС; за помпено доставяне: <b>0.0194</b>
      евро без ДДС. Цената е оповестена на интернет страницата на дружеството на адрес: https://nps.bg/ - раздел
      ЦЕНИ НА ВОДАТА.</p>
      <p style="${pJ}">(2). Общата дължима по договора цена е <b>${num(totalWithVat, 2)} €</b> /с думи: ${esc(amountToWordsBG(totalWithVat))}/ евро и е формирана като сбор от
      цените за всички поливки с ДДС.</p>
      <p style="${pJ}">(3). Размерът на дължимата за всяка поливка цена се определя по реда на чл. 8, ал. 4 от Общите условия
      към договора за доставка на вода за напояване /Общите условия/ и се записва във всяка подадена Заявка за поливка
      /Приложение № 4 / към Общите условия.</p>
      <p style="${pJ}">(4). Окончателната цена на предоставената по договора услуга се определя въз основа на съставения
      по реда на чл.8, ал.6 от Общите условия Констативен протокол за действително доставен обем вода през поливен
      сезон 2026г. – /Приложение № 3/.</p>

      <p style="${pC};page-break-before:always">IІІ. НАЧИН НА ПЛАЩАНЕ.</p>
      <p style="${pJ}"><b>Чл.4.</b> (1) Дължимата от ВОДОПОЛЗВАТЕЛЯ по договора цена се заплаща периодично, след всяка поливка и
      издаване на фактура.</p>
      <p style="${pJ}">(2). Фактурата се издава в петдневен срок от съставяне от ДОСТАВЧИКА на „Акт за доставен обем вода“
      за съответната поливка. Във фактурата освен задължителните реквизити по Закона за счетоводството задължително се
      изписват: номер и срок на договора.</p>
      <p style="${pJ}">(3). ВОДОПОЛЗВАТЕЛЯТ заплаща сумата по фактурата по ал. 2 в петдневен срок от издаването й.</p>
      <p style="${pJ}">(4) Плащането на цената по ал. 2 се извършва в касата на ДОСТАВЧИКА при спазване на реда и
      условията, предвидени в ЗОПБ, или по банков път, по следната банкова сметка на ДОСТАВЧИКА:<br/>
      Банкова сметка: BG85IORT80481090732600<br/>
      BIC: IORTBGSF<br/>
      ИНВЕСТБАНК АД.</p>
      <p style="${pJ}">(5) При установена разлика между цената чл. 3, ал.2 и цената по чл. 3 ал.4, същата се заплаща или
      възстановява по реда на чл.8, ал.7 от Общите условия, като ДОСТАВЧИКЪТ издава фактура или кредитно известие.</p>
      <p style="${pJ}">(6) Дължимата по фактурата по ал. 5 стойност се заплаща от ВОДОПОЛЗВАТЕЛЯ в 5 дневен срок от
      издаването й. Стойността на издаденото по ал.5 кредитно известие се възстановява от ДОСТАВЧИКА на ВОДОПОЛЗВАТЕЛЯ
      в срок от 5 дни от издаването му, по банков път, по следната посочена от ВОДОПОЛЗВАТЕЛЯ банкова сметка:
      <b>${esc(cont?.iban || '…………………………………')}</b>,<br/>или в брой на каса на ДОСТАВЧИКА.</p>
      <p style="${pJ}">(7) При забава в плащането по ал.2 и ал.6, предложение първо, ВОДОПОЛЗВАТЕЛЯТ дължи законна лихва.</p>
      <p style="${pJ}">(8) До първа поливка ВОДОПОЛЗВАТЕЛЯТ може авансово да заплати пълния размер на прогнозно
      изчислената за напоителния сезон цена по Договора.</p>

      <p style="${pC}">IV. СРОК НА ДОГОВОРА</p>
      <p style="${pJ}"><b>Чл.5.</b> Настоящият договор се сключва за поливен сезон 2026г. и съобразно разрешителното за
      водовземане на ДОСТАВЧИКА.</p>

      <p style="${pC};margin-top:0">V. ПРАВА И ЗАДЪЛЖЕНИЯ НА СТРАНИТЕ</p>
      <p style="${pJ}"><b>Чл.6.</b> Правата и задълженията на страните са определени в Общите условия, оповестени на страницата
      на „Напоителни системи“ ЕАД: https://nps.bg/.</p>

      <p style="${pC}">VI. ЛИЧНИ ДАННИ</p>
      <p style="${pJ}"><b>Чл.7.</b> Личните данни на ВОДПОЛЗВАТЕЛИТЕ се обработват съобразно действащото национално и европейско
      законодателство. Подробна информация за вида данни, начина на обработването им, срока за съхранението им,
      правата на потребителите и друга информация се съдържа във "Вътрешните правила за защита на личните данни" на
      дружеството и в Общите условия, оповестени на интернет страницата на дружеството https://nps.bg/.</p>

      <p style="${pC}">VII. ОТГОВОРНОСТ ЗА НЕИЗПЪЛНЕНИЕ</p>
      <p style="${pJ}"><b>Чл.8.</b> Отговорността на страните за неизпълнение, обезщетенията и неустойките са определени в
      Общите условия.</p>

      <p style="${pC};margin-top:0">VIII. ПРЕКРАТЯВАНЕ НА ДОГОВОРА</p>
      <p style="${pJ}"><b>Чл. 9.</b> (1) Настоящият договор се прекратява:</p>
      <p style="${pJ}">1. по взаимно съгласие на страните, изразено в писмена форма;</p>
      <p style="${pJ}">2. с изтичане на договорения срок;</p>
      <p style="${pJ}">3. по искане на ВОДОПОЛЗВАТЕЛЯ с депозирано в деловодството на ДОСТАВЧИКА едномесечно писмено
      предизвестие;</p>
      <p style="${pJ}">4. едностранно от ДОСТАВЧИКА, без предизвестие, при неизпълнение на задължения на ВОДОПОЛЗВАТЕЛЯ
      по чл.19, т. 2, т. 4, т. 8, т. 9, предложение трето от Общите условия и чл. 19, т. 18 от Общите условия. В този
      случай ДОСТАВЧИКЪТ не дължи на ВОДОПОЛЗВАТЕЛЯ обезщетение за вреди причинени му от спиране на водоподаването.</p>
      <p style="${pJ}">5. едностранно от ДОСТАВЧИКА с едномесечно писмено предизвестие при неизпълнение на останалите
      задължения на ВОДОПОЛЗВАТЕЛЯ.</p>
      <p style="${pJ}"><b>Чл.10.</b> Всички съобщения и уведомления между страните се изпращат на следните адреси:</p>
      <p style="${pJ}">За ДОСТАВЧИКА: гр. Сливен, ул. „Д. Пехливанов” № 2</p>
      <p style="${pJ}">За ВОДОПОЛЗВАТЕЛЯ: ${esc(cont?.address || '__________________________________________')}</p>
      <p style="${pJ}"><b>Чл.11.</b> При промяна на адреса за кореспонденция, страната, която го е променила, се задължава да
      уведоми другата страна. В противен случай, всички изпратени съобщения ще се считат за получени.</p>

      <p style="${pC};page-break-before:always">IX. ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ</p>
      <p style="${pJ}"><b>Чл.12.</b>С подписването на настоящия договор ВОДОПОЛЗВАТЕЛЯТ декларира, че е запознат и приема
      Общите условия за доставка на вода за напояване и се съгласява с тях.</p>
      <p style="${pJ}"><b>Чл.13.</b> За неуредените в този договор въпроси се прилагат Общите условия.</p>
      <p style="${pJ}"><b>Чл.14.</b> Настоящият договор се сключва в два еднообразни екземпляра по един за всяка от страните.</p>
      <p style="${base};margin:8pt 0 0 0"><b>Неразделна част от този договор са:</b></p>
      <p style="${pJ}">1.Приложение № 1 - Заявление за имоти и култури за напояване през поливен сезон 2026г. по чл.6,
      ал.1 и ал.2 от Общите условия;</p>
      <p style="${pJ}">2.Приложение № 2 - Опис протокол за контролно замерване на действително засетите площи през
      поливен сезон 2026г. по чл.9, ал.2 от Общите условия;</p>
      <p style="${pJ}">3. Приложение №3 - Констативен протокол за доставен обем вода през поливен сезон 2026г. по чл.8,
      ал.6 от Общите условия;</p>
      <p style="${pJ}">4. Приложение № 4 - Заявка за поливка по чл.9, ал.1 от Общите условия;</p>
      <p style="${pJ}">5. Декларация за съгласие за събиране, използване и обработване на лични данни Декларация за
      съгласие за обработване на лични данни по чл.26, ал. 2 от Общите условия;</p>
      <p style="${pJ}">6. Общи условия към договора за доставка на вода за напояване.</p>
      <p style="${pJ}">7. Пълномощно за ВОДОПОЛЗВАТЕЛ (когато се подписва договорът с пълномощник);</p>

      <div style="margin-top:24pt">
        <p style="${base};font-weight:bold;margin:0 0 16pt 0">ДОГОВАРЯЩИ СТРАНИ:</p>
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="${base};vertical-align:top;width:50%;padding:0 8pt 0 0">
            <p style="${base};margin:0"><b>ДОСТАВЧИК</b>: ...................................</p>
            <p style="${base};font-size:8pt;margin:16pt 0 0 0">Управител на клон „Средна Тунджа”</p>
            <p style="${base};font-size:8pt;margin:0">инж. Митошка Ишмериева</p>
            <p style="${base};font-size:8pt;margin:16pt 0 0 0">Главен счетоводител клон ...................................</p>
            <p style="${base};font-size:8pt;margin:0">Стоянка Бянова Карагьозова</p>
            <p style="${base};font-size:8pt;margin:16pt 0 0 0">Р-л ХТР: ...................................</p>
            <p style="${base};font-size:8pt;margin:0">инж. Николай Петров Касидов</p>
            <p style="${base};font-size:8pt;margin:16pt 0 0 0">Изготвил: ...................................</p>
            <p style="${base};font-size:8pt;margin:0">инж. УДВН Станислава Петрова Димитрова</p>
          </td>
          <td style="${base};vertical-align:top;width:50%;padding:0 0 0 8pt">
            <p style="${base};margin:0"><b>ВОДОПОЛЗВАТЕЛ</b>: ...................................</p>
            <p style="${base};font-size:8pt;margin:16pt 0 0 0">/ ${esc(signatureName(cont))} /</p>
          </td>
        </tr></table>
      </div>
    `
  }

  function buildContractOoxmlBody(): string {
    const { tableRows, totalNoVat, totalWithVat } = computeTableRows()

    // Column widths and row heights below are copied verbatim from the real template's
    // word/document.xml (tblGrid/gridCol widths and trHeight values), not estimated from screenshots.
    const mainColWidths = [312, 751, 871, 746, 652, 1133, 708, 839, 837, 782, 753, 969, 1207]
    const [w0, w1, w2, w3, w4, w5, w6, w7, w8, w9, w10, w11, w12] = mainColWidths
    const hdr: XCellOpts = { shade: 'F2F2F2' }
    // Row A: most headers vMerge down through rows B/C, except "Дължима цена за всички поливки,
    // без ДДС" (w12), which the real template leaves blank here — its label actually starts in row B.
    const headerRowA = xtr(
      xtc('№', { ...hdr, align: 'center', vMerge: 'restart', width: w0 }) +
      xtc('напоителен канал, ПС', { ...hdr, align: 'center', vMerge: 'restart', width: w1 }) +
      xtc('землище', { ...hdr, align: 'center', vMerge: 'restart', width: w2 }) +
      xtc('култура', { ...hdr, align: 'center', vMerge: 'restart', width: w3 }) +
      xtc('Засети площи', { ...hdr, align: 'center', vMerge: 'restart', width: w4 }) +
      xtc('Напоителна норма м³/дка', { ...hdr, align: 'center', vMerge: 'restart', width: w5 }) +
      xtc('Начин на доставка (водни маси)', { ...hdr, align: 'center', gridSpan: 4, width: w6 + w7 + w8 + w9 }) +
      xtc('Цена по Заповед', { ...hdr, align: 'center', vMerge: 'restart', width: w10 }) +
      xtc('Дължима цена за поливката, без ДДС', { ...hdr, align: 'center', vMerge: 'restart', width: w11 }) +
      xtc('', { ...hdr, width: w12 }),
      280
    )
    const headerRowB = xtr(
      xtc('', { ...hdr, vMerge: 'continue', width: w0 }) + xtc('', { ...hdr, vMerge: 'continue', width: w1 }) + xtc('', { ...hdr, vMerge: 'continue', width: w2 }) +
      xtc('', { ...hdr, vMerge: 'continue', width: w3 }) + xtc('', { ...hdr, vMerge: 'continue', width: w4 }) + xtc('', { ...hdr, vMerge: 'continue', width: w5 }) +
      xtc('Общо', { ...hdr, align: 'center', width: w6 }) +
      xtc('Гравитачно', { ...hdr, align: 'center', width: w7 }) +
      xtc('Помпено', { ...hdr, align: 'center', width: w8 }) +
      xtc('поливки', { ...hdr, align: 'center', width: w9 }) +
      xtc('', { ...hdr, vMerge: 'continue', width: w10 }) + xtc('', { ...hdr, vMerge: 'continue', width: w11 }) +
      xtc('Дължима цена за всички поливки, без ДДС', { ...hdr, align: 'center', width: w12 }),
      1217
    )
    const headerRowC = xtr(
      xtc('', { ...hdr, vMerge: 'continue', width: w0 }) + xtc('', { ...hdr, vMerge: 'continue', width: w1 }) + xtc('', { ...hdr, vMerge: 'continue', width: w2 }) + xtc('', { ...hdr, vMerge: 'continue', width: w3 }) +
      xtc('дка', { ...hdr, align: 'center', width: w4 }) +
      xtc('', { ...hdr, vMerge: 'continue', width: w5 }) +
      xtc('м³', { ...hdr, align: 'center', width: w6 }) +
      xtc('м³', { ...hdr, align: 'center', width: w7 }) +
      xtc('м³', { ...hdr, align: 'center', width: w8 }) +
      xtc('брой', { ...hdr, align: 'center', width: w9 }) +
      xtc('€', { ...hdr, align: 'center', width: w10 }) +
      xtc('€', { ...hdr, align: 'center', width: w11 }) +
      xtc('€', { ...hdr, align: 'center', width: w12 }),
      294
    )
    const fs = 14 // 7pt — data rows use a smaller font than the header so filled-in values fit the narrow columns
    const dataRows = padRows(tableRows, 3).map((r, i) => r === null ? xtr(
      xtc(i + 1, { align: 'center', width: w0, fontSize: fs }) +
      xtc('', { width: w1, fontSize: fs }) + xtc('', { width: w2, fontSize: fs }) + xtc('', { width: w3, fontSize: fs }) +
      xtc('', { align: 'right', width: w4, fontSize: fs }) + xtc('', { align: 'right', width: w5, fontSize: fs }) +
      xtc('', { align: 'right', width: w6, fontSize: fs }) + xtc('', { align: 'right', width: w7, fontSize: fs }) +
      xtc('', { align: 'right', width: w8, fontSize: fs }) + xtc('', { align: 'center', width: w9, fontSize: fs }) +
      xtc('', { align: 'right', width: w10, fontSize: fs }) + xtc('', { align: 'right', width: w11, fontSize: fs }) +
      xtc('', { align: 'right', width: w12, fontSize: fs }),
      280
    ) : xtr(
      xtc(i + 1, { align: 'center', width: w0, fontSize: fs }) +
      xtc(r.equipment, { width: w1, fontSize: fs }) +
      xtc(r.village, { width: w2, fontSize: fs }) +
      xtc(r.cropName, { width: w3, fontSize: fs }) +
      xtc(numArea(r.area), { align: 'right', width: w4, fontSize: fs }) +
      xtc(num(r.cubicPerDka, 0), { align: 'right', width: w5, fontSize: fs }) +
      xtc(num(r.waterCubic, 0), { align: 'right', width: w6, fontSize: fs }) +
      xtc(r.isGravity ? num(r.waterCubic, 0) : '', { align: 'right', subText: r.isGravity ? r.methodSubType : undefined, width: w7, fontSize: fs }) +
      xtc(r.isPumped ? num(r.waterCubic, 0) : '', { align: 'right', subText: r.isPumped ? r.methodSubType : undefined, width: w8, fontSize: fs }) +
      xtc(r.irrigationCount || '', { align: 'center', width: w9, fontSize: fs }) +
      xtc(num(r.unitPrice, 4), { align: 'right', width: w10, fontSize: fs }) +
      xtc(num(r.perWatering, 2), { align: 'right', width: w11, fontSize: fs }) +
      xtc(num(r.rowTotal, 2), { bold: true, align: 'right', width: w12, fontSize: fs }),
      280
    )).join('')
    const totalsRows =
      xtr(xtc('Общо прогнозна цена по договор без ДДС', { bold: true, align: 'right', gridSpan: 12, fontSize: 22 }) + xtc(num(totalNoVat, 2), { bold: true, align: 'right', width: w12, fontSize: 22 }), 280) +
      xtr(xtc('Общо прогнозна цена по договор с ДДС', { bold: true, align: 'right', gridSpan: 12, fontSize: 22 }) + xtc(num(totalWithVat, 2), { bold: true, align: 'right', width: w12, fontSize: 22 }), 280)
    const mainTable = xtable(headerRowA + headerRowB + headerRowC + dataRows + totalsRows, mainColWidths, 0, true)

    // Total table width 6.57in = 9461 twips (matching the "Preferred width" of the real template's Чл.2 table).
    const meteringTable = xtable(
      xtr(xtc('по показание на монтираното водомерно устройство', { width: 8578 }) + xtc(meteringMethod === 'device' ? 'Х' : '', { bold: true, align: 'center', width: 883 })) +
      xtr(xtc('по напоителна норма, съгласно Наредба за нормите за водопотребление', { width: 8578 }) + xtc(meteringMethod === 'norm' ? 'Х' : '', { bold: true, align: 'center', width: 883 })) +
      xtr(xtc('по технически параметри на поливна техника (описва се вида техника и се прилагат съответните документи, както и конкретните параметри) и времетраене на поливката', { width: 8578 }) + xtc(meteringMethod === 'technical' ? 'Х' : '', { bold: true, align: 'center', width: 883 }), 190),
      [8578, 883]
    )

    const proxyClauseX = cont?.hasProxy
      ? `, чрез пълномощник ${cont.proxyName || '…'}, ЕГН ${cont.proxyEgn || '…'}, съгласно нот. зав. пълномощно № ${cont.notaryDeedNumber || '…'}, издадено от нотариус ${cont.notaryName || '…'} с район на действие: ${cont.notaryJurisdiction || '…'}`
      : ''
    const party2Xml = (!cont || cont.entityType === 'legal')
      ? xBody([
          ['2. ', true], ['„', false], [cont?.name || '……………………………………………………………………………………………….', true], ['”', false],
          [', ЕИК ', false], [cont?.bulstat || '………………….……', false],
          [', със седалище и адрес на управление: ' + (cont?.address || '………………………………………………………………………………………………………') + ', ИН по ДДС ' + vatDisplay(cont) + ', представлявано от ' + (cont?.contact || '………………….……………………….') + ' – управител' + proxyClauseX + ', тел. ' + (cont?.phone || '……………………….') + ', наричано по-долу ', false],
          ['ВОДОПОЛЗВАТЕЛ', true], [',', false],
        ])
      : cont.entityType === 'farmer'
      ? xBody([
          ['Земеделски производител: ' + (cont.name || '…') + ', ЕИК ' + (cont.bulstat || '…') + ', ЕГН ' + (cont.egn || '…') + ', л.к. № ' + (cont.idCardNumber || '…') + ', изд. на ' + (cont.idCardIssuedDate || '…') + ' и с адрес по л.к.: ' + (cont.address || '…') + proxyClauseX + ', тел. ' + (cont.phone || '……………………….') + ', наричано ', false],
          ['ВОДОПОЛЗВАТЕЛ', true], [',', false],
        ])
      : xBody([
          ['Физическо лице: ' + (cont.name || '…') + ', ЕГН ' + (cont.egn || '…') + ', л.к. № ' + (cont.idCardNumber || '…') + ', изд. на ' + (cont.idCardIssuedDate || '…') + ' и с адрес по л.к.: ' + (cont.address || '…') + proxyClauseX + ', тел. ' + (cont.phone || '……………………….') + ', наричано ', false],
          ['ВОДОПОЛЗВАТЕЛ', true], [',', false],
        ])

    const signatureTable = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid>` +
      xtr(
        `<w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr>` +
          xp(xw('ДОСТАВЧИК', true) + xw(': ...................................'), { before: 320 }) +
          xp(xw('Управител на клон „Средна Тунджа”', false, false, 16), { before: 320 }) +
          xp(xw('инж. Митошка Ишмериева', false, false, 16), {}) +
          xp(xw('Главен счетоводител клон ...................................', false, false, 16), { before: 320 }) +
          xp(xw('Стоянка Бянова Карагьозова', false, false, 16), {}) +
          xp(xw('Р-л ХТР: ...................................', false, false, 16), { before: 320 }) +
          xp(xw('инж. Николай Петров Касидов', false, false, 16), {}) +
          xp(xw('Изготвил: ...................................', false, false, 16), { before: 320 }) +
          xp(xw('инж. УДВН Станислава Петрова Димитрова', false, false, 16), {}) +
        `</w:tc>` +
        `<w:tc><w:tcPr><w:tcW w:w="4800" w:type="dxa"/></w:tcPr>` +
          xp(xw('ВОДОПОЛЗВАТЕЛ', true) + xw(': ...................................'), { before: 320 }) +
          xp(xw(`/ ${signatureName(cont)} /`, false, false, 16), { before: 320 }) +
        `</w:tc>`
      ) +
      `</w:tbl>`

    return [
      xp(xw('Д О Г О В О Р', true), { jc: 'center' }),
      xp(xw('ЗА ДОСТАВКА НА ВОДА ЗА НАПОЯВАНЕ', true), { jc: 'center' }),
      xBody(`Днес, ${formatDayMonth(form.date)} 2026. в гр. Ямбол, между:`, 480),
      xBody([
        ['1. ', true], ['„', false], ['Напоителни системи', true, true], [' “', false], ['ЕАД', true],
        [' – клон „Средна Тунджа”, ЕИК: 831160078, със седалище и адрес на управление гр. Сливен, ул. „Д. Пехливанов” № 2, вписано в Търговския регистър при Агенция по вписванията, представлявано от управителя инж. Митошка Ишмериева и гл. счетоводител Стоянка Карагьозова, наричано по-долу ', false],
        ['ДОСТАВЧИК', true],
      ]),
      `<w:p><w:pPr><w:ind w:left="1417" w:firstLine="0"/><w:spacing w:before="80" w:after="0"/></w:pPr>${xw('и')}</w:p>`,
      party2Xml,
      xBody('се сключи настоящия договор.', 480),

      xHeading('I. ПРЕДМЕТ НА ДОГОВОРА'),
      xBody([['Чл.1.', true], [' ДОСТАВЧИКЪТ се задължава да доставя срещу възнаграждение вода за напояване за имоти и по култури, заявени от ВОДОПОЛЗВАТЕЛЯ, както следва:', false]]),
      xp(xw('')),
      mainTable,
      xp(`<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="16"/><w:color w:val="808080"/></w:rPr><w:t xml:space="preserve">*Добавят се необходимия брой редове</w:t></w:r>`, { before: 240 }),

      xHeading('II. ОТЧИТАНЕ'),
      xBody([['Чл.2.', true], [' Доставената вода се отчита след всяка поливка по един от следните начини:', false]], 200),
      xp(xw('')),
      meteringTable,

      xHeading('IІІ. ЦЕНА НА УСЛУГАТА. ЦЕНА НА ЗАЯВКА И ОБЩА ЦЕНА. ОКОНЧАТЕЛНА ЦЕНА.'),
      xBody([['Чл.3. (1) Цената на услугата „доставка на вода за напояване“ за куб. метър е определена, както следва: доставка на вода за напояване по гравитачен път ', false], ['0.0128', true], [' евро без ДДС; за помпено доставяне: ', false], ['0.0194', true], [' евро без ДДС. Цената е оповестена на интернет страницата на дружеството на адрес: https://nps.bg/ - раздел ЦЕНИ НА ВОДАТА.', false]]),
      xBody([['(2). Общата дължима по договора цена е ', false], [`${num(totalWithVat, 2)} €`, true], [` /с думи: ${amountToWordsBG(totalWithVat)}/ евро и е формирана като сбор от цените за всички поливки с ДДС.`, false]]),
      xBody('(3). Размерът на дължимата за всяка поливка цена се определя по реда на чл. 8, ал. 4 от Общите условия към договора за доставка на вода за напояване /Общите условия/ и се записва във всяка подадена Заявка за поливка /Приложение № 4 / към Общите условия.'),
      xBody('(4). Окончателната цена на предоставената по договора услуга се определя въз основа на съставения по реда на чл.8, ал.6 от Общите условия Констативен протокол за действително доставен обем вода през поливен сезон 2026г. – /Приложение № 3/.'),

      xPageBreak(),
      xHeading('IІІ. НАЧИН НА ПЛАЩАНЕ.'),
      xBody([['Чл.4.', true], [' (1) Дължимата от ВОДОПОЛЗВАТЕЛЯ по договора цена се заплаща периодично, след всяка поливка и издаване на фактура.', false]]),
      xBody('(2). Фактурата се издава в петдневен срок от съставяне от ДОСТАВЧИКА на „Акт за доставен обем вода“ за съответната поливка. Във фактурата освен задължителните реквизити по Закона за счетоводството задължително се изписват: номер и срок на договора.'),
      xBody('(3). ВОДОПОЛЗВАТЕЛЯТ заплаща сумата по фактурата по ал. 2 в петдневен срок от издаването й.'),
      xp(
        xw('(4) Плащането на цената по ал. 2 се извършва в касата на ДОСТАВЧИКА при спазване на реда и условията, предвидени в ЗОПБ, или по банков път, по следната банкова сметка на ДОСТАВЧИКА:') +
        '<w:r><w:br/></w:r>' + xw('Банкова сметка: BG85IORT80481090732600') +
        '<w:r><w:br/></w:r>' + xw('BIC: IORTBGSF') +
        '<w:r><w:br/></w:r>' + xw('ИНВЕСТБАНК АД.'),
        { jc: 'both', indent: true, before: 80 }
      ),
      xBody('(5) При установена разлика между цената чл. 3, ал.2 и цената по чл. 3 ал.4, същата се заплаща или възстановява по реда на чл.8, ал.7 от Общите условия, като ДОСТАВЧИКЪТ издава фактура или кредитно известие.'),
      xp(
        xw('(6) Дължимата по фактурата по ал. 5 стойност се заплаща от ВОДОПОЛЗВАТЕЛЯ в 5 дневен срок от издаването й. Стойността на издаденото по ал.5 кредитно известие се възстановява от ДОСТАВЧИКА на ВОДОПОЛЗВАТЕЛЯ в срок от 5 дни от издаването му, по банков път, по следната посочена от ВОДОПОЛЗВАТЕЛЯ банкова сметка: ') +
        xw(cont?.iban || '…………………………………', true) +
        xw(',') +
        '<w:r><w:br/></w:r>' + xw('или в брой на каса на ДОСТАВЧИКА.'),
        { jc: 'both', indent: true, before: 80 }
      ),
      xBody('(7) При забава в плащането по ал.2 и ал.6, предложение първо, ВОДОПОЛЗВАТЕЛЯТ дължи законна лихва.'),
      xBody('(8) До първа поливка ВОДОПОЛЗВАТЕЛЯТ може авансово да заплати пълния размер на прогнозно изчислената за напоителния сезон цена по Договора.'),

      xHeading('IV. СРОК НА ДОГОВОРА'),
      xBody([['Чл.5.', true], [' Настоящият договор се сключва за поливен сезон 2026г. и съобразно разрешителното за водовземане на ДОСТАВЧИКА.', false]]),

      xHeading('V. ПРАВА И ЗАДЪЛЖЕНИЯ НА СТРАНИТЕ', 0),
      xBody([['Чл.6.', true], [' Правата и задълженията на страните са определени в Общите условия, оповестени на страницата на „Напоителни системи“ ЕАД: https://nps.bg/.', false]]),

      xHeading('VI. ЛИЧНИ ДАННИ'),
      xBody([['Чл.7.', true], [' Личните данни на ВОДПОЛЗВАТЕЛИТЕ се обработват съобразно действащото национално и европейско законодателство. Подробна информация за вида данни, начина на обработването им, срока за съхранението им, правата на потребителите и друга информация се съдържа във "Вътрешните правила за защита на личните данни" на дружеството и в Общите условия, оповестени на интернет страницата на дружеството https://nps.bg/.', false]]),

      xHeading('VII. ОТГОВОРНОСТ ЗА НЕИЗПЪЛНЕНИЕ'),
      xBody([['Чл.8.', true], [' Отговорността на страните за неизпълнение, обезщетенията и неустойките са определени в Общите условия.', false]]),

      xHeading('VIII. ПРЕКРАТЯВАНЕ НА ДОГОВОРА', 0),
      xBody([['Чл. 9.', true], [' (1) Настоящият договор се прекратява:', false]]),
      xBody('1. по взаимно съгласие на страните, изразено в писмена форма;'),
      xBody('2. с изтичане на договорения срок;'),
      xBody('3. по искане на ВОДОПОЛЗВАТЕЛЯ с депозирано в деловодството на ДОСТАВЧИКА едномесечно писмено предизвестие;'),
      xBody('4. едностранно от ДОСТАВЧИКА, без предизвестие, при неизпълнение на задължения на ВОДОПОЛЗВАТЕЛЯ по чл.19, т. 2, т. 4, т. 8, т. 9, предложение трето от Общите условия и чл. 19, т. 18 от Общите условия. В този случай ДОСТАВЧИКЪТ не дължи на ВОДОПОЛЗВАТЕЛЯ обезщетение за вреди причинени му от спиране на водоподаването.'),
      xBody('5. едностранно от ДОСТАВЧИКА с едномесечно писмено предизвестие при неизпълнение на останалите задължения на ВОДОПОЛЗВАТЕЛЯ.'),
      xBody([['Чл.10.', true], [' Всички съобщения и уведомления между страните се изпращат на следните адреси:', false]]),
      xBody('За ДОСТАВЧИКА: гр. Сливен, ул. „Д. Пехливанов” № 2'),
      xBody(`За ВОДОПОЛЗВАТЕЛЯ: ${cont?.address || '__________________________________________'}`),
      xBody([['Чл.11.', true], [' При промяна на адреса за кореспонденция, страната, която го е променила, се задължава да уведоми другата страна. В противен случай, всички изпратени съобщения ще се считат за получени.', false]]),

      xPageBreak(),
      xHeading('IX. ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ'),
      xBody([['Чл.12.', true], ['С подписването на настоящия договор ВОДОПОЛЗВАТЕЛЯТ декларира, че е запознат и приема Общите условия за доставка на вода за напояване и се съгласява с тях.', false]]),
      xBody([['Чл.13.', true], [' За неуредените в този договор въпроси се прилагат Общите условия.', false]]),
      xBody([['Чл.14.', true], [' Настоящият договор се сключва в два еднообразни екземпляра по един за всяка от страните.', false]]),
      xp(xw('Неразделна част от този договор са:', true), { before: 160 }),
      xBody('1.Приложение № 1 - Заявление за имоти и култури за напояване през поливен сезон 2026г. по чл.6, ал.1 и ал.2 от Общите условия;'),
      xBody('2.Приложение № 2 - Опис протокол за контролно замерване на действително засетите площи през поливен сезон 2026г. по чл.9, ал.2 от Общите условия;'),
      xBody('3. Приложение №3 - Констативен протокол за доставен обем вода през поливен сезон 2026г. по чл.8, ал.6 от Общите условия;'),
      xBody('4. Приложение № 4 - Заявка за поливка по чл.9, ал.1 от Общите условия;'),
      xBody('5. Декларация за съгласие за събиране, използване и обработване на лични данни Декларация за съгласие за обработване на лични данни по чл.26, ал. 2 от Общите условия;'),
      xBody('6. Общи условия към договора за доставка на вода за напояване.'),
      xBody('7. Пълномощно за ВОДОПОЛЗВАТЕЛ (когато се подписва договорът с пълномощник);'),

      xp(xw('ДОГОВАРЯЩИ СТРАНИ:', true), { before: 480 }),
      signatureTable,
    ].join('')
  }

  async function buildContractDocxBlob(): Promise<Blob> {
    // A leading "/" resolves against the filesystem root under Electron's file:// protocol (not the
    // app folder), so the fetch would 404 and silently fall back to the plain-HTML .doc — use a
    // relative path instead, which works the same under file:// and the http:// dev server.
    const res = await fetch('./templates/dogovor-dostavka-voda.docx')
    const buf = await res.arrayBuffer()
    const zip = new PizZip(buf)

    // Running page header (repeats on every page): contract number/date, right-aligned.
    const headerRId = 'rId101'
    const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${DOCX_NS}>` +
      // Header-from-top is 0 (matches the real template), so give the line itself breathing room
      // from the page edge instead — otherwise it sits flush against the very top.
      xp(xw(`${form.number || '___'}/${formatShortDate(form.date)}`, false), { jc: 'right', before: 500 }) +
      `</w:hdr>`
    zip.file('word/header2.xml', headerXml)

    const contentTypesPath = '[Content_Types].xml'
    const contentTypes = zip.files[contentTypesPath].asText()
    if (!contentTypes.includes('/word/header2.xml')) {
      zip.file(contentTypesPath, contentTypes.replace(
        '</Types>',
        '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>'
      ))
    }

    const relsPath = 'word/_rels/document.xml.rels'
    const rels = zip.files[relsPath].asText()
    if (!rels.includes(headerRId)) {
      zip.file(relsPath, rels.replace(
        '</Relationships>',
        `<Relationship Id="${headerRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/></Relationships>`
      ))
    }

    // Header from Top: 0", Footer from Bottom: 0.79" (1138 twips) — from the real template's Header & Footer settings.
    const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="${headerRId}"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1417" w:left="1134" w:header="0" w:footer="1138" w:gutter="0"/></w:sectPr>`
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOCX_NS}><w:body>${buildContractOoxmlBody()}${sectPr}</w:body></w:document>`
    zip.file('word/document.xml', documentXml)
    return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as Blob
  }

  async function handleDownloadWord() {
    const filename = `${(form.number || 'Договор').trim()} ${(cont?.name || '').trim()}`.trim() + '.docx'
    try {
      const blob = await buildContractDocxBlob()
      downloadBlob(blob, filename)
    } catch {
      downloadWordHtml(buildContractHtml(), filename.replace(/\.docx$/, '.doc'))
    }
  }

  // Opens the exact same .docx as "Изтегли" in Word, so printing (via Word's own print dialog)
  // never drifts from the downloaded document — rather than a separate HTML rendering to print.
  async function handlePrint() {
    const filename = `${(form.number || 'Договор').trim()} ${(cont?.name || '').trim()}`.trim() + '.docx'
    try {
      const blob = await buildContractDocxBlob()
      await openInDefaultApp(blob, filename)
      return
    } catch {
      // fall through to the HTML print fallback below
    }
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><meta charset="utf-8"><title>Договор</title>
      <style>@page{size:A4;margin:2cm 2cm 2.5cm 2cm}@media print{body{margin:0}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
      </head><body>${buildContractHtml()}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 300)
  }

  function setF(patch: Partial<Contract>) {
    setForm(prev => calcContract({ ...prev, ...patch }))
    setSaved(false)
  }

  function handleHtuChange(htuId: string) {
    const h = htus.find(x => x.id === htuId)
    setF({ htuId, village: h?.village ?? '' })
  }

  function saveToRegistry() {
    const c: Contract = {
      id: Date.now().toString(),
      date: form.date ?? '',
      number: form.number ?? '',
      contractorId: form.contractorId ?? '',
      htuId: form.htuId ?? '',
      village: form.village ?? '',
      irrigationMethodId: form.irrigationMethodId ?? '',
      cropId: form.cropId ?? '',
      area: form.area ?? 0,
      irrigationCount: form.irrigationCount ?? 0,
      totalDka: form.totalDka ?? 0,
      cubicPerDka: form.cubicPerDka ?? 0,
      waterCubic: form.waterCubic ?? 0,
      unitPrice: form.unitPrice ?? 0,
      value: form.value ?? 0,
      irrigationNumber: form.irrigationNumber ?? '',
      month: monthNameFromDate(form.date),
    }
    setContracts([...contracts, c])
    setSaved(true)
  }

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2">
      {/* Form */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 text-sm font-bold">📄</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Критерии за договор</p>
            <p className="text-xs text-gray-400">Попълнете полетата за автоматично генериране</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Дата">
            <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
          </FormRow>
          <FormRow label="№ договор">
            <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="Д-001/2024" />
          </FormRow>
          <div className="col-span-2">
            <FormRow label="Контрагент">
              <Autocomplete
                value={form.contractorId ?? ''}
                onChange={id => setF({ contractorId: id })}
                options={contractors.map(c => ({ id: c.id, label: c.name }))}
                placeholder="Търси по име..."
              />
            </FormRow>
          </div>
          <FormRow label="ХТУ, Съоражение">
            <Select value={form.htuId} onChange={e => handleHtuChange(e.target.value)}>
              {htus.map(h => <option key={h.id} value={h.id}>{h.htuName}, {h.equipment}, {h.village}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Начин на поливане">
            <Select value={form.irrigationMethodId} onChange={e => setF({ irrigationMethodId: e.target.value })}>
              {irrigationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Култура">
            <Select value={form.cropId} onChange={e => setF({ cropId: e.target.value })}>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Площ (дка)">
            <Input type="number" value={form.area || ''} onChange={e => setF({ area: parseFloat(e.target.value) || 0 })} />
          </FormRow>
          <FormRow label="Бр. поливки">
            <NumberInput value={form.irrigationCount ?? 0} onChange={n => setF({ irrigationCount: n })} />
          </FormRow>
          <FormRow label="Напоителна норма м³/дка">
            <Input type="number" value={form.cubicPerDka || ''} onChange={e => setF({ cubicPerDka: parseFloat(e.target.value) || 0 })} />
          </FormRow>
          <FormRow label="Ед. цена">
            <NumberInput value={form.unitPrice ?? 0} onChange={n => setF({ unitPrice: n })} />
          </FormRow>
        </div>

        <FormRow label="Чл.2 — Начин на отчитане">
          <Select value={meteringMethod} onChange={e => setMeteringMethod(e.target.value as typeof meteringMethod)}>
            <option value="device">По показание на водомерно устройство</option>
            <option value="norm">По напоителна норма</option>
            <option value="technical">По технически параметри на поливна техника</option>
          </Select>
        </FormRow>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600">Допълнителни редове към таблицата по Чл.1</p>
            <Btn size="sm" variant="secondary" onClick={addExtraRow}>+ Ред</Btn>
          </div>
          {extraRows.map((row, i) => (
            <div key={row.id} className="border border-gray-100 rounded-lg p-2.5 grid grid-cols-2 gap-2">
              <div className="col-span-2 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">Ред {i + 2}</p>
                <Btn size="sm" variant="ghost" onClick={() => removeExtraRow(row.id)}>✕</Btn>
              </div>
              <FormRow label="ХТУ, Съоражение">
                <Select value={row.htuId} onChange={e => { const h = htus.find(x => x.id === e.target.value); updateExtraRow(row.id, { htuId: e.target.value, village: h?.village ?? row.village }) }}>
                  {htus.map(h => <option key={h.id} value={h.id}>{h.htuName}, {h.equipment}, {h.village}</option>)}
                </Select>
              </FormRow>
              <FormRow label="Начин на поливане">
                <Select value={row.irrigationMethodId} onChange={e => updateExtraRow(row.id, { irrigationMethodId: e.target.value })}>
                  {irrigationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </FormRow>
              <FormRow label="Култура">
                <Select value={row.cropId} onChange={e => updateExtraRow(row.id, { cropId: e.target.value })}>
                  {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormRow>
              <FormRow label="Площ (дка)">
                <Input type="number" value={row.area || ''} onChange={e => updateExtraRow(row.id, { area: parseFloat(e.target.value) || 0 })} />
              </FormRow>
              <FormRow label="Напоителна норма м³/дка">
                <Input type="number" value={row.cubicPerDka || ''} onChange={e => updateExtraRow(row.id, { cubicPerDka: parseFloat(e.target.value) || 0 })} />
              </FormRow>
              <FormRow label="Бр. поливки">
                <NumberInput value={row.irrigationCount} onChange={n => updateExtraRow(row.id, { irrigationCount: n })} />
              </FormRow>
              <FormRow label="Ед. цена">
                <NumberInput value={row.unitPrice} onChange={n => updateExtraRow(row.id, { unitPrice: n })} />
              </FormRow>
            </div>
          ))}
        </div>

        <Btn onClick={saveToRegistry} disabled={!form.number || !form.contractorId} variant={saved ? 'success' : 'primary'} className="w-full">
          {saved ? '✓ Запазен в регистъра' : '💾 Запази в Регистър Договори'}
        </Btn>

        <div className="flex gap-2">
          <Btn onClick={handleDownloadWord} variant="secondary" className="flex-1"><DownloadIcon /> Изтегли</Btn>
          <Btn onClick={handlePrint} variant="secondary" className="flex-1"><PrinterIcon /> Принтирай</Btn>
        </div>
      </div>

      {/* Preview — rendered as 3 separate A4-styled pages, matching the real document's page breaks */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-4">
        {(() => {
          const { tableRows, totalNoVat, totalWithVat } = computeTableRows()
          const pageStyle: React.CSSProperties = {
            fontFamily: '"Times New Roman", Times, serif',
            paddingTop: '2cm', paddingRight: '2cm', paddingLeft: '2cm', paddingBottom: '2.5cm',
          }
          const pageClass = 'bg-white rounded-lg shadow-sm border border-gray-100'
          const contClass = 'text-[9px] text-gray-700 leading-relaxed space-y-4'
          const miniHeader = (
            <p className="text-right text-[9px] text-gray-400 mb-4">
              {form.number || '___'}/{formatShortDate(form.date)}
            </p>
          )

          return (
            <>
              {/* PAGE 1 */}
              <div className={pageClass} style={pageStyle}>
                <div className="relative text-center mb-10">
                  <p className="absolute top-0 right-0 text-[9px] text-gray-900">
                    {form.number || '___'}/{formatShortDate(form.date)}
                  </p>
                  <p className="text-[9px] font-bold text-gray-900 tracking-wide">Д О Г О В О Р</p>
                  <p className="text-[9px] font-semibold text-gray-700 tracking-wide">ЗА ДОСТАВКА НА ВОДА ЗА НАПОЯВАНЕ</p>
                </div>
                <div className={contClass}>
                <p className="text-justify indent-6 mt-8">
                  Днес, {formatDayMonth(form.date)} 2026. в гр. Ямбол, между:
                </p>

                <p className="text-justify indent-6">
                  <strong>1. </strong>„<strong className="uppercase">Напоителни системи</strong> “<strong>ЕАД</strong> – клон „Средна Тунджа”, ЕИК: 831160078, със седалище и адрес
                  на управление гр. Сливен, ул. „Д. Пехливанов” № 2, вписано в Търговския регистър при Агенция по
                  вписванията, представлявано от управителя инж. Митошка Ишмериева и гл. счетоводител Стоянка Карагьозова,
                  наричано по-долу <strong>ДОСТАВЧИК</strong>
                </p>
                <p className="pl-10">и</p>
                {(!cont || cont.entityType === 'legal') ? (
                  <p className="text-justify indent-6">
                    <strong>2. </strong>„<strong>{cont?.name || '……………………………………………………………………………………………….'}</strong>”, ЕИК{' '}
                    {cont?.bulstat || '………………….……'}, със седалище и адрес на управление:{' '}
                    {cont?.address || '………………………………………………………………………………………………………'}, ИН по ДДС {vatDisplay(cont)}, представлявано от{' '}
                    {cont?.contact || '………………….……………………….'} – управител
                    {cont?.hasProxy && `, чрез пълномощник ${cont.proxyName || '…'}, ЕГН ${cont.proxyEgn || '…'}, съгласно нот. зав. пълномощно № ${cont.notaryDeedNumber || '…'}, издадено от нотариус ${cont.notaryName || '…'} с район на действие: ${cont.notaryJurisdiction || '…'}`}
                    , тел. {cont?.phone || '……………………….'}, наричано по-долу <strong>ВОДОПОЛЗВАТЕЛ</strong>,
                  </p>
                ) : cont.entityType === 'farmer' ? (
                  <p className="text-justify indent-6">
                    Земеделски производител: {cont.name || '…'}, ЕИК {cont.bulstat || '…'}, ЕГН {cont.egn || '…'}, л.к. № {cont.idCardNumber || '…'}, изд. на {cont.idCardIssuedDate || '…'} и с адрес по л.к.: {cont.address || '…'}
                    {cont.hasProxy && `, чрез пълномощник ${cont.proxyName || '…'}, ЕГН ${cont.proxyEgn || '…'}, съгласно нот. зав. пълномощно № ${cont.notaryDeedNumber || '…'}, издадено от нотариус ${cont.notaryName || '…'} с район на действие: ${cont.notaryJurisdiction || '…'}`}
                    , тел. {cont.phone || '……………………….'}, наричано <strong>ВОДОПОЛЗВАТЕЛ</strong>,
                  </p>
                ) : (
                  <p className="text-justify indent-6">
                    Физическо лице: {cont.name || '…'}, ЕГН {cont.egn || '…'}, л.к. № {cont.idCardNumber || '…'}, изд. на {cont.idCardIssuedDate || '…'} и с адрес по л.к.: {cont.address || '…'}
                    {cont.hasProxy && `, чрез пълномощник ${cont.proxyName || '…'}, ЕГН ${cont.proxyEgn || '…'}, съгласно нот. зав. пълномощно № ${cont.notaryDeedNumber || '…'}, издадено от нотариус ${cont.notaryName || '…'} с район на действие: ${cont.notaryJurisdiction || '…'}`}
                    , тел. {cont.phone || '……………………….'}, наричано <strong>ВОДОПОЛЗВАТЕЛ</strong>,
                  </p>
                )}
                <p className="text-justify indent-6 mt-8">се сключи настоящия договор.</p>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">I. ПРЕДМЕТ НА ДОГОВОРА</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.1.</strong> ДОСТАВЧИКЪТ се задължава да доставя срещу възнаграждение вода за напояване за имоти и по култури,
                    заявени от ВОДОПОЛЗВАТЕЛЯ, както следва:
                  </p>
                </div>

                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-[9px] border-collapse">
                    <thead className="font-normal">
                      <tr style={{ background: '#F2F2F2' }}>
                        <th rowSpan={3} className="border border-gray-200 px-1 py-1">№</th>
                        <th rowSpan={3} className="border border-gray-200 px-1 py-1">напоителен канал, ПС</th>
                        <th rowSpan={3} className="border border-gray-200 px-1 py-1">землище</th>
                        <th rowSpan={3} className="border border-gray-200 px-1 py-1">култура</th>
                        <th rowSpan={2} className="border border-gray-200 px-1 py-1">Засети площи</th>
                        <th rowSpan={3} className="border border-gray-200 px-1 py-1">Напоителна норма м³/дка</th>
                        <th colSpan={4} className="border border-gray-200 px-1 py-1">Начин на доставка (водни маси)</th>
                        <th rowSpan={2} className="border border-gray-200 px-1 py-1">Цена по Заповед</th>
                        <th rowSpan={2} className="border border-gray-200 px-1 py-1">Дължима цена за поливката, без ДДС</th>
                        <th rowSpan={2} className="border border-gray-200 px-1 py-1">Дължима цена за всички поливки, без ДДС</th>
                      </tr>
                      <tr style={{ background: '#F2F2F2' }}>
                        <th className="border border-gray-200 px-1 py-1">Общо</th>
                        <th className="border border-gray-200 px-1 py-1">Гравитачно</th>
                        <th className="border border-gray-200 px-1 py-1">Помпено</th>
                        <th className="border border-gray-200 px-1 py-1">поливки</th>
                      </tr>
                      <tr style={{ background: '#F2F2F2' }}>
                        <th className="border border-gray-200 px-1 py-1">дка</th>
                        <th className="border border-gray-200 px-1 py-1">м³</th>
                        <th className="border border-gray-200 px-1 py-1">м³</th>
                        <th className="border border-gray-200 px-1 py-1">м³</th>
                        <th className="border border-gray-200 px-1 py-1">брой</th>
                        <th className="border border-gray-200 px-1 py-1">€</th>
                        <th className="border border-gray-200 px-1 py-1">€</th>
                        <th className="border border-gray-200 px-1 py-1">€</th>
                      </tr>
                    </thead>
                    <tbody>
                      {padRows(tableRows, 3).map((r, i) => (
                        <tr key={i}>
                          <td className="border border-gray-200 px-1 py-1 text-center">{i + 1}</td>
                          {r === null ? (
                            <>
                              <td className="border border-gray-200 px-1 py-1"></td>
                              <td className="border border-gray-200 px-1 py-1"></td>
                              <td className="border border-gray-200 px-1 py-1"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-center"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                              <td className="border border-gray-200 px-1 py-1 text-right"></td>
                            </>
                          ) : (
                            <>
                              <td className="border border-gray-200 px-1 py-1">{r.equipment}</td>
                              <td className="border border-gray-200 px-1 py-1">{r.village}</td>
                              <td className="border border-gray-200 px-1 py-1">{r.cropName}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">{numArea(r.area)}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">{num(r.cubicPerDka, 0)}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">{num(r.waterCubic, 0)}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">
                                {r.isGravity && (
                                  <>
                                    <div>{num(r.waterCubic, 0)}</div>
                                    {r.methodSubType && <div className="text-[9px] text-gray-500">{r.methodSubType}</div>}
                                  </>
                                )}
                              </td>
                              <td className="border border-gray-200 px-1 py-1 text-right">
                                {r.isPumped && (
                                  <>
                                    <div>{num(r.waterCubic, 0)}</div>
                                    {r.methodSubType && <div className="text-[9px] text-gray-500">{r.methodSubType}</div>}
                                  </>
                                )}
                              </td>
                              <td className="border border-gray-200 px-1 py-1 text-center">{r.irrigationCount || ''}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">{num(r.unitPrice, 4)}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right">{num(r.perWatering, 2)}</td>
                              <td className="border border-gray-200 px-1 py-1 text-right font-semibold">{num(r.rowTotal, 2)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={12} className="border border-gray-200 px-1.5 py-3 text-right text-[11px] font-semibold">Общо прогнозна цена по договор без ДДС</td>
                        <td className="border border-gray-200 px-1.5 py-3 text-right text-[11px] font-semibold">{num(totalNoVat, 2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={12} className="border border-gray-200 px-1.5 py-3 text-right text-[11px] font-semibold">Общо прогнозна цена по договор с ДДС</td>
                        <td className="border border-gray-200 px-1.5 py-3 text-right text-[11px] font-semibold">{num(totalWithVat, 2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="text-[9px] text-gray-400 mt-4">*Добавят се необходимия брой редове</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">II. ОТЧИТАНЕ</p>
                  <p className="mt-3 text-justify indent-6">
                    <strong>Чл.2.</strong> Доставената вода се отчита след всяка поливка по един от следните начини:
                  </p>
                  <table className="text-[9px] border-collapse mt-3" style={{ width: '6.57in', maxWidth: '100%', tableLayout: 'fixed' }}>
                    <tbody>
                      <tr>
                        <td className="border border-gray-200 px-2 py-3">по показание на монтираното водомерно устройство</td>
                        <td className="border border-gray-200 px-2 py-3 w-8 text-center font-semibold">{meteringMethod === 'device' ? 'Х' : ''}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-2 py-3">по напоителна норма, съгласно Наредба за нормите за водопотребление</td>
                        <td className="border border-gray-200 px-2 py-3 w-8 text-center font-semibold">{meteringMethod === 'norm' ? 'Х' : ''}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-2 py-3">по технически параметри на поливна техника (описва се вида техника и се прилагат съответните документи, както и конкретните параметри) и времетраене на поливката</td>
                        <td className="border border-gray-200 px-2 py-3 w-8 text-center font-semibold">{meteringMethod === 'technical' ? 'Х' : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">IІІ. ЦЕНА НА УСЛУГАТА. ЦЕНА НА ЗАЯВКА И ОБЩА ЦЕНА. ОКОНЧАТЕЛНА ЦЕНА.</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.3.</strong> (1) Цената на услугата „доставка на вода за напояване“ за куб. метър е определена, както следва:
                    доставка на вода за напояване по гравитачен път <strong>0.0128</strong> евро без ДДС; за помпено
                    доставяне: <strong>0.0194</strong> евро без ДДС. Цената е оповестена на интернет страницата на
                    дружеството на адрес: https://nps.bg/ - раздел ЦЕНИ НА ВОДАТА.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (2). Общата дължима по договора цена е <strong>{num(totalWithVat, 2)} €</strong> /с думи: {amountToWordsBG(totalWithVat)}/ евро и е формирана като
                    сбор от цените за всички поливки с ДДС.
                  </p>
                </div>
              </div>
              </div>

              {/* PAGE 2 */}
              <div className={pageClass} style={pageStyle}>
                {miniHeader}
                <div className={contClass}>
                <div>
                  <p className="mt-1 text-justify indent-6">
                    (3). Размерът на дължимата за всяка поливка цена се определя по реда на чл. 8, ал. 4 от Общите условия
                    към договора за доставка на вода за напояване /Общите условия/ и се записва във всяка подадена Заявка
                    за поливка /Приложение № 4 / към Общите условия.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (4). Окончателната цена на предоставената по договора услуга се определя въз основа на съставения по
                    реда на чл.8, ал.6 от Общите условия Констативен протокол за действително доставен обем вода през
                    поливен сезон 2026г. – /Приложение № 3/.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">IІІ. НАЧИН НА ПЛАЩАНЕ.</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.4.</strong> (1) Дължимата от ВОДОПОЛЗВАТЕЛЯ по договора цена се заплаща периодично, след всяка поливка и
                    издаване на фактура.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (2). Фактурата се издава в петдневен срок от съставяне от ДОСТАВЧИКА на „Акт за доставен обем вода“ за
                    съответната поливка. Във фактурата освен задължителните реквизити по Закона за счетоводството
                    задължително се изписват: номер и срок на договора.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (3). ВОДОПОЛЗВАТЕЛЯТ заплаща сумата по фактурата по ал. 2 в петдневен срок от издаването й.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (4) Плащането на цената по ал. 2 се извършва в касата на ДОСТАВЧИКА при спазване на реда и условията,
                    предвидени в ЗОПБ, или по банков път, по следната банкова сметка на ДОСТАВЧИКА:
                    <br />Банкова сметка: <span className="break-all">BG85IORT80481090732600</span>
                    <br />BIC: IORTBGSF
                    <br />ИНВЕСТБАНК АД.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (5) При установена разлика между цената чл. 3, ал.2 и цената по чл. 3 ал.4, същата се заплаща или
                    възстановява по реда на чл.8, ал.7 от Общите условия, като ДОСТАВЧИКЪТ издава фактура или кредитно
                    известие.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (6) Дължимата по фактурата по ал. 5 стойност се заплаща от ВОДОПОЛЗВАТЕЛЯ в 5 дневен срок от
                    издаването й. Стойността на издаденото по ал.5 кредитно известие се възстановява от ДОСТАВЧИКА на
                    ВОДОПОЛЗВАТЕЛЯ в срок от 5 дни от издаването му, по банков път, по следната посочена от
                    ВОДОПОЛЗВАТЕЛЯ банкова сметка: <strong className="break-all">{cont?.iban || '…………………………………'}</strong>,
                    <br />или в брой на каса на ДОСТАВЧИКА.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (7) При забава в плащането по ал.2 и ал.6, предложение първо, ВОДОПОЛЗВАТЕЛЯТ дължи законна лихва.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    (8) До първа поливка ВОДОПОЛЗВАТЕЛЯТ може авансово да заплати пълния размер на прогнозно изчислената
                    за напоителния сезон цена по Договора.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">IV. СРОК НА ДОГОВОРА</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.5.</strong> Настоящият договор се сключва за поливен сезон 2026г. и съобразно разрешителното за
                    водовземане на ДОСТАВЧИКА.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">V. ПРАВА И ЗАДЪЛЖЕНИЯ НА СТРАНИТЕ</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.6.</strong> Правата и задълженията на страните са определени в Общите условия, оповестени на страницата на
                    „Напоителни системи“ ЕАД: https://nps.bg/.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">VI. ЛИЧНИ ДАННИ</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.7.</strong> Личните данни на ВОДПОЛЗВАТЕЛИТЕ се обработват съобразно действащото национално и европейско
                    законодателство. Подробна информация за вида данни, начина на обработването им, срока за
                    съхранението им, правата на потребителите и друга информация се съдържа във "Вътрешните правила за
                    защита на личните данни" на дружеството и в Общите условия, оповестени на интернет страницата на
                    дружеството https://nps.bg/.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">VII. ОТГОВОРНОСТ ЗА НЕИЗПЪЛНЕНИЕ</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.8.</strong> Отговорността на страните за неизпълнение, обезщетенията и неустойките са определени в Общите
                    условия.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">VIII. ПРЕКРАТЯВАНЕ НА ДОГОВОРА</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл. 9.</strong> (1) Настоящият договор се прекратява:
                  </p>
                  <p className="mt-1 text-justify indent-6">1. по взаимно съгласие на страните, изразено в писмена форма;</p>
                  <p className="mt-1 text-justify indent-6">2. с изтичане на договорения срок;</p>
                  <p className="mt-1 text-justify indent-6">3. по искане на ВОДОПОЛЗВАТЕЛЯ с депозирано в деловодството на ДОСТАВЧИКА едномесечно писмено предизвестие;</p>
                  <p className="mt-1 text-justify indent-6">
                    4. едностранно от ДОСТАВЧИКА, без предизвестие, при неизпълнение на задължения на ВОДОПОЛЗВАТЕЛЯ по
                    чл.19, т. 2, т. 4, т. 8, т. 9, предложение трето от Общите условия и чл. 19, т. 18 от Общите условия. В
                    този случай ДОСТАВЧИКЪТ не дължи на ВОДОПОЛЗВАТЕЛЯ обезщетение за вреди причинени му от спиране на
                    водоподаването.
                  </p>
                  <p className="mt-1 text-justify indent-6">5. едностранно от ДОСТАВЧИКА с едномесечно писмено предизвестие при неизпълнение на останалите задължения на ВОДОПОЛЗВАТЕЛЯ.</p>
                  <p className="mt-2 text-justify indent-6">
                    <strong>Чл.10.</strong> Всички съобщения и уведомления между страните се изпращат на следните адреси:
                  </p>
                  <p className="mt-1 text-justify indent-6">За ДОСТАВЧИКА: гр. Сливен, ул. „Д. Пехливанов” № 2</p>
                  <p className="mt-1 text-justify indent-6">За ВОДОПОЛЗВАТЕЛЯ: {cont?.address || '__________________________________________'}</p>
                </div>
                </div>
              </div>

              {/* PAGE 3 */}
              <div className={pageClass} style={pageStyle}>
                {miniHeader}
                <div className={contClass}>
                <div>
                  <p className="mt-2 text-justify indent-6">
                    <strong>Чл.11.</strong> При промяна на адреса за кореспонденция, страната, която го е променила, се задължава да
                    уведоми другата страна. В противен случай, всички изпратени съобщения ще се считат за получени.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-900 text-center mt-2">IX. ДОПЪЛНИТЕЛНИ РАЗПОРЕДБИ</p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.12.</strong>С подписването на настоящия договор ВОДОПОЛЗВАТЕЛЯТ декларира, че е запознат и приема Общите
                    условия за доставка на вода за напояване и се съгласява с тях.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.13.</strong> За неуредените в този договор въпроси се прилагат Общите условия.
                  </p>
                  <p className="mt-1 text-justify indent-6">
                    <strong>Чл.14.</strong> Настоящият договор се сключва в два еднообразни екземпляра по един за всяка от страните.
                  </p>
                  <p className="mt-2 font-bold">Неразделна част от този договор са:</p>
                  <p className="mt-1 text-justify indent-6">1.Приложение № 1 - Заявление за имоти и култури за напояване през поливен сезон 2026г. по чл.6, ал.1 и ал.2 от Общите условия;</p>
                  <p className="mt-1 text-justify indent-6">2.Приложение № 2 - Опис протокол за контролно замерване на действително засетите площи през поливен сезон 2026г. по чл.9, ал.2 от Общите условия;</p>
                  <p className="mt-1 text-justify indent-6">3. Приложение №3 - Констативен протокол за доставен обем вода през поливен сезон 2026г. по чл.8, ал.6 от Общите условия;</p>
                  <p className="mt-1 text-justify indent-6">4. Приложение № 4 - Заявка за поливка по чл.9, ал.1 от Общите условия;</p>
                  <p className="mt-1 text-justify indent-6">5. Декларация за съгласие за събиране, използване и обработване на лични данни Декларация за съгласие за обработване на лични данни по чл.26, ал. 2 от Общите условия;</p>
                  <p className="mt-1 text-justify indent-6">6. Общи условия към договора за доставка на вода за напояване.</p>
                  <p className="mt-1 text-justify indent-6">7. Пълномощно за ВОДОПОЛЗВАТЕЛ (когато се подписва договорът с пълномощник);</p>
                </div>

                <div className="mt-10">
                  <p className="font-semibold text-gray-900 mb-3">ДОГОВАРЯЩИ СТРАНИ:</p>
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p><strong>ДОСТАВЧИК</strong>: ...................................</p>
                      <p className="mt-4 text-[8px]">Управител на клон „Средна Тунджа”</p>
                      <p className="text-[8px]">инж. Митошка Ишмериева</p>
                      <p className="mt-4 text-[8px]">Главен счетоводител клон ...................................</p>
                      <p className="text-[8px]">Стоянка Бянова Карагьозова</p>
                      <p className="mt-4 text-[8px]">Р-л ХТР: ...................................</p>
                      <p className="text-[8px]">инж. Николай Петров Касидов</p>
                      <p className="mt-4 text-[8px]">Изготвил: ...................................</p>
                      <p className="text-[8px]">инж. УДВН Станислава Петрова Димитрова</p>
                    </div>
                    <div>
                      <p><strong>ВОДОПОЛЗВАТЕЛ</strong>: ...................................</p>
                      <p className="mt-4 text-[8px]">/ {signatureName(cont)} /</p>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ─── ACT GENERATOR ────────────────────────────────────────────────────────────
const ACT_TAGS: TagInfo[] = [
  { tag: 'vid_dokument', label: 'Вид документ' },
  { tag: 'data', label: 'Дата' },
  { tag: 'nomer', label: 'Номер' },
  { tag: 'nomer_polivka', label: '№ поливка' },
  { tag: 'kontragent', label: 'Контрагент' },
  { tag: 'bulstat', label: 'БУЛСТАТ' },
  { tag: 'adres', label: 'Адрес' },
  { tag: 'htu', label: 'ХТУ' },
  { tag: 'saorajenie', label: 'Съоражение' },
  { tag: 'zemlishte', label: 'Землище' },
  { tag: 'nachin_polivane', label: 'Начин на поливане' },
  { tag: 'kultura', label: 'Култура' },
  { tag: 'ploshte', label: 'Площ (дка)' },
  { tag: 'kub_m_dka', label: 'куб.м./дка' },
  { tag: 'voda_kub_m', label: 'Вода куб.м.' },
  { tag: 'ed_cena', label: 'Ед. цена' },
  { tag: 'stoinost', label: 'Стойност' },
  { tag: 'mesec', label: 'Месец' },
]

function ActGenerator() {
  const { contractors, htus, irrigationMethods, crops, acts, setActs } = useStore()
  const [form, setFormState] = useState<Partial<Act>>({
    docType: 'Акт',
    date: new Date().toISOString().slice(0, 10),
    number: '',
    contractorId: contractors[0]?.id ?? '',
    htuId: htus[0]?.id ?? '',
    village: htus[0]?.village ?? '',
    irrigationMethodId: irrigationMethods[0]?.id ?? '',
    cropId: crops[0]?.id ?? '',
    irrigationNumber: '',
    area: 0, cubicPerDka: 0, waterCubic: 0, unitPrice: 0.0128, value: 0, month: '',
  })
  const [saved, setSaved] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  const cont = contractors.find(c => c.id === form.contractorId)
  const htu = htus.find(h => h.id === form.htuId)
  const method = irrigationMethods.find(m => m.id === form.irrigationMethodId)
  const crop = crops.find(c => c.id === form.cropId)

  function setF(patch: Partial<Act>) {
    setFormState(prev => calcAct({ ...prev, ...patch }))
    setSaved(false)
  }

  function buildTagData(): DocxTagData {
    return {
      vid_dokument: form.docType ?? '',
      data: form.date ?? '',
      nomer: form.number ?? '',
      nomer_polivka: form.irrigationNumber ?? '',
      kontragent: cont?.name ?? '',
      bulstat: cont?.bulstat ?? '',
      adres: cont?.address ?? '',
      htu: htu?.htuName ?? '',
      saorajenie: htu?.equipment ?? '',
      zemlishte: form.village ?? '',
      nachin_polivane: method?.name ?? '',
      kultura: crop?.name ?? '',
      ploshte: numArea(form.area ?? 0),
      kub_m_dka: num(form.cubicPerDka ?? 0, 0),
      voda_kub_m: num(form.waterCubic ?? 0, 0),
      ed_cena: num(form.unitPrice ?? 0, 4),
      stoinost: num(form.value ?? 0, 2),
      mesec: form.month ?? '',
    }
  }

  async function handleFillTemplate() {
    if (!templateFile) return
    setFilling(true)
    setFillError('')
    try {
      const blob = await fillDocxTemplate(templateFile, buildTagData())
      downloadBlob(blob, `${form.docType || 'Акт'}_${form.number || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  function saveToRegistry() {
    const a: Act = {
      id: Date.now().toString(),
      docType: form.docType ?? 'Акт',
      date: form.date ?? '',
      number: form.number ?? '',
      contractorId: form.contractorId ?? '',
      htuId: form.htuId ?? '',
      village: form.village ?? '',
      irrigationMethodId: form.irrigationMethodId ?? '',
      cropId: form.cropId ?? '',
      irrigationNumber: form.irrigationNumber ?? '',
      area: form.area ?? 0,
      cubicPerDka: form.cubicPerDka ?? 0,
      waterCubic: form.waterCubic ?? 0,
      unitPrice: form.unitPrice ?? 0,
      value: form.value ?? 0,
      month: form.month ?? '',
    }
    setActs([...acts, a])
    setSaved(true)
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">📋</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Критерии за акт</p>
            <p className="text-xs text-gray-400">Стойността се изчислява автоматично</p>
          </div>
        </div>

        <TemplateUpload
          accent={{ border: 'hover:border-blue-300', text: 'text-blue-700' }}
          templateFile={templateFile}
          onFileChange={f => { setTemplateFile(f); setFillError('') }}
          onFill={handleFillTemplate}
          filling={filling}
          fillError={fillError}
          tags={ACT_TAGS}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Вид документ">
            <Select value={form.docType} onChange={e => setF({ docType: e.target.value })}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Дата">
            <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
          </FormRow>
          <FormRow label="Номер">
            <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="А-001/2024" />
          </FormRow>
          <FormRow label="№ поливка">
            <Input value={form.irrigationNumber} onChange={e => setF({ irrigationNumber: e.target.value })} />
          </FormRow>
          <div className="col-span-2">
            <FormRow label="Контрагент">
              <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormRow>
          </div>
          <FormRow label="ХТУ">
            <Select value={form.htuId} onChange={e => { const h = htus.find(x => x.id === e.target.value); setF({ htuId: e.target.value, village: h?.village ?? '' }) }}>
              {htus.map(h => <option key={h.id} value={h.id}>{h.htuName} — {h.equipment}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Землище">
            <Input value={form.village} onChange={e => setF({ village: e.target.value })} />
          </FormRow>
          <FormRow label="Начин на поливане">
            <Select value={form.irrigationMethodId} onChange={e => setF({ irrigationMethodId: e.target.value })}>
              {irrigationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Култура">
            <Select value={form.cropId} onChange={e => setF({ cropId: e.target.value })}>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Площ (дка)">
            <Input type="number" value={form.area || ''} onChange={e => setF({ area: parseFloat(e.target.value) || 0 })} />
          </FormRow>
          <FormRow label="куб.м./дка">
            <Input type="number" value={form.cubicPerDka || ''} onChange={e => setF({ cubicPerDka: parseFloat(e.target.value) || 0 })} />
          </FormRow>
          <FormRow label="Вода куб.м.">
            <Input type="number" value={form.waterCubic || ''} onChange={e => setF({ waterCubic: parseFloat(e.target.value) || 0 })} />
          </FormRow>
          <FormRow label="Ед. цена">
            <NumberInput value={form.unitPrice ?? 0} onChange={n => setF({ unitPrice: n })} />
          </FormRow>
          <div className="col-span-2">
            <div className="bg-blue-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-blue-700">Стойност (авт.)</span>
              <span className="text-lg font-bold text-blue-800 font-mono">{num(form.value ?? 0, 2)} лв.</span>
            </div>
          </div>
          <FormRow label="Месец">
            <Select value={form.month} onChange={e => setF({ month: e.target.value })}>
              <option value="">— Избери —</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
          </FormRow>
        </div>

        <Btn onClick={saveToRegistry} disabled={!form.number || !form.contractorId} variant={saved ? 'success' : 'primary'} className="w-full">
          {saved ? '✓ Запазен в регистъра' : '💾 Запази в Регистър Актове'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto">
        <div className="bg-white m-4 rounded-lg shadow-sm border border-gray-100 p-6 font-serif">
          <div className="text-center mb-5">
            <p className="text-xs text-gray-400 mb-1">{(form.docType ?? 'АКТ').toUpperCase()} ЗА НАПОЯВАНЕ</p>
            <h2 className="text-lg font-bold text-gray-900">№ {form.number || '___________'}</h2>
            <p className="text-xs text-gray-500 mt-1">Дата: {form.date || '___'} | Месец: {form.month || '—'}</p>
          </div>

          <div className="text-sm text-gray-700 space-y-3">
            <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-xs">
              <div className="grid grid-cols-2 gap-x-4">
                <p><span className="text-gray-500">Контрагент:</span> <strong>{cont?.name || '—'}</strong></p>
                <p><span className="text-gray-500">БУЛСТАТ:</span> <strong>{cont?.bulstat || '—'}</strong></p>
                <p><span className="text-gray-500">ХТУ:</span> <strong>{htu?.htuName || '—'}</strong></p>
                <p><span className="text-gray-500">Съоражение:</span> <strong>{htu?.equipment || '—'}</strong></p>
                <p><span className="text-gray-500">Землище:</span> <strong>{form.village || '—'}</strong></p>
                <p><span className="text-gray-500">Начин:</span> <strong>{method?.name || '—'}</strong></p>
                <p><span className="text-gray-500">Култура:</span> <strong>{crop?.name || '—'}</strong></p>
                <p><span className="text-gray-500">№ поливка:</span> <strong>{form.irrigationNumber || '—'}</strong></p>
              </div>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-2 py-1 text-left">Площ (дка)</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">куб.м./дка</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">Вода куб.м.</th>
                  <th className="border border-gray-200 px-2 py-1 text-right">Ед. цена</th>
                  <th className="border border-gray-200 px-2 py-1 text-right font-bold">Стойност</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-2">{num(form.area ?? 0, 2)}</td>
                  <td className="border border-gray-200 px-2 py-2 text-right">{num(form.cubicPerDka ?? 0, 0)}</td>
                  <td className="border border-gray-200 px-2 py-2 text-right">{num(form.waterCubic ?? 0, 0)}</td>
                  <td className="border border-gray-200 px-2 py-2 text-right">{num(form.unitPrice ?? 0, 4)}</td>
                  <td className="border border-gray-200 px-2 py-2 text-right font-bold text-teal-700">{num(form.value ?? 0, 2)} лв.</td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 mt-6 pt-4 border-t border-gray-200">
              <div className="text-center text-xs text-gray-500">
                <p className="mb-5">Изготвил:</p>
                <p className="border-t border-gray-400 pt-1">_________________</p>
              </div>
              <div className="text-center text-xs text-gray-500">
                <p className="mb-5">Контрагент:</p>
                <p className="border-t border-gray-400 pt-1">{cont?.name || '___________'}</p>
              </div>
            </div>
          </div>
        </div>
        {templateFile && (
          <p className="text-xs text-center text-blue-600 pb-3">📎 Бланка прикачена — използвайте бутона вляво за попълване и изтегляне</p>
        )}
      </div>
    </div>
  )
}

// ─── REQUEST GENERATOR ────────────────────────────────────────────────────────
const REQUEST_TAGS: TagInfo[] = [
  { tag: 'data', label: 'Дата' },
  { tag: 'kontragent', label: 'Контрагент' },
  { tag: 'bulstat', label: 'БУЛСТАТ' },
  { tag: 'adres', label: 'Адрес' },
  { tag: 'predstavlyava', label: 'Представлявана от' },
  { tag: 'telefon', label: 'Телефон' },
  { tag: 'nomer_polivka', label: '№ поливка' },
  { tag: 'nachalna_data', label: 'Начална дата' },
  { tag: 'kraina_data', label: 'Крайна дата' },
]

function RequestGenerator() {
  const { contractors, requests, setRequests } = useStore()
  const [form, setForm] = useState<Partial<IrrigRequest>>({
    contractorId: contractors[0]?.id ?? '',
    irrigationNumber: '',
    startDate: '',
    endDate: '',
  })
  const [saved, setSaved] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  const cont = contractors.find(c => c.id === form.contractorId)

  function setF(patch: Partial<IrrigRequest>) {
    setForm(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  function buildTagData(): DocxTagData {
    return {
      data: new Date().toISOString().slice(0, 10),
      kontragent: cont?.name ?? '',
      bulstat: cont?.bulstat ?? '',
      adres: cont?.address ?? '',
      predstavlyava: cont?.contact ?? '',
      telefon: cont?.phone ?? '',
      nomer_polivka: form.irrigationNumber ?? '',
      nachalna_data: form.startDate ?? '',
      kraina_data: form.endDate ?? '',
    }
  }

  async function handleFillTemplate() {
    if (!templateFile) return
    setFilling(true)
    setFillError('')
    try {
      const blob = await fillDocxTemplate(templateFile, buildTagData())
      downloadBlob(blob, `Заявка_${form.irrigationNumber || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  function saveToRegistry() {
    const r: IrrigRequest = {
      id: Date.now().toString(),
      contractorId: form.contractorId ?? '',
      irrigationNumber: form.irrigationNumber ?? '',
      startDate: form.startDate ?? '',
      endDate: form.endDate ?? '',
      items: form.items ?? [],
    }
    setRequests([...requests, r])
    setSaved(true)
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">📝</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Критерии за заявка</p>
            <p className="text-xs text-gray-400">Генериране на заявка за напояване</p>
          </div>
        </div>

        <TemplateUpload
          accent={{ border: 'hover:border-amber-300', text: 'text-amber-700' }}
          templateFile={templateFile}
          onFileChange={f => { setTemplateFile(f); setFillError('') }}
          onFill={handleFillTemplate}
          filling={filling}
          fillError={fillError}
          tags={REQUEST_TAGS}
        />

        <div className="flex flex-col gap-3">
          <FormRow label="Контрагент">
            <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
              <option value="">— Избери —</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="№ поливка">
            <Input value={form.irrigationNumber} onChange={e => setF({ irrigationNumber: e.target.value })} placeholder="1" />
          </FormRow>
          <FormRow label="Начална дата на поливка">
            <Input type="date" value={form.startDate} onChange={e => setF({ startDate: e.target.value })} />
          </FormRow>
          <FormRow label="Крайна дата на поливка">
            <Input type="date" value={form.endDate} onChange={e => setF({ endDate: e.target.value })} />
          </FormRow>
        </div>

        <Btn onClick={saveToRegistry} disabled={!form.contractorId} variant={saved ? 'success' : 'primary'} className="w-full mt-2">
          {saved ? '✓ Запазена в регистъра' : '💾 Запази в Регистър Заявки'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto">
        <div className="bg-white m-4 rounded-lg shadow-sm border border-gray-100 p-6 font-serif">
          <div className="text-center mb-6">
            <p className="text-xs text-gray-400 mb-1">ЗАЯВКА ЗА НАПОЯВАНЕ</p>
            <p className="text-xs text-gray-500 mt-1">Дата: {new Date().toLocaleDateString('bg-BG')}</p>
          </div>

          <div className="text-sm text-gray-700 space-y-4">
            <p>
              До <strong>„Напоителни системи" ЕАД</strong>
            </p>
            <p>
              Долуподписаният/ата <strong>{cont?.name || '___________'}</strong>,
              БУЛСТАТ: <strong>{cont?.bulstat || '___'}</strong>,
              адрес: <strong>{cont?.address || '___'}</strong>,
              представляван/а от <strong>{cont?.contact || '___'}</strong>,
            </p>
            <p>
              <strong>ЗАЯВЯВАМ</strong> напояване с поливка №{' '}
              <strong>{form.irrigationNumber || '___'}</strong>,
              в периода от <strong>{form.startDate || '___'}</strong> до{' '}
              <strong>{form.endDate || '___'}</strong>.
            </p>

            <div className="bg-amber-50 rounded-lg p-3 text-xs">
              <p className="text-amber-700 font-medium">Детайли:</p>
              <p>Контрагент: {cont?.name || '—'}</p>
              <p>Телефон: {cont?.phone || '—'}</p>
              <p>№ поливка: {form.irrigationNumber || '—'}</p>
            </div>

            <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200">
              <div className="text-center text-xs text-gray-500">
                <p className="mb-5">Дата: {new Date().toLocaleDateString('bg-BG')}</p>
                <p className="border-t border-gray-400 pt-1">Подпис/Печат</p>
              </div>
              <div className="text-center text-xs text-gray-500">
                <p className="mb-5">Контрагент:</p>
                <p className="border-t border-gray-400 pt-1">{cont?.name || '___________'}</p>
              </div>
            </div>
          </div>
        </div>
        {templateFile && (
          <p className="text-xs text-center text-amber-600 pb-3">📎 Бланка прикачена — използвайте бутона вляво за попълване и изтегляне</p>
        )}
      </div>
    </div>
  )
}

// ─── UDVN SECTION ──────────────────────────────────────────────────────────────

/** Replaces XML placeholders like {NAME} with their actual values. */
function replacePlaceholder(xml: string, placeholder: string, value: string): string {
  return xml.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value)
}

interface UdvnLocation {
  unit: 'hkm' | 'km'
  value: string
}

interface UdvnRepairItem {
  pipeline: string
  locations: UdvnLocation[]
  hectometer?: string
  locationUnit?: 'hkm' | 'km'
  repairType: string
  description: string
  hydrantCount?: number
  pipeType?: string
  pipeSize?: string
  pipeCount?: number
  materials: string
  workersCount: string
  excavatorTime: string
  workers: string
}

interface UdvnFacility {
  name: string
  repairs: UdvnRepairItem[]
}

const EMPTY_REPAIR: UdvnRepairItem = {
  pipeline: '',
  locations: [{ unit: 'hkm', value: '' }],
  repairType: '',
  description: '',
  materials: '',
  workersCount: '',
  excavatorTime: '',
  workers: ''
}

const EMPTY_FACILITY: UdvnFacility = {
  name: '',
  repairs: [{ ...EMPTY_REPAIR }]
}

function migrateLegacyLocation(repair: UdvnRepairItem): UdvnRepairItem {
  if (!repair.locations || repair.locations.length === 0) {
    if (repair.hectometer !== undefined || repair.locationUnit !== undefined) {
      return {
        ...repair,
        locations: [{
          unit: repair.locationUnit || 'hkm',
          value: repair.hectometer || ''
        }]
      }
    }
  }
  return repair
}

function formatLocations(locations: UdvnLocation[]): string {
  return locations.map(loc => {
    const unitText = loc.unit === 'km' ? 'при км' : 'хкм'
    return `${unitText} ${loc.value}`
  }).join(', ')
}

function UdvnUpcomingGenerator({
  month,
  setMonth,
  reportDate,
  setReportDate,
  facilities,
  setFacilities
}: {
  month: string
  setMonth: (m: string) => void
  reportDate: string
  setReportDate: (d: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  function updateFacility(index: number, field: keyof UdvnFacility, value: any) {
    const updated = [...facilities]
    updated[index] = { ...updated[index], [field]: value }
    setFacilities(updated)
  }

  function addFacility() {
    setFacilities([...facilities, { ...EMPTY_FACILITY }])
  }

  function removeFacility(index: number) {
    if (facilities.length > 1) {
      setFacilities(facilities.filter((_, i) => i !== index))
    }
  }

  function addRepair(facilityIndex: number) {
    const updated = [...facilities]
    updated[facilityIndex].repairs.push({ ...EMPTY_REPAIR })
    setFacilities(updated)
  }

  function removeRepair(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    if (updated[facilityIndex].repairs.length > 1) {
      updated[facilityIndex].repairs.splice(repairIndex, 1)
      setFacilities(updated)
    }
  }

  function updateRepair(facilityIndex: number, repairIndex: number, field: keyof UdvnRepairItem, value: any) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex] = {
      ...updated[facilityIndex].repairs[repairIndex],
      [field]: value
    }
    setFacilities(updated)
  }

  function addLocation(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex].locations.push({ unit: 'hkm', value: '' })
    setFacilities(updated)
  }

  function removeLocation(facilityIndex: number, repairIndex: number, locationIndex: number) {
    const updated = [...facilities]
    if (updated[facilityIndex].repairs[repairIndex].locations.length > 1) {
      updated[facilityIndex].repairs[repairIndex].locations.splice(locationIndex, 1)
      setFacilities(updated)
    }
  }

  function updateLocation(facilityIndex: number, repairIndex: number, locationIndex: number, field: 'unit' | 'value', value: string) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex].locations[locationIndex] = {
      ...updated[facilityIndex].repairs[repairIndex].locations[locationIndex],
      [field]: value
    }
    setFacilities(updated)
  }

  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/Доклад предстоящи ремонтни.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{МЕСЕЦ}', month)
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(reportDate))

      let tableRows = ''
      facilities.forEach(facility => {
        facility.repairs.forEach(repair => {
          const location = formatLocations(repair.locations)
          tableRows += `<w:tr><w:tc><w:p><w:r><w:t>${facility.name}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.pipeline}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${location}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.repairType}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.materials}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.workers}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.excavator}</w:t></w:r></w:p></w:tc></w:tr>`
        })
      })

      const tableMarker = '<w:tr><w:tc><w:p><w:r><w:t>{TABLE_ROWS}</w:t></w:r></w:p></w:tc></w:tr>'
      xml = xml.replace(tableMarker, tableRows)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Доклад_предстоящи_ремонти_${month}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Preview content generator
  function generatePreviewContent() {
    const monthName = month || '____________'
    const dateStr = reportDate ? formatShortDate(reportDate) : '__.__.____'

    let facilitiesText = ''
    facilities.forEach((facility, fIdx) => {
      if (!facility.name) return
      facilitiesText += `\\n${fIdx + 1}. ${facility.name}\\n`
      facility.repairs.forEach((repair, rIdx) => {
        if (!repair.pipeline) return
        const locations = formatLocations(repair.locations)
        facilitiesText += `  — Ремонт #${rIdx + 1}\\n`
        facilitiesText += `  Тръбопровод ${locations || '_____.хкм _____'}\\n`
        facilitiesText += `  Необходими материали: ${repair.materials || '_____________________'}\\n`
        facilitiesText += `  Необходими техника и човешки ресурс: ${repair.workers || '_______'}\\n\\n`
      })
    })

    return `ДОКЛАД
за предстоящите ремонтни дейности по УДВН
м. ${monthName} 2026 г.
от ${dateStr} г. г.

През м. ${monthName} 2026 г. ще бъдат извършени следните ремонтни дейности:
${facilitiesText}

                                    гр. Ямбол, ${dateStr} г. г.
                                    инж. УДВН
                                    /Ст. Димитрова/`
  }

// Visual styling fixes for UdvnUpcomingGenerator - replace the return statement

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Месец*</label>
            <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">Избери...</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата на доклада*</label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="px-4 py-2.5 shadow-sm" />
          </div>
        </div>

        {/* Facilities section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-700">Съоръжения</h3>
            <button
              onClick={addFacility}
              className="px-5 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors shadow-sm"
            >
              + Добави съоръжение
            </button>
          </div>

          {facilities.map((facility, fIdx) => (
            <div key={fIdx} className="bg-white rounded-xl shadow-md p-6 mb-5 border border-gray-100">
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-base font-semibold text-gray-800">{fIdx + 1}. Съоръжение</h4>
                  {facilities.length > 1 && (
                    <button onClick={() => removeFacility(fIdx)} className="text-red-500 hover:text-red-700 text-sm font-medium">✕</button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Име на съоръжението*</label>
                  <Input
                    value={facility.name}
                    onChange={e => updateFacility(fIdx, 'name', e.target.value)}
                    placeholder='НП "Зимница"'
                    className="px-4 py-2.5"
                  />
                </div>
              </div>

              {/* Repairs subsection */}
              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Ремонти</h5>
                {facility.repairs.map((repair, rIdx) => (
                  <div key={rIdx} className="bg-gray-50 rounded-lg p-5 mb-4 border-l-4 border-teal-400">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-semibold text-gray-700">— Ремонт #{rIdx + 1}</span>
                      {facility.repairs.length > 1 && (
                        <button
                          onClick={() => removeRepair(fIdx, rIdx)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          ✕ Премахни ремонт
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Pipeline */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Тръбопровод</label>
                        <Input
                          value={repair.pipeline}
                          onChange={e => updateRepair(fIdx, rIdx, 'pipeline', e.target.value)}
                          placeholder="6-I-T-5"
                          className="px-3 py-2"
                        />
                      </div>

                      {/* Locations (multiple) */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Хектометър
                        </label>
                        {repair.locations.map((loc, lIdx) => (
                          <div key={lIdx} className="flex gap-2 mb-2">
                            <select
                              className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500"
                              value={loc.unit}
                              onChange={e => updateLocation(fIdx, rIdx, lIdx, 'unit', e.target.value)}
                            >
                              <option value="hkm">хкм</option>
                              <option value="km">при км</option>
                            </select>
                            <Input
                              className="flex-1 px-3 py-2"
                              value={loc.value}
                              onChange={e => updateLocation(fIdx, rIdx, lIdx, 'value', e.target.value)}
                              placeholder="3+10"
                            />
                            {repair.locations.length > 1 && (
                              <button
                                onClick={() => removeLocation(fIdx, rIdx, lIdx)}
                                className="text-red-500 hover:text-red-700 px-2"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addLocation(fIdx, rIdx)}
                          className="text-teal-600 text-xs font-medium hover:text-teal-700 mt-1"
                        >
                          + Добави местоположение
                        </button>
                      </div>

                      {/* Repair type */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Вид ремонт</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-teal-500"
                          value={repair.repairType}
                          onChange={e => updateRepair(fIdx, rIdx, 'repairType', e.target.value)}
                        >
                          <option value="">Изберете вид ремонт</option>
                          <option value="Ремонт на тръба">Ремонт на тръба</option>
                          <option value="Ремонт на хидрант">Ремонт на хидрант</option>
                          <option value="Друго">Друго</option>
                        </select>
                      </div>

                      {/* Materials */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Необходими материали</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-teal-500"
                          rows={2}
                          value={repair.materials}
                          onChange={e => updateRepair(fIdx, rIdx, 'materials', e.target.value)}
                          placeholder="Автоматично попълва при избор на вид ремонт"
                        />
                      </div>

                      {/* Workers */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Работници (напр. 4 човека - 2 часа)</label>
                        <Input
                          value={repair.workers}
                          onChange={e => updateRepair(fIdx, rIdx, 'workers', e.target.value)}
                          placeholder="4 човека - 2 часа"
                          className="px-3 py-2"
                        />
                      </div>

                      {/* Excavator */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Багер (напр. 1 ден)</label>
                        <Input
                          value={repair.excavator}
                          onChange={e => updateRepair(fIdx, rIdx, 'excavator', e.target.value)}
                          placeholder="1 ден"
                          className="px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => addRepair(fIdx)}
                  className="text-teal-600 text-sm font-medium hover:text-teal-700"
                >
                  + Добави ремонт
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="w-full py-3.5 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <DownloadIcon className="w-5 h-5" />
          Изтегли доклад
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="whitespace-pre-wrap text-gray-900"
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '12pt',
              lineHeight: '1.6'
            }}
          >
            {generatePreviewContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

// UDVN COMPLETED GENERATOR

function UdvnCompletedGenerator({
  month,
  setMonth,
  reportDate,
  setReportDate,
  facilities,
  setFacilities
}: {
  month: string
  setMonth: (m: string) => void
  reportDate: string
  setReportDate: (d: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  function updateFacility(index: number, field: keyof UdvnFacility, value: any) {
    const updated = [...facilities]
    updated[index] = { ...updated[index], [field]: value }
    setFacilities(updated)
  }

  function addFacility() {
    setFacilities([...facilities, { ...EMPTY_FACILITY }])
  }

  function removeFacility(index: number) {
    if (facilities.length > 1) {
      setFacilities(facilities.filter((_, i) => i !== index))
    }
  }

  function addRepair(facilityIndex: number) {
    const updated = [...facilities]
    updated[facilityIndex].repairs.push({ ...EMPTY_REPAIR })
    setFacilities(updated)
  }

  function removeRepair(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    if (updated[facilityIndex].repairs.length > 1) {
      updated[facilityIndex].repairs.splice(repairIndex, 1)
      setFacilities(updated)
    }
  }

  function updateRepair(facilityIndex: number, repairIndex: number, field: keyof UdvnRepairItem, value: any) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex] = {
      ...updated[facilityIndex].repairs[repairIndex],
      [field]: value
    }

    if (field === 'repairType' && value === 'hydrant') {
      updated[facilityIndex].repairs[repairIndex].hydrantCount = 1
      updated[facilityIndex].repairs[repairIndex].materials = '1 бр. хидрант'
      updated[facilityIndex].repairs[repairIndex].workersCount = '2 човека – 2 часа'
      updated[facilityIndex].repairs[repairIndex].excavatorTime = '-'
      updated[facilityIndex].repairs[repairIndex].workers = 'работници 2 човека – 2 часа'
    }

    if (field === 'repairType' && value === 'pipe') {
      updated[facilityIndex].repairs[repairIndex].pipeCount = 1
      updated[facilityIndex].repairs[repairIndex].workersCount = '4 човека – 2 часа'
      updated[facilityIndex].repairs[repairIndex].excavatorTime = '1 ден'
      updated[facilityIndex].repairs[repairIndex].workers = 'работници 4 човека – 2 часа, багер 1 ден'
    }

    if (field === 'hydrantCount' || field === 'pipeType' || field === 'pipeSize' || field === 'pipeCount') {
      const repair = updated[facilityIndex].repairs[repairIndex]
      if (repair.repairType === 'hydrant' && repair.hydrantCount) {
        repair.materials = `${repair.hydrantCount} бр. хидрант${repair.hydrantCount > 1 ? 'а' : ''}`
      } else if (repair.repairType === 'pipe' && repair.pipeType && repair.pipeSize && repair.pipeCount) {
        repair.materials = `${repair.pipeType} тръба Ф${repair.pipeSize}, ${repair.pipeCount} бр.`
      }
    }

    setFacilities(updated)
  }

  function addLocation(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations.push({ unit: 'hkm', value: '' })
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  function removeLocation(facilityIndex: number, repairIndex: number, locationIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    if (repair.locations.length > 1) {
      repair.locations.splice(locationIndex, 1)
      updated[facilityIndex].repairs[repairIndex] = repair
      setFacilities(updated)
    }
  }

  function updateLocation(facilityIndex: number, repairIndex: number, locationIndex: number, field: 'unit' | 'value', value: string) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations[locationIndex] = {
      ...repair.locations[locationIndex],
      [field]: value
    }
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/Доклад извършени ремонти.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{МЕСЕЦ}', month)
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(reportDate))

      let tableRows = ''
      facilities.forEach(facility => {
        facility.repairs.forEach(repair => {
          const migratedRepair = migrateLegacyLocation(repair)
          const location = formatLocations(migratedRepair.locations)
          tableRows += `<w:tr><w:tc><w:p><w:r><w:t>${facility.name}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.pipeline}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${location}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.repairType}\n${repair.description}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.materials}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.workers}</w:t></w:r></w:p></w:tc></w:tr>`
        })
      })

      const tableMarker = '<w:tr><w:tc><w:p><w:r><w:t>{TABLE_ROWS}</w:t></w:r></w:p></w:tc></w:tr>'
      xml = xml.replace(tableMarker, tableRows)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Доклад_извършени_ремонти_${month}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Preview content generator
  function generatePreviewContent() {
    const monthName = month || '____________'
    const dateStr = reportDate ? formatShortDate(reportDate) : '__.__.____'

    let tableContent = ''
    let rowNum = 1
    facilities.forEach(facility => {
      facility.repairs.forEach(repair => {
        const migratedRepair = migrateLegacyLocation(repair)
        const location = formatLocations(migratedRepair.locations) || '___________'
        tableContent += `${rowNum}. ${facility.name || '____________'} | ${repair.pipeline || '______'} | ${location} | ${repair.repairType || '______'} ${repair.description || '____________'} | ${repair.materials || '____________'} | ${repair.workers || '____________'}\n`
        rowNum++
      })
    })

    return `ДОКЛАД
за извършените ремонтни дейности по УДВН
м. ${monthName} 2026 г.
от ${dateStr} г. г.

През м. ${monthName} 2026 г. бяха извършени следните ремонтни дейности:

№ | Съоръжение | Тръбопровод | Местоположение | Вид ремонт | Материали | Извършена работа
─────────────────────────────────────────────────────────────────────────────────────────
${tableContent}

                                    гр. Ямбол, ${dateStr} г. г.
                                    инж. УДВН
                                    /Ст. Димитрова/`
  }

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Месец*</label>
            <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">Избери...</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата на доклада*</label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="px-4 py-2.5 shadow-sm" />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-700">Напоителни системи</h3>
            <button
              onClick={addFacility}
              className="px-5 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors shadow-sm"
            >
              + Добави система
            </button>
          </div>

          {facilities.map((facility, fIdx) => (
            <div key={fIdx} className="bg-white rounded-xl shadow-md p-6 mb-5 border border-gray-100">
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-base font-semibold text-gray-800">{fIdx + 1}. Напоителна система</h4>
                  {facilities.length > 1 && (
                    <button onClick={() => removeFacility(fIdx)} className="text-red-500 hover:text-red-700 text-sm font-medium">✕</button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Име на системата*</label>
                  <Input value={facility.name} onChange={e => updateFacility(fIdx, 'name', e.target.value)} placeholder="ХТР-Ямбол" className="px-4 py-2.5" />
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Извършени ремонти</h5>
                {facility.repairs.map((repair, rIdx) => {
                  const migratedRepair = migrateLegacyLocation(repair)
                  return (
                    <div key={rIdx} className="bg-gray-50 rounded-lg p-5 mb-4 border-l-4 border-teal-400">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-gray-700">— Ремонт #{rIdx + 1}</span>
                        {facility.repairs.length > 1 && (
                          <button onClick={() => removeRepair(fIdx, rIdx)} className="text-red-500 hover:text-red-700 text-xs font-medium">✕ Премахни</button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Тръбопровод</label>
                          <Input value={repair.pipeline} onChange={e => updateRepair(fIdx, rIdx, 'pipeline', e.target.value)} placeholder="6-I-T-5" className="px-3 py-2" />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Местоположения</label>
                          {migratedRepair.locations.map((loc, lIdx) => (
                            <div key={lIdx} className="flex gap-2 mb-2">
                              <select className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500" value={loc.unit} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'unit', e.target.value)}>
                                <option value="hkm">хкм</option>
                                <option value="km">при км</option>
                              </select>
                              <Input className="flex-1 px-3 py-2" value={loc.value} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'value', e.target.value)} placeholder="3+10" />
                              {migratedRepair.locations.length > 1 && (
                                <button onClick={() => removeLocation(fIdx, rIdx, lIdx)} className="text-red-500 hover:text-red-700 px-2">✕</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addLocation(fIdx, rIdx)} className="text-teal-600 text-xs font-medium hover:text-teal-700 mt-1">+ Добави местоположение</button>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Вид ремонт</label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-teal-500" value={repair.repairType} onChange={e => updateRepair(fIdx, rIdx, 'repairType', e.target.value)}>
                            <option value="">Избери...</option>
                            <option value="hydrant">Хидрант</option>
                            <option value="pipe">Тръба</option>
                            <option value="other">Друго</option>
                          </select>
                        </div>

                        {repair.repairType === 'hydrant' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Брой хидранти</label>
                            <Input type="number" value={repair.hydrantCount || ''} onChange={e => updateRepair(fIdx, rIdx, 'hydrantCount', parseInt(e.target.value) || 0)} className="px-3 py-2" />
                          </div>
                        )}

                        {repair.repairType === 'pipe' && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Вид тръба</label>
                              <select className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-teal-500" value={repair.pipeType || ''} onChange={e => updateRepair(fIdx, rIdx, 'pipeType', e.target.value)}>
                                <option value="">Избери...</option>
                                <option value="Стоманобетонова">Стоманобетонова</option>
                                <option value="Азбестоциментова">Азбестоциментова</option>
                                <option value="ПВЦ">ПВЦ</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Размер (Ф)</label>
                              <Input value={repair.pipeSize || ''} onChange={e => updateRepair(fIdx, rIdx, 'pipeSize', e.target.value)} placeholder="500" className="px-3 py-2" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Брой тръби</label>
                              <Input type="number" value={repair.pipeCount || ''} onChange={e => updateRepair(fIdx, rIdx, 'pipeCount', parseInt(e.target.value) || 0)} className="px-3 py-2" />
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Описание</label>
                          <Input value={repair.description} onChange={e => updateRepair(fIdx, rIdx, 'description', e.target.value)} placeholder="ремонт на повреда" className="px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Използвани материали</label>
                          <Input value={repair.materials} onChange={e => updateRepair(fIdx, rIdx, 'materials', e.target.value)} placeholder="автоматично попълва" className="px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Извършена работа</label>
                          <Input value={repair.workers} onChange={e => updateRepair(fIdx, rIdx, 'workers', e.target.value)} placeholder="работници 4 човека - 2 часа" className="px-3 py-2" />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => addRepair(fIdx)} className="text-teal-600 text-sm font-medium hover:text-teal-700">+ Добави ремонт</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDownload}
          className="w-full py-3.5 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <DownloadIcon className="w-5 h-5" />
          Изтегли доклад
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="whitespace-pre-wrap text-gray-900"
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '12pt',
              lineHeight: '1.6'
            }}
          >
            {generatePreviewContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ODZ LETTER GENERATOR

function OdzLetterGenerator({
  letterDate,
  setLetterDate,
  facilities,
  setFacilities
}: {
  letterDate: string
  setLetterDate: (d: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  function updateFacility(index: number, field: keyof UdvnFacility, value: any) {
    const updated = [...facilities]
    updated[index] = { ...updated[index], [field]: value }
    setFacilities(updated)
  }

  function addFacility() {
    setFacilities([...facilities, { ...EMPTY_FACILITY }])
  }

  function removeFacility(index: number) {
    if (facilities.length > 1) {
      setFacilities(facilities.filter((_, i) => i !== index))
    }
  }

  function addRepair(facilityIndex: number) {
    const updated = [...facilities]
    updated[facilityIndex].repairs.push({ ...EMPTY_REPAIR })
    setFacilities(updated)
  }

  function removeRepair(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    if (updated[facilityIndex].repairs.length > 1) {
      updated[facilityIndex].repairs.splice(repairIndex, 1)
      setFacilities(updated)
    }
  }

  function updateRepair(facilityIndex: number, repairIndex: number, field: keyof UdvnRepairItem, value: any) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex] = {
      ...updated[facilityIndex].repairs[repairIndex],
      [field]: value
    }
    setFacilities(updated)
  }

  function addLocation(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations.push({ unit: 'hkm', value: '' })
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  function removeLocation(facilityIndex: number, repairIndex: number, locationIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    if (repair.locations.length > 1) {
      repair.locations.splice(locationIndex, 1)
      updated[facilityIndex].repairs[repairIndex] = repair
      setFacilities(updated)
    }
  }

  function updateLocation(facilityIndex: number, repairIndex: number, locationIndex: number, field: 'unit' | 'value', value: string) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations[locationIndex] = {
      ...repair.locations[locationIndex],
      [field]: value
    }
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/писмо ОДЗ УДВН предстоящи.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(letterDate))

      let listItems = ''
      facilities.forEach(facility => {
        facility.repairs.forEach(repair => {
          const migratedRepair = migrateLegacyLocation(repair)
          const location = formatLocations(migratedRepair.locations)
          listItems += `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${facility.name} – ${repair.pipeline} ${location} – ${repair.description}</w:t></w:r></w:p>`
        })
      })

      const listMarker = '<w:p><w:r><w:t>{LIST_ITEMS}</w:t></w:r></w:p>'
      xml = xml.replace(listMarker, listItems)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Писмо_ОДЗ_${formatShortDate(letterDate)}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Preview content generator
  function generatePreviewContent() {
    const dateStr = letterDate ? formatShortDate(letterDate) : '__.__.____'

    let listContent = ''
    facilities.forEach(facility => {
      facility.repairs.forEach(repair => {
        const migratedRepair = migrateLegacyLocation(repair)
        const location = formatLocations(migratedRepair.locations) || '___________'
        listContent += `  • ${facility.name || '____________'} – ${repair.pipeline || '______'} ${location} – ${repair.description || '____________'}\n`
      })
    })

    return `                                                        До
                                                        Областна дирекция "Земеделие"
                                                        гр. Ямбол

УВЕДОМЛЕНИЕ
за предстоящи ремонтни дейности по УДВН

Уважаема госпожо/господин Директор,

Уведомяваме Ви, че предстоят следните ремонтни дейности по напоителната система:

${listContent}

Моля да бъдат предприети необходимите действия.


                                                        гр. Ямбол, ${dateStr} г. г.
                                                        инж. УДВН
                                                        /Ст. Димитрова/`
  }

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Дата на писмото*</label>
          <Input type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)} className="px-4 py-2.5 shadow-sm" />
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-700">Предстоящи ремонти</h3>
            <button
              onClick={addFacility}
              className="px-5 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors shadow-sm"
            >
              + Добави система
            </button>
          </div>

          {facilities.map((facility, fIdx) => (
            <div key={fIdx} className="bg-white rounded-xl shadow-md p-6 mb-5 border border-gray-100">
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-base font-semibold text-gray-800">{fIdx + 1}. Напоителна система</h4>
                  {facilities.length > 1 && (
                    <button onClick={() => removeFacility(fIdx)} className="text-red-500 hover:text-red-700 text-sm font-medium">✕</button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Име на системата*</label>
                  <Input value={facility.name} onChange={e => updateFacility(fIdx, 'name', e.target.value)} placeholder="ХТР-Ямбол" className="px-4 py-2.5" />
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Предстоящи ремонти</h5>
                {facility.repairs.map((repair, rIdx) => {
                  const migratedRepair = migrateLegacyLocation(repair)
                  return (
                    <div key={rIdx} className="bg-gray-50 rounded-lg p-5 mb-4 border-l-4 border-teal-400">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-gray-700">— Ремонт #{rIdx + 1}</span>
                        {facility.repairs.length > 1 && (
                          <button onClick={() => removeRepair(fIdx, rIdx)} className="text-red-500 hover:text-red-700 text-xs font-medium">✕ Премахни</button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Тръбопровод</label>
                          <Input value={repair.pipeline} onChange={e => updateRepair(fIdx, rIdx, 'pipeline', e.target.value)} placeholder="6-I-T-5" className="px-3 py-2" />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Местоположения</label>
                          {migratedRepair.locations.map((loc, lIdx) => (
                            <div key={lIdx} className="flex gap-2 mb-2">
                              <select className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500" value={loc.unit} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'unit', e.target.value)}>
                                <option value="hkm">хкм</option>
                                <option value="km">при км</option>
                              </select>
                              <Input className="flex-1 px-3 py-2" value={loc.value} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'value', e.target.value)} placeholder="3+10" />
                              {migratedRepair.locations.length > 1 && (
                                <button onClick={() => removeLocation(fIdx, rIdx, lIdx)} className="text-red-500 hover:text-red-700 px-2">✕</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addLocation(fIdx, rIdx)} className="text-teal-600 text-xs font-medium hover:text-teal-700 mt-1">+ Добави местоположение</button>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Описание на ремонта</label>
                          <Input value={repair.description} onChange={e => updateRepair(fIdx, rIdx, 'description', e.target.value)} placeholder="подмяна на повредени участъци" className="px-3 py-2" />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => addRepair(fIdx)} className="text-teal-600 text-sm font-medium hover:text-teal-700">+ Добави ремонт</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDownload}
          className="w-full py-3.5 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <DownloadIcon className="w-5 h-5" />
          Изтегли писмо
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="whitespace-pre-wrap text-gray-900"
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '12pt',
              lineHeight: '1.6'
            }}
          >
            {generatePreviewContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

// PROTOCOL GENERATOR

function ProtocolGenerator({
  protocolNumber,
  setProtocolNumber,
  protocolDate,
  setProtocolDate,
  facilities,
  setFacilities
}: {
  protocolNumber: string
  setProtocolNumber: (n: string) => void
  protocolDate: string
  setProtocolDate: (d: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  function updateFacility(index: number, field: keyof UdvnFacility, value: any) {
    const updated = [...facilities]
    updated[index] = { ...updated[index], [field]: value }
    setFacilities(updated)
  }

  function addFacility() {
    setFacilities([...facilities, { ...EMPTY_FACILITY }])
  }

  function removeFacility(index: number) {
    if (facilities.length > 1) {
      setFacilities(facilities.filter((_, i) => i !== index))
    }
  }

  function addRepair(facilityIndex: number) {
    const updated = [...facilities]
    updated[facilityIndex].repairs.push({ ...EMPTY_REPAIR })
    setFacilities(updated)
  }

  function removeRepair(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    if (updated[facilityIndex].repairs.length > 1) {
      updated[facilityIndex].repairs.splice(repairIndex, 1)
      setFacilities(updated)
    }
  }

  function updateRepair(facilityIndex: number, repairIndex: number, field: keyof UdvnRepairItem, value: any) {
    const updated = [...facilities]
    updated[facilityIndex].repairs[repairIndex] = {
      ...updated[facilityIndex].repairs[repairIndex],
      [field]: value
    }
    setFacilities(updated)
  }

  function addLocation(facilityIndex: number, repairIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations.push({ unit: 'hkm', value: '' })
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  function removeLocation(facilityIndex: number, repairIndex: number, locationIndex: number) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    if (repair.locations.length > 1) {
      repair.locations.splice(locationIndex, 1)
      updated[facilityIndex].repairs[repairIndex] = repair
      setFacilities(updated)
    }
  }

  function updateLocation(facilityIndex: number, repairIndex: number, locationIndex: number, field: 'unit' | 'value', value: string) {
    const updated = [...facilities]
    const repair = migrateLegacyLocation(updated[facilityIndex].repairs[repairIndex])
    repair.locations[locationIndex] = {
      ...repair.locations[locationIndex],
      [field]: value
    }
    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/Протокол УДВН.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{НОМЕР}', protocolNumber)
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(protocolDate))

      let tableRows = ''
      facilities.forEach(facility => {
        facility.repairs.forEach(repair => {
          const migratedRepair = migrateLegacyLocation(repair)
          const location = formatLocations(migratedRepair.locations)
          tableRows += `<w:tr><w:tc><w:p><w:r><w:t>${facility.name}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.pipeline}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${location}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>${repair.description}</w:t></w:r></w:p></w:tc></w:tr>`
        })
      })

      const tableMarker = '<w:tr><w:tc><w:p><w:r><w:t>{TABLE_ROWS}</w:t></w:r></w:p></w:tc></w:tr>'
      xml = xml.replace(tableMarker, tableRows)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Протокол_${protocolNumber}_${formatShortDate(protocolDate)}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Preview content generator
  function generatePreviewContent() {
    const protocolNum = protocolNumber || '____'
    const dateStr = protocolDate ? formatShortDate(protocolDate) : '__.__.____'

    let tableContent = ''
    let rowNum = 1
    facilities.forEach(facility => {
      facility.repairs.forEach(repair => {
        const migratedRepair = migrateLegacyLocation(repair)
        const location = formatLocations(migratedRepair.locations) || '___________'
        tableContent += `${rowNum}. ${facility.name || '____________'} | ${repair.pipeline || '______'} | ${location} | ${repair.description || '____________'}\n`
        rowNum++
      })
    })

    return `ПРОТОКОЛ № ${protocolNum}
от ${dateStr} г.

Днес, ${dateStr} г., инж. УДВН извърши проверка на обектите от напоителната система и констатира следното:

№ | Съоръжение | Тръбопровод | Местоположение | Констатация
─────────────────────────────────────────────────────────────────────────────
${tableContent}

Протоколът се съставя в два еднообразни екземпляра.


                                                        Изготвил:
                                                        инж. УДВН
                                                        /Ст. Димитрова/`
  }

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Номер на протокола*</label>
            <Input value={protocolNumber} onChange={e => setProtocolNumber(e.target.value)} placeholder="1" className="px-4 py-2.5 shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата*</label>
            <Input type="date" value={protocolDate} onChange={e => setProtocolDate(e.target.value)} className="px-4 py-2.5 shadow-sm" />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-700">Констатации</h3>
            <button
              onClick={addFacility}
              className="px-5 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors shadow-sm"
            >
              + Добави система
            </button>
          </div>

          {facilities.map((facility, fIdx) => (
            <div key={fIdx} className="bg-white rounded-xl shadow-md p-6 mb-5 border border-gray-100">
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-base font-semibold text-gray-800">{fIdx + 1}. Напоителна система</h4>
                  {facilities.length > 1 && (
                    <button onClick={() => removeFacility(fIdx)} className="text-red-500 hover:text-red-700 text-sm font-medium">✕</button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Име на системата*</label>
                  <Input value={facility.name} onChange={e => updateFacility(fIdx, 'name', e.target.value)} placeholder="ХТР-Ямбол" className="px-4 py-2.5" />
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Констатации</h5>
                {facility.repairs.map((repair, rIdx) => {
                  const migratedRepair = migrateLegacyLocation(repair)
                  return (
                    <div key={rIdx} className="bg-gray-50 rounded-lg p-5 mb-4 border-l-4 border-teal-400">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-gray-700">— Констатация #{rIdx + 1}</span>
                        {facility.repairs.length > 1 && (
                          <button onClick={() => removeRepair(fIdx, rIdx)} className="text-red-500 hover:text-red-700 text-xs font-medium">✕ Премахни</button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Тръбопровод</label>
                          <Input value={repair.pipeline} onChange={e => updateRepair(fIdx, rIdx, 'pipeline', e.target.value)} placeholder="6-I-T-5" className="px-3 py-2" />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Местоположения</label>
                          {migratedRepair.locations.map((loc, lIdx) => (
                            <div key={lIdx} className="flex gap-2 mb-2">
                              <select className="w-28 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500" value={loc.unit} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'unit', e.target.value)}>
                                <option value="hkm">хкм</option>
                                <option value="km">при км</option>
                              </select>
                              <Input className="flex-1 px-3 py-2" value={loc.value} onChange={e => updateLocation(fIdx, rIdx, lIdx, 'value', e.target.value)} placeholder="3+10" />
                              {migratedRepair.locations.length > 1 && (
                                <button onClick={() => removeLocation(fIdx, rIdx, lIdx)} className="text-red-500 hover:text-red-700 px-2">✕</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addLocation(fIdx, rIdx)} className="text-teal-600 text-xs font-medium hover:text-teal-700 mt-1">+ Добави местоположение</button>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Описание на констатацията</label>
                          <Input value={repair.description} onChange={e => updateRepair(fIdx, rIdx, 'description', e.target.value)} placeholder="необходим спешен ремонт" className="px-3 py-2" />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => addRepair(fIdx)} className="text-teal-600 text-sm font-medium hover:text-teal-700">+ Добави констатация</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDownload}
          className="w-full py-3.5 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <DownloadIcon className="w-5 h-5" />
          Изтегли протокол
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="whitespace-pre-wrap text-gray-900"
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '12pt',
              lineHeight: '1.6'
            }}
          >
            {generatePreviewContent()}
          </div>
        </div>
      </div>
    </div>
  )
}



// ─── IRRIGATION CERTIFICATE SECTION ────────────────────────────────────────

interface LocalityInfo {
  name: string
  ekatte: string
  municipality: string
}

const YAMBOL_LOCALITIES: LocalityInfo[] = [
  // Болярово
  { name: 'Болярово', ekatte: '04787', municipality: 'Болярово' },
  { name: 'Воден', ekatte: '11215', municipality: 'Болярово' },
  { name: 'Голям извор', ekatte: '15255', municipality: 'Болярово' },
  { name: 'Голямо Крушево', ekatte: '15539', municipality: 'Болярово' },
  { name: 'Горна хубавка', ekatte: '15915', municipality: 'Болярово' },
  { name: 'Долно Ботево', ekatte: '21256', municipality: 'Болярово' },
  { name: 'Малко Шарково', ekatte: '46821', municipality: 'Болярово' },
  { name: 'Оман', ekatte: '53154', municipality: 'Болярово' },
  { name: 'Попово', ekatte: '58286', municipality: 'Болярово' },
  { name: 'Поточе', ekatte: '58564', municipality: 'Болярово' },
  { name: 'Силен', ekatte: '66552', municipality: 'Болярово' },
  { name: 'Стройно', ekatte: '70514', municipality: 'Болярово' },
  { name: 'Three Sequoia Trees', ekatte: '73169', municipality: 'Болярово' },
  { name: 'Шарково', ekatte: '82495', municipality: 'Болярово' },

  // Елхово
  { name: 'Елхово', ekatte: '24235', municipality: 'Елхово' },
  { name: 'Бисер', ekatte: '04139', municipality: 'Елхово' },
  { name: 'Борисово', ekatte: '05642', municipality: 'Елхово' },
  { name: 'Вълча поляна', ekatte: '13209', municipality: 'Елхово' },
  { name: 'Gabra', ekatte: '13712', municipality: 'Елхово' },
  { name: 'Голям Дервент', ekatte: '15240', municipality: 'Елхово' },
  { name: 'Golyam Manastir', ekatte: '15446', municipality: 'Елхово' },
  { name: 'Granit', ekatte: '16115', municipality: 'Елхово' },
  { name: 'Group', ekatte: '16387', municipality: 'Елхово' },
  { name: 'Dramatic', ekatte: '20886', municipality: 'Елхово' },
  { name: 'Lesovo', ekatte: '43089', municipality: 'Елхово' },
  { name: 'Malak Manastir', ekatte: '46203', municipality: 'Елхово' },
  { name: 'Маломир', ekatte: '46719', municipality: 'Елхово' },
  { name: 'Мелница', ekatte: '47859', municipality: 'Елхово' },
  { name: 'Пчела', ekatte: '61361', municipality: 'Елхово' },
  { name: 'Раздел', ekatte: '61932', municipality: 'Елхово' },
  { name: 'Sabrano', ekatte: '63357', municipality: 'Елхово' },
  { name: 'Svetlina', ekatte: '71436', municipality: 'Елхово' },
  { name: 'Trankovo', ekatte: '73434', municipality: 'Елхово' },
  { name: 'Chernozem', ekatte: '79646', municipality: 'Елхово' },

  // Стралджа
  { name: 'Стралджа', ekatte: '69888', municipality: 'Стралджа' },
  { name: 'Aleksandrovo', ekatte: '00393', municipality: 'Стралджа' },
  { name: 'Атолово', ekatte: '02378', municipality: 'Стралджа' },
  { name: 'Воденичарово', ekatte: '11149', municipality: 'Стралджа' },
  { name: 'Джинот', ekatte: '19747', municipality: 'Стралджа' },
  { name: 'Zimnitsa', ekatte: '30627', municipality: 'Стралджа' },
  { name: 'Иречеково', ekatte: '33403', municipality: 'Стралджа' },
  { name: 'Kayaloba', ekatte: '38784', municipality: 'Стралджа' },
  { name: 'Лозен', ekatte: '44252', municipality: 'Стралджа' },
  { name: 'Monastery', ekatte: '47522', municipality: 'Стралджа' },
  { name: 'Обручище', ekatte: '52568', municipality: 'Стралджа' },
  { name: 'Поляна', ekatte: '58177', municipality: 'Стралджа' },
  { name: 'Правдино', ekatte: '59069', municipality: 'Стралджа' },
  { name: 'Саранско', ekatte: '65161', municipality: 'Стралджа' },
  { name: 'Sini rid', ekatte: '67136', municipality: 'Стралджа' },
  { name: 'Тамарино', ekatte: '72098', municipality: 'Стралджа' },
  { name: 'Чарда', ekatte: '79360', municipality: 'Стралджа' },

  // Тунджа
  { name: 'Ябълково', ekatte: '84707', municipality: 'Тунджа' },
  { name: 'Асеново', ekatte: '02072', municipality: 'Тунджа' },
  { name: 'Безмер', ekatte: '03590', municipality: 'Тунджа' },
  { name: 'Ботево', ekatte: '06003', municipality: 'Тунджа' },
  { name: 'Veselinovo', ekatte: '10123', municipality: 'Тунджа' },
  { name: 'Генерал Инзово', ekatte: '14266', municipality: 'Тунджа' },
  { name: 'Generand Toshevo', ekatte: '14348', municipality: 'Тунджа' },
  { name: 'Завой', ekatte: '29634', municipality: 'Тунджа' },
  { name: 'Zlatari', ekatte: '31166', municipality: 'Тунджа' },
  { name: 'Kalamitsa', ekatte: '36564', municipality: 'Тунджа' },
  { name: 'Kamenets', ekatte: '37127', municipality: 'Тунджа' },
  { name: 'Konevets', ekatte: '40780', municipality: 'Тунджа' },
  { name: 'Maglizh', ekatte: '45528', municipality: 'Тунджа' },
  { name: 'Меден кладенец', ekatte: '47587', municipality: 'Тунджа' },
  { name: 'Międlevo', ekatte: '48239', municipality: 'Тунджа' },
  { name: 'Окоп', ekatte: '53044', municipality: 'Тунджа' },
  { name: 'Победа', ekatte: '57191', municipality: 'Тунджа' },
  { name: 'Робово', ekatte: '62985', municipality: 'Тунджа' },
  { name: 'Сламино', ekatte: '67632', municipality: 'Тунджа' },
  { name: 'Скалица', ekatte: '67694', municipality: 'Тунджа' },
  { name: 'Tenkovo', ekatte: '72576', municipality: 'Тунджа' },
  { name: 'Huhla', ekatte: '77500', municipality: 'Тунджа' },
  { name: 'Челник', ekatte: '79857', municipality: 'Тунджа' },

  // Ямбол
  { name: 'Ямбол', ekatte: '84943', municipality: 'Ямбол' },
  { name: 'Боляриново', ekatte: '05279', municipality: 'Ямбол' },
  { name: 'Ботево', ekatte: '06004', municipality: 'Ямбол' },
  { name: 'Byal kladenets', ekatte: '07751', municipality: 'Ямбол' },
  { name: 'Войника', ekatte: '11555', municipality: 'Ямбол' },
  { name: 'Горна кабда', ekatte: '15824', municipality: 'Ямбол' },
  { name: 'Денница', ekatte: '19249', municipality: 'Ямбол' },
  { name: 'Диня', ekatte: '19958', municipality: 'Ямбол' },
  { name: 'Дражево', ekatte: '20784', municipality: 'Ямбол' },
  { name: 'Zhrebino', ekatte: '29140', municipality: 'Ямбол' },
  { name: 'Zlatари', ekatte: '31167', municipality: 'Ямбол' },
  { name: 'Kabile', ekatte: '35882', municipality: 'Ямбол' },
  { name: 'Каравелово', ekatte: '38072', municipality: 'Ямбол' },
  { name: 'Козарево', ekatte: '40148', municipality: 'Ямбол' },
  { name: 'Крумово', ekatte: '42580', municipality: 'Ямбол' },
  { name: 'Ловец', ekatte: '44144', municipality: 'Ямбол' },
  { name: 'Memoria', ekatte: '47967', municipality: 'Ямбол' },
  { name: 'Роза', ekatte: '63057', municipality: 'Ямбол' },
  { name: 'Савино', ekatte: '63646', municipality: 'Ямбол' },
  { name: 'Скалица', ekatte: '67695', municipality: 'Ямбол' },
  { name: 'Стара река', ekatte: '69236', municipality: 'Ямбол' },
  { name: 'Съединение', ekatte: '71126', municipality: 'Ямбол' },
  { name: 'Hannock', ekatte: '77370', municipality: 'Ямбол' },
]

interface IrrigationCertificate {
  ownerName: string
  ownerEgn: string
  ownerAddress: string
  locality: string
  ekatte: string
  municipality: string
  kadNumber: string
  area: string
  sketchType: 'location' | 'sketch'
  isIrrigable: boolean
}

function IrrigationCertificateGenerator() {
  const [cert, setCert] = useState<IrrigationCertificate>({
    ownerName: '',
    ownerEgn: '',
    ownerAddress: '',
    locality: '',
    ekatte: '',
    municipality: '',
    kadNumber: '',
    area: '',
    sketchType: 'location',
    isIrrigable: true
  })

  // Group localities by municipality
  const localitiesByMunicipality = YAMBOL_LOCALITIES.reduce((acc, loc) => {
    if (!acc[loc.municipality]) acc[loc.municipality] = []
    acc[loc.municipality].push(loc)
    return acc
  }, {} as Record<string, LocalityInfo[]>)

  const municipalities = Object.keys(localitiesByMunicipality).sort()

  function updateField(field: keyof IrrigationCertificate, value: any) {
    setCert({ ...cert, [field]: value })
  }

  function handleLocalityChange(localityName: string) {
    const locality = YAMBOL_LOCALITIES.find(l => l.name === localityName)
    if (locality) {
      setCert({
        ...cert,
        locality: locality.name,
        ekatte: locality.ekatte,
        municipality: locality.municipality
      })
    }
  }

  async function handleDownload() {
    try {
      const templatePath = './templates/Удостоверение за поливност/Удостоверение за ПОЛИВНОСТ НА ЗЕМЕДЕЛСКА ЗЕМЯ.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{ИМЕ}', cert.ownerName)
      xml = replacePlaceholder(xml, '{ЕГН}', cert.ownerEgn)
      xml = replacePlaceholder(xml, '{АДРЕС}', cert.ownerAddress)
      xml = replacePlaceholder(xml, '{НАСЕЛЕНО_МЯСТО}', cert.locality)
      xml = replacePlaceholder(xml, '{ЕКАТТЕ}', cert.ekatte)
      xml = replacePlaceholder(xml, '{ОБЩИНА}', cert.municipality)
      xml = replacePlaceholder(xml, '{КАД_НОМЕР}', cert.kadNumber)
      xml = replacePlaceholder(xml, '{ПЛОЩ}', cert.area)

      const sketchText = cert.sketchType === 'location' ? 'местоположение' : 'скица'
      xml = replacePlaceholder(xml, '{ВИД_СКИЦА}', sketchText)

      const irrigableText = cert.isIrrigable ? 'ПОЛИВНА' : 'НЕПОЛИВНА'
      xml = replacePlaceholder(xml, '{ПОЛИВНОСТ}', irrigableText)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Удостоверение_${cert.ownerName.replace(/\s+/g, '_')}_${cert.kadNumber}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormRow label="Име на собственик" required>
          <Input value={cert.ownerName} onChange={e => updateField('ownerName', e.target.value)} placeholder="Иван Петров Иванов" />
        </FormRow>
        <FormRow label="ЕГН" required>
          <Input value={cert.ownerEgn} onChange={e => updateField('ownerEgn', e.target.value)} placeholder="1234567890" maxLength={10} />
        </FormRow>
      </div>

      <FormRow label="Адрес">
        <Input value={cert.ownerAddress} onChange={e => updateField('ownerAddress', e.target.value)} placeholder="гр. Ямбол, ул. ..." />
      </FormRow>

      <div className="grid grid-cols-3 gap-4">
        <FormRow label="Населено място" required>
          <select
            className="w-full px-3 py-2 border rounded"
            value={cert.locality}
            onChange={e => handleLocalityChange(e.target.value)}
          >
            <option value="">Избери...</option>
            {municipalities.map(mun => (
              <optgroup key={mun} label={mun}>
                {localitiesByMunicipality[mun].map(loc => (
                  <option key={loc.ekatte} value={loc.name}>{loc.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </FormRow>

        <FormRow label="ЕКАТТЕ код">
          <Input value={cert.ekatte} readOnly className="bg-gray-50" />
        </FormRow>

        <FormRow label="Община">
          <Input value={cert.municipality} readOnly className="bg-gray-50" />
        </FormRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormRow label="Кадастрален номер" required>
          <Input value={cert.kadNumber} onChange={e => updateField('kadNumber', e.target.value)} placeholder="12345.678.901" />
        </FormRow>

        <FormRow label="Площ (дка)" required>
          <Input value={cert.area} onChange={e => updateField('area', e.target.value)} placeholder="12.50" />
        </FormRow>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <FormRow label="Вид на скицата">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={cert.sketchType === 'location'}
                onChange={() => updateField('sketchType', 'location')}
                className="w-4 h-4"
              />
              <span>Местоположение</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={cert.sketchType === 'sketch'}
                onChange={() => updateField('sketchType', 'sketch')}
                className="w-4 h-4"
              />
              <span>Скица</span>
            </label>
          </div>
        </FormRow>

        <FormRow label="Поливност">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cert.isIrrigable}
              onChange={e => updateField('isIrrigable', e.target.checked)}
              className="w-4 h-4"
            />
            <span>Земята е поливна</span>
          </label>
        </FormRow>
      </div>

      <Btn onClick={handleDownload}>
        <DownloadIcon className="w-4 h-4" />
        Изтегли удостоверение
      </Btn>
    </div>
  )
}

// ─── MAIN GENERATORS PAGE ─────────────────────────────────────────────────────
export default function Generators({ defaultTab }: { defaultTab?: 'contract' | 'act' | 'request' | 'udvn-upcoming' | 'udvn-completed' | 'odz-letter' | 'protocol' | 'irrigation-cert' }) {
  // Category state: napoyavane, udvn, or certificates
  const [category, setCategory] = useState<'napoyavane' | 'udvn' | 'certificates'>('napoyavane')

  // Napoyavane tabs
  const [napoyavaneTab, setNapoyavaneTab] = useState<'contract' | 'act' | 'request'>('contract')

  // UDVN tabs
  const [udvnTab, setUdvnTab] = useState<'upcoming' | 'completed' | 'odz-letter' | 'protocol'>('upcoming')

  // UDVN state for all generators
  const [udvnMonth, setUdvnMonth] = useState('Януари')
  const [udvnReportDate, setUdvnReportDate] = useState('')
  const [udvnFacilities, setUdvnFacilities] = useState<UdvnFacility[]>([{ ...EMPTY_FACILITY }])
  const [udvnLetterDate, setUdvnLetterDate] = useState('')
  const [udvnProtocolNumber, setUdvnProtocolNumber] = useState('')
  const [udvnProtocolDate, setUdvnProtocolDate] = useState('')

  // Handle default tab routing
  useState(() => {
    if (defaultTab === 'irrigation-cert') {
      setCategory('certificates')
    } else if (defaultTab === 'udvn-upcoming' || defaultTab === 'udvn-completed' || defaultTab === 'odz-letter' || defaultTab === 'protocol') {
      setCategory('udvn')
      if (defaultTab === 'udvn-upcoming') setUdvnTab('upcoming')
      else if (defaultTab === 'udvn-completed') setUdvnTab('completed')
      else if (defaultTab === 'odz-letter') setUdvnTab('odz-letter')
      else if (defaultTab === 'protocol') setUdvnTab('protocol')
    } else if (defaultTab) {
      setCategory('napoyavane')
      setNapoyavaneTab(defaultTab as 'contract' | 'act' | 'request')
    }
  })

  const napoyavaneTabs = [
    { id: 'contract', label: 'Договор' },
    { id: 'act', label: 'Акт' },
    { id: 'request', label: 'Заявка' },
  ] as const

  const udvnTabs = [
    { id: 'upcoming', label: 'Предстоящи ремонти' },
    { id: 'completed', label: 'Извършени ремонти' },
    { id: 'odz-letter', label: 'Писмо до ОДЗ' },
    { id: 'protocol', label: 'Протокол' },
  ] as const

  return (
    <div className="flex flex-col h-full">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Генератори на документи</h1>
        <p className="text-sm text-gray-500 mt-0.5">Попълнете критериите и прегледайте документа преди запазване</p>
      </div>

      {/* Category selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCategory('napoyavane')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${category === 'napoyavane' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <WaterDropIcon className="w-4 h-4" />
          Напояване
        </button>
        <button
          onClick={() => setCategory('udvn')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${category === 'udvn' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <ToolsIcon className="w-4 h-4" />
          УДВН
        </button>
        <button
          onClick={() => setCategory('certificates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${category === 'certificates' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <FileTextIcon className="w-4 h-4" />
          Удостоверения
        </button>
      </div>

      {/* Napoyavane tabs */}
      {category === 'napoyavane' && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
            {napoyavaneTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setNapoyavaneTab(t.id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${napoyavaneTab === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {napoyavaneTab === 'contract' && <ContractGenerator />}
            {napoyavaneTab === 'act' && <ActGenerator />}
            {napoyavaneTab === 'request' && <RequestGenerator />}
          </div>
        </>
      )}

      {/* UDVN tabs */}
      {category === 'udvn' && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
            {udvnTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setUdvnTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${udvnTab === t.id ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {udvnTab === 'upcoming' && (
              <UdvnUpcomingGenerator
                month={udvnMonth}
                setMonth={setUdvnMonth}
                reportDate={udvnReportDate}
                setReportDate={setUdvnReportDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'completed' && (
              <UdvnCompletedGenerator
                month={udvnMonth}
                setMonth={setUdvnMonth}
                reportDate={udvnReportDate}
                setReportDate={setUdvnReportDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'odz-letter' && (
              <OdzLetterGenerator
                letterDate={udvnLetterDate}
                setLetterDate={setUdvnLetterDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'protocol' && (
              <ProtocolGenerator
                protocolNumber={udvnProtocolNumber}
                setProtocolNumber={setUdvnProtocolNumber}
                protocolDate={udvnProtocolDate}
                setProtocolDate={setUdvnProtocolDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
          </div>
        </>
      )}

      {/* Certificates category */}
      {category === 'certificates' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <IrrigationCertificateGenerator />
        </div>
      )}
    </div>
  )
}
