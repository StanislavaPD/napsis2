import React, { useState, useRef, useEffect } from 'react'
import PizZip from 'pizzip'
import { useStore } from '../store'
import type { Contract, Act, IrrigRequest, Contractor } from '../types'
import { Btn, FormRow, Input, NumberInput, Select, Autocomplete, num, DownloadIcon, PrinterIcon, SaveIcon, FileTextIcon, ToolsIcon, WaterDropIcon } from './ui'
import { fillDocxTemplate, downloadBlob, openInDefaultApp, docxFillErrorMessage, type DocxTagData } from '../lib/docx-fill'

const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
const DOC_TYPES = ['Акт', 'Фактура', 'Протокол', 'Разписка', 'Друго']

/** Formats an "yyyy-mm-dd" date string as "dd.mm.yyyy". */
function formatShortDate(date?: string): string {
  if (!date) return '__.__.____'
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y}`
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
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/акт.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Не може да се зареди шаблонът')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'акт.docx')

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

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleFillTemplate}
          disabled={filling || !form.number || !form.contractorId}
          variant="primary"
          className="w-full"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto">
        <div className="bg-white m-4 rounded-lg shadow-sm border border-gray-100 p-6 font-serif text-[10px] leading-relaxed">
          {/* Header */}
          <div className="grid grid-cols-2 gap-8 mb-2">
            <div>
              <p className="font-bold">ДОСТАВЧИК:ВОДОПОЛЗВАТЕЛ:</p>
              <p>"НА ПОИТЕ ЛНИ СИСТЕМИ"&nbsp;&nbsp;&nbsp;ФИРМА:{cont?.name || '___________'}</p>
              <p>ЕАД КЛОН СРЕДНА ТУНДЖА{cont?.bulstat || '___________'}</p>
            </div>
          </div>

          {/* Act Title */}
          <p className="text-center mb-2">
            <strong>AКТ   №   {form.number || '___'}   по Договор  № ___/{form.date ? form.date.slice(0,4) : '____'}  год.</strong>
          </p>
          <div className="border-b border-gray-300 mb-2"></div>

          {/* Body paragraphs */}
          <p className="mb-1">
            Зa вoдни маси за напояване на селскостопански култури и дpyги нужди с държавни водиФизическо лице:___________
          </p>
          <p className="mb-1">
            Днес, {form.date ? formatShortDate(form.date) : '___'} {form.date ? form.date.slice(0,4) : '____'} г., ce състави настояшият акт в уверение на това че Доставчикът е подал
          </p>
          <p className="mb-1">
            на Водоползвателя и последният  приел през времето от ___ до ___ куб. м. вода за напояване,
          </p>
          <p className="mb-1">
            от която гравитачно ___,куб. м., помпено ___куб. м.; за други нужди  ___ куб. м., от която&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Л.К № .......................................................................... издадена от
          </p>
          <p className="mb-1">
            гравитачно ___ куб. и., помпено ___ куб. м............................................ЕИК/ЕГН {cont?.bulstat || '___'}
          </p>
          <p className="mb-1">
            Доставената вода е подадена на Водоползвателя я, както следва ___ живущ в гр./с./ {cont?.address || '___'}.
          </p>
          <p className="mb-1">
            ………………………………………………….….…/канал, ПC, водопровод и др./……………………………………………………
          </p>
          <p className="mb-2">
            …………………………………………………………………………………………………и са поляти следните култури
          </p>

          {/* Complex Table - 13 columns */}
          <table className="w-full border-collapse border border-gray-400 text-[8px] mb-2">
            <thead>
              {/* Header Row 1 - Top groups */}
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-0.5" rowSpan={4}></th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={6}>
                  ПОЛИВКА  № {form.irrigationNumber || '___'}
                </th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={3}>
                  ПОЛИВОДЕКАРИ
                </th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={3} rowSpan={2}>
                  ВСИЧКО ВОДНИ МАСИ
                </th>
              </tr>
              {/* Header Row 2 - Second level */}
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  ПОЛЯТИ<br/>дка<br/>ОБЩО(дка)
                </th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={2}>в това число</th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={3}>Актувана вода</th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  ПОЛЯТИ<br/>дка<br/>ОБЩО (дка)
                </th>
                <th className="border border-gray-400 p-0.5 text-center" colSpan={2}>в това число</th>
              </tr>
              {/* Header Row 3 - Third level */}
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  гравитачно<br/>(м3)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  помпено<br/>(дка)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  ОБЩО<br/>(куб. м.)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" colSpan={2}>
                  в т.ч.
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  гравитачно<br/>(м3)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  помпено<br/>(дка)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" colSpan={2}>
                  в т.ч.
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]" rowSpan={2}>
                  ОБЩО<br/>(куб. м.)
                </th>
              </tr>
              {/* Header Row 4 - Final columns */}
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-0.5 text-center text-[7px]">
                  гравитачно<br/>(куб. м.)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]">
                  помпено<br/>(куб. м.)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]">
                  гравитачно<br/>(куб. м.)
                </th>
                <th className="border border-gray-400 p-0.5 text-center text-[7px]">
                  помпено<br/>(куб. м.)
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Data row */}
              <tr>
                <td className="border border-gray-400 p-0.5">{crop?.name || '______'}</td>
                <td className="border border-gray-400 p-0.5 text-right">{num(form.area ?? 0, 2)}</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">{num(form.waterCubic ?? 0, 0)}</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">{num(form.waterCubic ?? 0, 0)}</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
                <td className="border border-gray-400 p-0.5 text-right">___</td>
              </tr>
              {/* Empty rows for additional cultures */}
              {[...Array(14)].map((_, i) => (
                <tr key={i}>
                  {[...Array(13)].map((_, j) => (
                    <td key={j} className="border border-gray-400 p-0.5 h-4"></td>
                  ))}
                </tr>
              ))}
              {/* Total row */}
              <tr className="bg-gray-50 font-bold">
                <td className="border border-gray-400 p-0.5">ВСИЧКО:</td>
                {[...Array(12)].map((_, i) => (
                  <td key={i} className="border border-gray-400 p-0.5 text-right">___</td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* Footer signatures */}
          <p className="text-[9px] mb-1">
            ДОСТАВЧИК : Техн. Напояване ХТР ……………………………………………..ВОДОПОЛЗВА ТЕЛ: ……………………………………………………………
          </p>
          <p className="text-[9px] text-center">
            /&nbsp;&nbsp;&nbsp;&nbsp;инж. Н. Касидов&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{cont?.name || '___________'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/
          </p>
        </div>
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

// ─── NAPOYAVANE APPENDICES SECTION ────────────────────────────────────────────

function Appendix6Generator() {
  const [form, setForm] = useState({
    MOL: '',
    EGN: '',
    nomerlichnakarta: '',
    izdadenaна: '',
    ot: '',
    data: new Date().toISOString().slice(0, 10),
  })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  function setF(patch: Partial<typeof form>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  async function handleGenerate() {
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/Декларация за съгласие Приложение 6.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Шаблонът не може да бъде зареден')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'Приложение 6.docx')

      const tagData = {
        MOL: form.MOL,
        EGN: form.EGN,
        nomerlichnakarta: form.nomerlichnakarta,
        'izdadena na': form.izdadenaна,
        ot: form.ot,
        data: formatShortDate(form.data),
      }

      const blob = await fillDocxTemplate(templateFile, tagData)
      await downloadBlob(blob, `Приложение_6_Декларация_${form.MOL || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">📄</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Приложение 6</p>
            <p className="text-xs text-gray-400">Декларация за съгласие за обработване на лични данни</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormRow label="МОЛ (Име, презиме, фамилия)" required>
            <Input value={form.MOL} onChange={e => setF({ MOL: e.target.value })} placeholder="Иван Петров Иванов" />
          </FormRow>
          <FormRow label="ЕГН" required>
            <Input value={form.EGN} onChange={e => setF({ EGN: e.target.value })} placeholder="1234567890" />
          </FormRow>
          <FormRow label="Номер на лична карта" required>
            <Input value={form.nomerlichnakarta} onChange={e => setF({ nomerlichnakarta: e.target.value })} placeholder="123456789" />
          </FormRow>
          <FormRow label="Издадена на (дата)" required>
            <Input value={form.izdadenaна} onChange={e => setF({ izdadenaна: e.target.value })} placeholder="15.03.2020" />
          </FormRow>
          <FormRow label="Издадена от" required>
            <Input value={form.ot} onChange={e => setF({ ot: e.target.value })} placeholder="МВР София" />
          </FormRow>
          <FormRow label="Дата на декларацията" required>
            <Input type="date" value={form.data} onChange={e => setF({ data: e.target.value })} />
          </FormRow>
        </div>

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleGenerate}
          disabled={filling || !form.MOL || !form.EGN || !form.nomerlichnakarta}
          variant="primary"
          className="w-full mt-2"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 font-serif text-sm leading-relaxed">
          <div className="text-center mb-6">
            <p className="text-base font-bold">ДЕКЛАРАЦИЯ ЗА СЪГЛАСИЕ</p>
            <p className="text-xs mt-1">ЗА СЪБИРАНЕ, ИЗПОЛЗВАНЕ И ОБРАБОТВАНЕ НА ЛИЧНИ ДАННИ</p>
          </div>

          <div className="text-xs space-y-3">
            <p>
              Долуподписаният/ата <strong>{form.MOL || '___________'}</strong> ЕГН <strong>{form.EGN || '___________'}</strong> ЛК№<strong>{form.nomerlichnakarta || '___________'}</strong>, издадена на <strong>{form.izdadenaна || '___________'}</strong> - от <strong>{form.ot || '___________'}</strong>, при спазване на разпоредбите и условията на Общия регламент за защита на личните данни и Закона за защита на личните данни (ЗЗЛД),
            </p>

            <p className="font-semibold mt-4">ДЕКЛАРИРАМ И СЕ СЪГЛАСЯВАМ, че:</p>

            <ol className="space-y-2 ml-4">
              <li>1. Предоставям пълни и верни данни относно своята самоличност и други пълни и верни данни, позволяващи идентифицирането ми.</li>
              <li>2. Известно ми е, че тази информация представлява лични данни и тяхната обработка е необходима предпоставка за разглеждане на подадените от мен документи.</li>
              <li>3. Запознат/а съм с правото да откажа предоставянето на лични данни и да не предоставя това съгласие.</li>
              <li>4. Известно ми е, че Дружеството е администратор на лични данни.</li>
              <li>5. Предоставям доброволно личните си данни и давам конкретното си съгласие „Напоителни системи" ЕАД да ги съхранява и обработва.</li>
              <li>6. Съгласен/а съм личните ми данни да бъдат обработвани от администратора за определени цели.</li>
              <li>7. Съгласен/а съм личните ми данни да бъдат обработвани и за допълнителни цели.</li>
              <li>8. Давам съгласие за разкриване на предоставените от мен лични данни пред определени категории получатели.</li>
              <li>9. Информиран/а съм за правото ми на достъп до отнасящите се за мен лични данни.</li>
              <li>10. Предоставените от мен данни са пълни и верни.</li>
              <li>11. Съгласието за обработване на личните ми данни обхваща правото на "Напоителни системи" ЕАД да ги обработва.</li>
              <li>12. Давам своето изрично съгласие личните ми данни да се съхраняват на електронни носители и на хартия.</li>
            </ol>

            <p className="mt-4 italic">
              Настоящата декларация се издава и подписва във връзка със сключване на „Договор за доставка на вода за напояване".
            </p>

            <div className="flex justify-between mt-8 pt-4">
              <div>
                <p>Дата: <strong>{formatShortDate(form.data)}</strong></p>
              </div>
              <div className="text-right">
                <p>Декларатор: ___________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Appendix1Generator() {
  const { contractors } = useStore()
  const [form, setForm] = useState({
    vodopolzvatel: contractors[0]?.name ?? '',
    contractorId: contractors[0]?.id ?? '',
    applicationNumber: '',
    year: new Date().getFullYear().toString(),
    piNumber: '',
    irrigationSystem: '',
    equipment: '',
    zemljishte: '',
    crop: '',
    dka: '',
    napNorma: '',
    gravitachno: '',
    pompeno: '',
    brPolivki: '',
    obshtoDka: '',
    obshtoObem: '',
    kanalps: '',
  })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  const cont = contractors.find(c => c.id === form.contractorId)

  function setF(patch: Partial<typeof form>) {
    const updated = { ...form, ...patch }
    if (patch.contractorId) {
      const contractor = contractors.find(c => c.id === patch.contractorId)
      updated.vodopolzvatel = contractor?.name ?? ''
    }
    setForm(updated)
  }

  async function handleGenerate() {
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/Заявление Приложение 1.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Шаблонът не може да бъде зареден')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'Заявление Приложение 1.docx')

      const tagData = {
        'ВОДОПОЛЗВАТЕЛ': form.vodopolzvatel,
        'ЗАЯВЛЕНИЕ НОМЕР': form.applicationNumber,
        'ГОДИНА': form.year,
        'ПИ НОМЕР': form.piNumber,
        'НАПОИТЕЛНА СИСТЕМА': form.irrigationSystem,
        'СЪОРАЖЕНИЕ': form.equipment,
        'ЗЕМЛИЩЕ': form.zemljishte,
        'КУЛТУРА': form.crop,
        'ДКА': form.dka,
        'НАП. НОРМА': form.napNorma,
        'ГРАВИТАЧНО': form.gravitachno,
        'ПОМПЕНО': form.pompeno,
        'БР. ПОЛИВКИ': form.brPolivki,
        'ОБЩО ДКА': form.obshtoDka,
        'ОБЩО ОБЕМ': form.obshtoObem,
        'КАНАЛПС': form.kanalps,
      }

      const blob = await fillDocxTemplate(templateFile, tagData)
      await downloadBlob(blob, `Приложение_1_Заявление_${form.vodopolzvatel || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 text-sm font-bold">📋</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Приложение 1 - Заявление</p>
            <p className="text-xs text-gray-400">Заявление за имоти и култури за напояване</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormRow label="Водоползвател" required>
            <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
              <option value="">— Избери —</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Заявление номер" required>
            <Input value={form.applicationNumber} onChange={e => setF({ applicationNumber: e.target.value })} placeholder="123" />
          </FormRow>
          <FormRow label="Година" required>
            <Input value={form.year} onChange={e => setF({ year: e.target.value })} placeholder="2026" />
          </FormRow>
          <FormRow label="ПИ Номер">
            <Input value={form.piNumber} onChange={e => setF({ piNumber: e.target.value })} placeholder="12345.678.90" />
          </FormRow>
          <FormRow label="Напоителна система">
            <Input value={form.irrigationSystem} onChange={e => setF({ irrigationSystem: e.target.value })} placeholder="НС Тунджа" />
          </FormRow>
          <FormRow label="Съоръжение">
            <Input value={form.equipment} onChange={e => setF({ equipment: e.target.value })} placeholder="Канал/ПС" />
          </FormRow>
          <FormRow label="Землище">
            <Input value={form.zemljishte} onChange={e => setF({ zemljishte: e.target.value })} placeholder="с. Асеново" />
          </FormRow>
          <FormRow label="Култура">
            <Input value={form.crop} onChange={e => setF({ crop: e.target.value })} placeholder="Царевица" />
          </FormRow>
          <FormRow label="ДКА">
            <Input value={form.dka} onChange={e => setF({ dka: e.target.value })} placeholder="100" />
          </FormRow>
          <FormRow label="Напоителна норма">
            <Input value={form.napNorma} onChange={e => setF({ napNorma: e.target.value })} placeholder="500" />
          </FormRow>
          <FormRow label="Гравитачно">
            <Input value={form.gravitachno} onChange={e => setF({ gravitachno: e.target.value })} placeholder="0" />
          </FormRow>
          <FormRow label="Помпено">
            <Input value={form.pompeno} onChange={e => setF({ pompeno: e.target.value })} placeholder="50000" />
          </FormRow>
          <FormRow label="Брой поливки">
            <Input value={form.brPolivki} onChange={e => setF({ brPolivki: e.target.value })} placeholder="3" />
          </FormRow>
          <FormRow label="Общо ДКА">
            <Input value={form.obshtoDka} onChange={e => setF({ obshtoDka: e.target.value })} placeholder="100" />
          </FormRow>
          <FormRow label="Общо обем">
            <Input value={form.obshtoObem} onChange={e => setF({ obshtoObem: e.target.value })} placeholder="150000" />
          </FormRow>
          <FormRow label="Канал/ПС">
            <Input value={form.kanalps} onChange={e => setF({ kanalps: e.target.value })} placeholder="Канал 1" />
          </FormRow>
        </div>

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleGenerate}
          disabled={filling || !form.vodopolzvatel || !form.applicationNumber}
          variant="primary"
          className="w-full mt-2"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 font-serif text-sm leading-relaxed">
          <div className="text-center mb-6">
            <p className="font-semibold text-xs">Приложение № 1 по чл.6, ал.1 и ал.2 от Общи условия</p>
          </div>

          <div className="mb-4 text-center">
            <p className="font-bold text-base mb-2">З а я в л е н и е  № {form.applicationNumber || '___'}</p>
            <p className="text-xs">з а  имоти и култури за напояване през поливен сезон {form.year} г.</p>
          </div>

          <div className="mb-4 text-xs space-y-1">
            <p>от {form.vodopolzvatel || '___________'} /Водоползвател/</p>
            <p>ПИ№ {form.piNumber || '___________'}</p>
            <p>НС {form.irrigationSystem || '___________'}</p>
            <p>съоръжение/{form.equipment || '___________'}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1">№</th>
                  <th className="border border-gray-300 p-1">напоителен канал, ПС</th>
                  <th className="border border-gray-300 p-1">землище</th>
                  <th className="border border-gray-300 p-1">култура</th>
                  <th className="border border-gray-300 p-1">Засети площи (дка)</th>
                  <th className="border border-gray-300 p-1">Напоителна норма (м³/дка)</th>
                  <th className="border border-gray-300 p-1" colSpan={3}>Начин на доставка (водни маси)</th>
                  <th className="border border-gray-300 p-1">поливки (брой)</th>
                </tr>
                <tr className="bg-gray-50 text-[10px]">
                  <th className="border border-gray-300 p-1" colSpan={6}></th>
                  <th className="border border-gray-300 p-1">Общо (м³)</th>
                  <th className="border border-gray-300 p-1">Гравитачно (м³)</th>
                  <th className="border border-gray-300 p-1">Помпено (м³)</th>
                  <th className="border border-gray-300 p-1"></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-1 text-center">1</td>
                  <td className="border border-gray-300 p-1">{form.kanalps || '___'}</td>
                  <td className="border border-gray-300 p-1">{form.zemljishte || '___'}</td>
                  <td className="border border-gray-300 p-1">{form.crop || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.dka || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.napNorma || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.obshtoObem || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.gravitachno || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.pompeno || '___'}</td>
                  <td className="border border-gray-300 p-1 text-center">{form.brPolivki || '___'}</td>
                </tr>
                <tr className="font-semibold bg-gray-50">
                  <td className="border border-gray-300 p-1 text-center" colSpan={4}>ОБЩО</td>
                  <td className="border border-gray-300 p-1 text-center">{form.obshtoDka || '___'}</td>
                  <td className="border border-gray-300 p-1"></td>
                  <td className="border border-gray-300 p-1 text-center">{form.obshtoObem || '___'}</td>
                  <td className="border border-gray-300 p-1"></td>
                  <td className="border border-gray-300 p-1"></td>
                  <td className="border border-gray-300 p-1"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-gray-600 italic">
            <p>Добавят се толкова редове колкото е нужно...</p>
          </div>

          <div className="mt-6 text-xs">
            <p className="mb-2">Подпис на ВОДОПОЛЗВАТЕЛЯ: ___________________</p>
          </div>

          <div className="mt-6 flex justify-between text-xs">
            <div>ДОСТАВЧИК: ___________________</div>
            <div>ВОДОПОЛЗВАТЕЛ: ___________________</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Appendix2Generator() {
  const { contractors } = useStore()
  const [form, setForm] = useState({
    vodopolzvatel: contractors[0]?.name ?? '',
    contractorId: contractors[0]?.id ?? '',
    data: new Date().toISOString().slice(0, 10),
    dogovorNomer: '',
    zemljishte: '',
    dka: '',
    nomerMasiv: '',
  })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  function setF(patch: Partial<typeof form>) {
    const updated = { ...form, ...patch }
    if (patch.contractorId) {
      const contractor = contractors.find(c => c.id === patch.contractorId)
      updated.vodopolzvatel = contractor?.name ?? ''
    }
    setForm(updated)
  }

  async function handleGenerate() {
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/Протокол замерване Приложение 2.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Шаблонът не може да бъде зареден')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'Протокол замерване Приложение 2.docx')

      const tagData = {
        ' ВОДОПОЛЗВАТЕЛ ': form.vodopolzvatel,
        'ДАТА': formatShortDate(form.data),
        'Договор №': form.dogovorNomer,
        'ЗЕМЛИЩЕ': form.zemljishte,
        'дка': form.dka,
        '№ на масив ': form.nomerMasiv,
      }

      const blob = await fillDocxTemplate(templateFile, tagData)
      await downloadBlob(blob, `Приложение_2_Протокол_${form.vodopolzvatel || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">📋</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Приложение 2 - Протокол замерване</p>
            <p className="text-xs text-gray-400">Опис-протокол за контролно замерване на площи</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormRow label="Водоползвател" required>
            <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
              <option value="">— Избери —</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Дата" required>
            <Input type="date" value={form.data} onChange={e => setF({ data: e.target.value })} />
          </FormRow>
          <FormRow label="Договор №" required>
            <Input value={form.dogovorNomer} onChange={e => setF({ dogovorNomer: e.target.value })} placeholder="123/2026" />
          </FormRow>
          <FormRow label="Землище">
            <Input value={form.zemljishte} onChange={e => setF({ zemljishte: e.target.value })} placeholder="с. Асеново" />
          </FormRow>
          <FormRow label="№ на масив">
            <Input value={form.nomerMasiv} onChange={e => setF({ nomerMasiv: e.target.value })} placeholder="1" />
          </FormRow>
          <FormRow label="Площ (дка)">
            <Input value={form.dka} onChange={e => setF({ dka: e.target.value })} placeholder="100.50" />
          </FormRow>
        </div>

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleGenerate}
          disabled={filling || !form.vodopolzvatel || !form.dogovorNomer}
          variant="primary"
          className="w-full mt-2"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 font-serif text-sm leading-relaxed">
          <div className="text-center mb-6">
            <p className="font-semibold text-xs">Приложение 2 по чл.9 ал.1 от Общи Условия</p>
          </div>

          <div className="text-center mb-6">
            <p className="font-bold text-base">ОПИС-ПРОТОКОЛ</p>
            <p className="text-xs mt-1">За</p>
            <p className="text-xs">Контролно замерване на действително засетите площи през поливен сезон 2026 г.</p>
          </div>

          <div className="text-xs space-y-3 mb-6">
            <p>Днес {formatShortDate(form.data)}г. между страните:</p>

            <div className="ml-4 space-y-1">
              <p>1. ДОСТАВЧИК: „НАПОИТЕЛНИ СИСТЕМИ" ЕАД – КЛОН „Средна Тунджа"</p>
              <p>2. ВОДОПОЛЗВАТЕЛ: {form.vodopolzvatel || '___________'}</p>
            </div>

            <p>Представлявани от писмено упълномощени представители:</p>
            <div className="ml-4 space-y-1">
              <p>- За Доставчик: инж. Николай Касидов</p>
              <p>- За Водоползвател {form.vodopolzvatel || '___________'},</p>
            </div>

            <p>Се състави настоящият протокол за извършено замерване на засетите площи от ВОДОПОЛЗВАТЕЛЯ съгласно Договор № {form.dogovorNomer || '___________'}, при което се установиха следните поливни площи:</p>
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2">№ по ред</th>
                  <th className="border border-gray-300 p-2">Землище</th>
                  <th className="border border-gray-300 p-2">№ на масив по карта /КАИС подложка/</th>
                  <th className="border border-gray-300 p-2">Действително замерени декари</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2 text-center">1.</td>
                  <td className="border border-gray-300 p-2">{form.zemljishte || '___'}</td>
                  <td className="border border-gray-300 p-2 text-center">{form.nomerMasiv || '___'}</td>
                  <td className="border border-gray-300 p-2 text-center">{form.dka || '___'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 text-center">2.</td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 text-center">3.</td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-xs mb-6">
            <p className="italic">Приложение: Картов материал/Извадка КАИС/Скица, или съответно</p>
          </div>

          <div className="flex justify-between text-xs mt-8">
            <div className="font-semibold">ДОСТАВЧИК: ___________________</div>
            <div className="font-semibold">ВОДОПОЛЗВАТЕЛ: ___________________</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Appendix3Generator() {
  const { contractors, acts, crops: allCrops, irrigationMethods, contracts } = useStore()
  const [form, setForm] = useState({
    vodopolzvatel: contractors[0]?.name ?? '',
    contractorId: contractors[0]?.id ?? '',
    contractNumber: '',
    contractId: '',
    data: new Date().toISOString().slice(0, 10),
  })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  // Договорите за избрания водоползвател
  const contractorContracts = contracts.filter(c => c.contractorId === form.contractorId)

  function setF(patch: Partial<typeof form>) {
    const updated = { ...form, ...patch }
    if (patch.contractorId) {
      const contractor = contractors.find(c => c.id === patch.contractorId)
      if (contractor) {
        updated.vodopolzvatel = contractor.name
      }
      // Намираме договорите за този водоползвател
      const availableContracts = contracts.filter(c => c.contractorId === patch.contractorId)

      // Ако има точно един договор - автоматично го попълваме
      if (availableContracts.length === 1) {
        const contract = availableContracts[0]
        updated.contractNumber = `${contract.number}/${contract.date}`
        updated.contractId = contract.id
      } else {
        // Ако има повече от един или няма - изчистваме полето
        updated.contractNumber = ''
        updated.contractId = ''
      }
    }
    // Ако е избран конкретен договор от dropdown
    if (patch.contractId) {
      const contract = contracts.find(c => c.id === patch.contractId)
      if (contract) {
        updated.contractNumber = `${contract.number}/${contract.date}`
      }
    }
    setForm(updated)
  }

  // Филтрираме актовете за избрания контрагент (и по договор ако е избран)
  const contractorActs = acts.filter(act => {
    if (act.contractorId !== form.contractorId) return false
    // Ако има избран конкретен договор, филтрираме само актовете от този договор
    if (form.contractId) {
      const selectedContract = contracts.find(c => c.id === form.contractId)
      if (!selectedContract) return false
      // Актът принадлежи на договора ако имат същите параметри:
      // ХТУ, култура, начин на напояване И площ
      return act.htuId === selectedContract.htuId &&
             act.cropId === selectedContract.cropId &&
             act.irrigationMethodId === selectedContract.irrigationMethodId &&
             act.area === selectedContract.area
    }
    return true
  })

  // Групираме актовете по месеци (8 месеца: Април-Ноември)
  const actsByMonth = {
    'Април': contractorActs.filter(a => a.month === 'Април'),
    'Май': contractorActs.filter(a => a.month === 'Май'),
    'Юни': contractorActs.filter(a => a.month === 'Юни'),
    'Юли': contractorActs.filter(a => a.month === 'Юли'),
    'Август': contractorActs.filter(a => a.month === 'Август'),
    'Септември': contractorActs.filter(a => a.month === 'Септември'),
    'Октомври': contractorActs.filter(a => a.month === 'Октомври'),
    'Ноември': contractorActs.filter(a => a.month === 'Ноември'),
  }

  // Изчисляване на общи суми
  const calculateTotals = () => {
    let totalDeclaredGravity = 0
    let totalDeclaredPumped = 0
    let totalActualGravity = 0
    let totalActualPumped = 0
    let totalIrrigations = 0
    let totalPaid = 0

    contractorActs.forEach(act => {
      const method = irrigationMethods.find(m => m.id === act.irrigationMethodId)
      const isGravity = method?.name?.toLowerCase().includes('гравитачно') || false
      if (isGravity) {
        totalDeclaredGravity += act.waterCubic
        totalActualGravity += act.waterCubic
      } else {
        totalDeclaredPumped += act.waterCubic
        totalActualPumped += act.waterCubic
      }
      totalIrrigations += 1
      totalPaid += act.value
    })

    // Добавяме 20% ДДС към заплатената сума
    const totalPaidWithVAT = totalPaid * 1.20

    return {
      totalDeclaredGravity,
      totalDeclaredPumped,
      totalActualGravity,
      totalActualPumped,
      totalIrrigations,
      totalPaid: totalPaidWithVAT,
      totalDifference: 0, // Заявен = Доставен в този случай
      priceDifference: 0 // За доплащане/възстановяване
    }
  }

  const totals = calculateTotals()

  async function handleGenerate() {
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/Рекапитулация Приложение 3.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Не може да се зареди шаблонът')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'Приложение 3.docx')

      // Попълваме плейсхолдърите (двата варианта - с интервали и без)
      const tagData: any = {
        // Дата
        '{ДАТА}': formatShortDate(form.data),
        '{ ДАТА }': formatShortDate(form.data),
        // Водоползвател
        '{ВОДОПОЛЗВАТЕЛ}': form.vodopolzvatel,
        '{ ВОДОПОЛЗВАТЕЛ }': form.vodopolzvatel,
        // Договор
        '{Договор №}': form.contractNumber,
        '{ Договор № }': form.contractNumber,
        // Таблица 1 - Масиви
        '{ЗЕМЛИЩЕ}': contractorActs[0]?.village || '',
        '{ ЗЕМЛИЩЕ }': contractorActs[0]?.village || '',
        '{№ на масив }': '1',
        '{ № на масив }': '1',
        '{дка}': contractorActs[0]?.area ? num(contractorActs[0].area, 2) : '',
        '{ дка }': contractorActs[0]?.area ? num(contractorActs[0].area, 2) : '',
        // Общи суми
        '{ЗАЯВЕН ОБЕМ ОБЩО ГР.}': num(totals.totalDeclaredGravity, 0),
        '{ ЗАЯВЕН ОБЕМ ОБЩО ГР. }': num(totals.totalDeclaredGravity, 0),
        '{ЗАЯВЕН ОБЕМ ОБЩО ПОМПЕНО}': num(totals.totalDeclaredPumped, 0),
        '{ ЗАЯВЕН ОБЕМ ОБЩО ПОМПЕНО }': num(totals.totalDeclaredPumped, 0),
        '{Доставен обем вода гравитачно}': num(totals.totalActualGravity, 0),
        '{ Доставен обем вода гравитачно }': num(totals.totalActualGravity, 0),
        '{Доставен обем вода помпено}': num(totals.totalActualPumped, 0),
        '{ Доставен обем вода помпено }': num(totals.totalActualPumped, 0),
        '{Разлика}': num(totals.totalDifference, 0),
        '{ Разлика }': num(totals.totalDifference, 0),
        '{Цена по Заповед}': form.vodopolzvatel ? '0.0128' : '',
        '{ Цена по Заповед }': form.vodopolzvatel ? '0.0128' : '',
        '{Заплатена сума}': num(totals.totalPaid, 2),
        '{ Заплатена сума }': num(totals.totalPaid, 2),
        '{Разлика за доплащане/за възстановяване}': num(totals.priceDifference, 2),
        '{ Разлика за доплащане/за възстановяване }': num(totals.priceDifference, 2),
        '{БРОЙ ПОЛИВКИОБЩО}': totals.totalIrrigations.toString(),
        '{ БРОЙ ПОЛИВКИОБЩО }': totals.totalIrrigations.toString(),
      }

      // Добавяме плейсхолдъри за 8-те месечни таблици
      // Първо попълваме общите (без индекс) с данни от първия месец с актове
      const firstMonthWithActs = Object.entries(actsByMonth).find(([_, acts]) => acts.length > 0)
      if (firstMonthWithActs) {
        const [_, monthActs] = firstMonthWithActs
        const act = monthActs[0]
        const crop = act ? allCrops.find(c => c.id === act.cropId) : null
        const method = act ? irrigationMethods.find(m => m.id === act.irrigationMethodId) : null
        const isGravity = method?.name?.toLowerCase().includes('гравитачно') || false

        tagData[`{ЗЕМЛИЩЕ}`] = act?.village || ''
        tagData[`{дка}`] = act?.area ? num(act.area, 2) : ''
        tagData[`{КУЛТУРА}`] = crop?.name || ''
        tagData[`{ПОЛ НОРМА}`] = act?.cubicPerDka ? num(act.cubicPerDka, 0) : ''
        tagData[`{ЗАЯВЕН ОБЕМ ГР.}`] = isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{ЗАЯВЕН ОБЕМ ПОМПЕНО}`] = !isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{БР. ПОЛИВКИ}`] = monthActs.length.toString()
        tagData[`{АКТУВАН ОБЕМ ГР.}`] = isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{АКТУВАН ОБЕМ ПОМПЕНО}`] = !isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{РАЗЛИКА}`] = '0'
      }

      // След това попълваме с индекси за всеки месец (ако шаблонът ги очаква)
      Object.entries(actsByMonth).forEach(([month, monthActs], index) => {
        const tableIndex = index + 1 // 1-based index
        const act = monthActs[0] // Вземаме първия акт за месеца
        const crop = act ? allCrops.find(c => c.id === act.cropId) : null
        const method = act ? irrigationMethods.find(m => m.id === act.irrigationMethodId) : null
        const isGravity = method?.name?.toLowerCase().includes('гравитачно') || false

        tagData[`{ЗЕМЛИЩЕ_${tableIndex}}`] = act?.village || ''
        tagData[`{дка_${tableIndex}}`] = act?.area ? num(act.area, 2) : ''
        tagData[`{КУЛТУРА_${tableIndex}}`] = crop?.name || ''
        tagData[`{ПОЛ НОРМА_${tableIndex}}`] = act?.cubicPerDka ? num(act.cubicPerDka, 0) : ''
        tagData[`{ЗАЯВЕН ОБЕМ ГР._${tableIndex}}`] = isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{ЗАЯВЕН ОБЕМ ПОМПЕНО_${tableIndex}}`] = !isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{БР. ПОЛИВКИ_${tableIndex}}`] = monthActs.length.toString()
        tagData[`{АКТУВАН ОБЕМ ГР._${tableIndex}}`] = isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{АКТУВАН ОБЕМ ПОМПЕНО_${tableIndex}}`] = !isGravity && act ? num(act.waterCubic, 0) : ''
        tagData[`{РАЗЛИКА_${tableIndex}}`] = '0'
      })

      console.log('Appendix3 tagData:', tagData)
      const blob = await fillDocxTemplate(templateFile, tagData)
      await downloadBlob(blob, `Приложение_3_Рекапитулация_${form.vodopolzvatel || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">📊</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Приложение 3 - Рекапитулация</p>
            <p className="text-xs text-gray-400">Констативен протокол за водни обеми</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormRow label="Водоползвател" required>
            <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
              <option value="">— Избери —</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>

          {/* Ако има повече от 1 договор - показваме dropdown */}
          {contractorContracts.length > 1 && (
            <FormRow label="Избери договор" required>
              <Select value={form.contractId} onChange={e => setF({ contractId: e.target.value })}>
                <option value="">— Избери договор —</option>
                {contractorContracts.map(c => (
                  <option key={c.id} value={c.id}>
                    Договор № {c.number} от {c.date}
                  </option>
                ))}
              </Select>
            </FormRow>
          )}

          <FormRow label="Договор №" required>
            <Input
              value={form.contractNumber}
              onChange={e => setF({ contractNumber: e.target.value })}
              placeholder="123/2026"
              readOnly={contractorContracts.length === 1}
              className={contractorContracts.length === 1 ? 'bg-gray-100 cursor-not-allowed' : ''}
            />
          </FormRow>

          {/* Информация за договорите */}
          {form.contractorId && (
            <div className="text-xs">
              {contractorContracts.length === 0 && (
                <p className="text-orange-600">⚠️ Няма намерени договори за този водоползвател</p>
              )}
              {contractorContracts.length === 1 && (
                <p className="text-green-600">✓ Договорът е попълнен автоматично</p>
              )}
              {contractorContracts.length > 1 && (
                <p className="text-blue-600">ℹ️ Намерени {contractorContracts.length} договора - изберете от списъка</p>
              )}
            </div>
          )}

          <FormRow label="Дата">
            <Input type="date" value={form.data} onChange={e => setF({ data: e.target.value })} />
          </FormRow>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <p className="font-semibold mb-1 text-blue-800">📋 Налични актове: {contractorActs.length}</p>
          <div className="space-y-1 text-blue-700">
            {Object.entries(actsByMonth).map(([month, monthActs]) => (
              <p key={month}>
                {month}: <strong>{monthActs.length}</strong> акта
              </p>
            ))}
          </div>
        </div>

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleGenerate}
          disabled={filling || !form.vodopolzvatel || !form.contractNumber}
          variant="primary"
          className="w-full mt-2"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 font-serif text-xs leading-relaxed">
          <div className="text-center mb-4">
            <p className="font-bold text-[11px]">Приложение 3 по чл.8, ал.6 от Общите условия</p>
            <p className="font-bold text-sm mt-2">Констативен Протокол</p>
            <p className="text-[11px]">за действително доставен обем вода през поливен сезон 2026г.</p>
          </div>

          <div className="space-y-1 mb-4 text-[10px]">
            <p className="indent-8">Днес {formatShortDate(form.data)} г. между страните:</p>
            <p>ДОСТАВЧИК: „НАПОИТЕЛНИ СИСТЕМИ" ЕАД – КЛОН „Средна Тунджа"</p>
            <p>ВОДОПОЛЗВАТЕЛ: {form.vodopolzvatel || '___________'}</p>
            <p>Представлявани от писмено упълномощени представители:</p>
            <p>За Доставчик: инж. Николай Касидов</p>
            <p>За Водоползвател {form.vodopolzvatel || '___________'},</p>
            <p className="mt-1">
              се състави настоящият протокол за действително доставен обем вода през поливен сезон 2026г. за напояване на засетите площи от ВОДОПОЛЗВАТЕЛЯ съгласно Договор № {form.contractNumber || '___________'}, при което се установиха следните доставени водни обеми:
            </p>
            <p className="mt-1">Замерени площи по Договор № {form.contractNumber || '___________'},</p>
          </div>

          {/* Таблица 1: Замерени площи */}
          <table className="w-full border-collapse border border-gray-400 text-[9px] mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-1 w-12">№ по ред</th>
                <th className="border border-gray-400 p-1">Землище</th>
                <th className="border border-gray-400 p-1">№ на масив по карта /КАИС подложка/</th>
                <th className="border border-gray-400 p-1">Действително замерени декари</th>
              </tr>
            </thead>
            <tbody>
              {contractorActs.slice(0, 3).map((act, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-400 p-1 text-center">{idx + 1}</td>
                  <td className="border border-gray-400 p-1">{act.village}</td>
                  <td className="border border-gray-400 p-1 text-center">1</td>
                  <td className="border border-gray-400 p-1 text-right">{num(act.area, 2)}</td>
                </tr>
              ))}
              {contractorActs.length === 0 && (
                <tr>
                  <td className="border border-gray-400 p-1 text-center">1</td>
                  <td className="border border-gray-400 p-1">___________</td>
                  <td className="border border-gray-400 p-1 text-center">1</td>
                  <td className="border border-gray-400 p-1 text-right">___</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Месечни таблици */}
          {Object.entries(actsByMonth).map(([month, monthActs], monthIndex) => {
            if (monthActs.length === 0) return null

            const monthNames: { [key: string]: string } = {
              'Април': 'IV', 'Май': 'V', 'Юни': 'VI', 'Юли': 'VII',
              'Август': 'VIII', 'Септември': 'IX', 'Октомври': 'X', 'Ноември': 'XI'
            }

            return (
              <div key={month} className="mb-4">
                <p className="font-bold text-[9px] mb-1">Заявени и доставени водни обеми през месец {monthNames[month]}</p>
                <table className="w-full border-collapse border border-gray-400 text-[8px]">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 p-0.5" rowSpan={2}>Землище</th>
                      <th className="border border-gray-400 p-0.5">Площи за напояване</th>
                      <th className="border border-gray-400 p-0.5" rowSpan={2}>култури</th>
                      <th className="border border-gray-400 p-0.5">Поливна норма</th>
                      <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>гравитачно</th>
                      <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>помпено</th>
                      <th className="border border-gray-400 p-0.5">поливки</th>
                      <th className="border border-gray-400 p-0.5">Доставен обем вода гравитачно</th>
                      <th className="border border-gray-400 p-0.5">Доставен обем вода помпено</th>
                      <th className="border border-gray-400 p-0.5">Разлика</th>
                    </tr>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 p-0.5">/дка/</th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup> / дка</th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                      <th className="border border-gray-400 p-0.5">брой</th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                      <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthActs.map((act, idx) => {
                      const crop = allCrops.find(c => c.id === act.cropId)
                      const method = irrigationMethods.find(m => m.id === act.irrigationMethodId)

                      return (
                        <tr key={idx}>
                          <td className="border border-gray-400 p-0.5">{act.village}</td>
                          <td className="border border-gray-400 p-0.5 text-right">{num(act.area, 2)}</td>
                          <td className="border border-gray-400 p-0.5">{crop?.name || ''}</td>
                          <td className="border border-gray-400 p-0.5 text-right">{num(act.cubicPerDka, 0)}</td>
                          <td className="border border-gray-400 p-0.5 text-right">{method?.name === 'Гравитачно' ? num(act.waterCubic, 0) : ''}</td>
                          <td className="border border-gray-400 p-0.5 text-right">{method?.name === 'Помпено' ? num(act.waterCubic, 0) : ''}</td>
                          <td className="border border-gray-400 p-0.5 text-center">1</td>
                          <td className="border border-gray-400 p-0.5 text-right">{method?.name === 'Гравитачно' ? num(act.waterCubic, 0) : ''}</td>
                          <td className="border border-gray-400 p-0.5 text-right">{method?.name === 'Помпено' ? num(act.waterCubic, 0) : ''}</td>
                          <td className="border border-gray-400 p-0.5 text-right">0</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* Сумарна таблица за целия поливен сезон */}
          {contractorActs.length > 0 && (
            <div className="mb-4">
              <p className="font-bold text-[9px] mb-1">Заявени и доставени водни обеми общо за поливен сезон</p>
              <table className="w-full border-collapse border border-gray-400 text-[8px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 p-0.5" rowSpan={2}>Землище</th>
                    <th className="border border-gray-400 p-0.5">Площи за напояване</th>
                    <th className="border border-gray-400 p-0.5" rowSpan={2}>култури</th>
                    <th className="border border-gray-400 p-0.5">Поливна норма</th>
                    <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>гравитачно</th>
                    <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>помпено</th>
                    <th className="border border-gray-400 p-0.5">поливки</th>
                    <th className="border border-gray-400 p-0.5">Доставен обем вода гравитачно</th>
                    <th className="border border-gray-400 p-0.5">Доставен обем вода помпено</th>
                    <th className="border border-gray-400 p-0.5">Разлика</th>
                  </tr>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 p-0.5">/дка/</th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup> / дка</th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">брой</th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold">
                    <td className="border border-gray-400 p-0.5">{contractorActs[0]?.village || ''}</td>
                    <td className="border border-gray-400 p-0.5 text-right">{contractorActs[0]?.area ? num(contractorActs[0].area, 2) : ''}</td>
                    <td className="border border-gray-400 p-0.5">Всички</td>
                    <td className="border border-gray-400 p-0.5 text-right">-</td>
                    <td className="border border-gray-400 p-0.5 text-right">{num(totals.totalDeclaredGravity, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right">{num(totals.totalDeclaredPumped, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-center">{totals.totalIrrigations}</td>
                    <td className="border border-gray-400 p-0.5 text-right">{num(totals.totalActualGravity, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right">{num(totals.totalActualPumped, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right">{num(totals.totalDifference, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Обобщена финансова таблица */}
          {contractorActs.length > 0 && (
            <div className="mt-6">
              <p className="font-bold text-[9px] mb-1">ОБЩО ПО ДОГОВОР</p>
              <table className="w-full border-collapse border border-gray-400 text-[8px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>гравитачно</th>
                    <th className="border border-gray-400 p-0.5">Заявен обем вода<br/>помпено</th>
                    <th className="border border-gray-400 p-0.5">Извършени<br/>поливки</th>
                    <th className="border border-gray-400 p-0.5">Доставен обем вода гравитачно</th>
                    <th className="border border-gray-400 p-0.5">Доставен обем вода помпено</th>
                    <th className="border border-gray-400 p-0.5">Разлика</th>
                    <th className="border border-gray-400 p-0.5">Цена по Заповед</th>
                    <th className="border border-gray-400 p-0.5">Заплатена сума</th>
                    <th className="border border-gray-400 p-0.5">Разлика за доплащане/за възстановяване</th>
                  </tr>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">брой</th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">м<sup>3</sup></th>
                    <th className="border border-gray-400 p-0.5">€</th>
                    <th className="border border-gray-400 p-0.5">€</th>
                    <th className="border border-gray-400 p-0.5">€</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.totalDeclaredGravity, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.totalDeclaredPumped, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-center font-bold">{totals.totalIrrigations}</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.totalActualGravity, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.totalActualPumped, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.totalDifference, 0)}</td>
                    <td className="border border-gray-400 p-0.5 text-right">0.0128</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold text-green-700">{num(totals.totalPaid, 2)}</td>
                    <td className="border border-gray-400 p-0.5 text-right font-bold">{num(totals.priceDifference, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] mt-6 font-bold">ДОСТАВЧИК……………………</p>
        </div>
      </div>
    </div>
  )
}

function Appendix4Generator() {
  const { contractors } = useStore()
  const [form, setForm] = useState({
    vodopolzvatel: contractors[0]?.name ?? '',
    contractorId: contractors[0]?.id ?? '',
    bulstat: contractors[0]?.bulstat ?? '',
    address: contractors[0]?.address ?? '',
    phone: contractors[0]?.phone ?? '',
    representative: contractors[0]?.contact ?? '',
    contractNumber: '',
    piNumber: '',
    htu: '',
    irrigationSystem: '',
    equipment: '',
    irrigationNumber: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    waterMeasurementMethod: '',
    price: '0.0128', // Цена по подразбиране
    crops: [{
      crop: '',
      area: '',
      irrigationNorm: '',
      gravitational: '',
      pumped: '',
      calculatedAmount: 0
    }] as Array<{
      crop: string;
      area: string;
      irrigationNorm: string;
      gravitational: string;
      pumped: string;
      calculatedAmount: number;
    }>,
  })
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')

  function setF(patch: Partial<typeof form>) {
    const updated = { ...form, ...patch }
    if (patch.contractorId) {
      const contractor = contractors.find(c => c.id === patch.contractorId)
      if (contractor) {
        updated.vodopolzvatel = contractor.name
        updated.bulstat = contractor.bulstat
        updated.address = contractor.address
        updated.phone = contractor.phone ?? ''
        updated.representative = contractor.contact ?? ''
      }
    }
    setForm(updated)
  }

  function addCrop() {
    setForm({
      ...form,
      crops: [...form.crops, {
        crop: '',
        area: '',
        irrigationNorm: '',
        gravitational: '',
        pumped: '',
        calculatedAmount: 0
      }]
    })
  }

  function removeCrop(index: number) {
    const newCrops = form.crops.filter((_, i) => i !== index)
    setForm({ ...form, crops: newCrops })
  }

  function updateCrop(index: number, field: 'crop' | 'area' | 'irrigationNorm' | 'gravitational' | 'pumped', value: string) {
    const newCrops = [...form.crops]
    newCrops[index] = { ...newCrops[index], [field]: value }

    // Автоматично изчисление: дка * поливна норма * цена * 1.20 (20% ДДС)
    if (field === 'area' || field === 'irrigationNorm') {
      const area = parseFloat(field === 'area' ? value : newCrops[index].area) || 0
      const norm = parseFloat(field === 'irrigationNorm' ? value : newCrops[index].irrigationNorm) || 0
      const price = parseFloat(form.price) || 0
      newCrops[index].calculatedAmount = area * norm * price * 1.20 // +20% ДДС
    }

    setForm({ ...form, crops: newCrops })
  }

  // Функция за обновяване на цената
  function updatePrice(newPrice: string) {
    const price = parseFloat(newPrice) || 0
    const updatedCrops = form.crops.map(crop => ({
      ...crop,
      calculatedAmount: (parseFloat(crop.area) || 0) * (parseFloat(crop.irrigationNorm) || 0) * price * 1.20
    }))
    setForm({ ...form, price: newPrice, crops: updatedCrops })
  }

  async function handleGenerate() {
    setFilling(true)
    setFillError('')
    try {
      const templatePath = 'templates/Напояване шаблони/Заявка Приложение 4.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error('Не може да се зареди шаблонът')
      const arrayBuffer = await response.arrayBuffer()
      const templateFile = new File([arrayBuffer], 'Приложение 4.docx')

      const tagData = {
        '{ ВОДОПОЛЗВАТЕЛ }': form.vodopolzvatel,
        '{ПОЛИВКА НОМЕР}': form.irrigationNumber,
        '{Договор №}': form.contractNumber || '________',
        '{ХТУ}': form.htu || '________',
        '{ПИ}': form.piNumber || '________',
        '{НАП. СИСТЕМА}': form.irrigationSystem || '________',
        '{СЪОРАЖЕНИЕ}': form.equipment || '________',
        '{ПОЛИВКА НОМ}': form.irrigationNumber,
        '{OT}': formatShortDate(form.startDate), // Paragraph - Latin O
        '{ДО}': form.endDate ? formatShortDate(form.endDate) : '________',
        '{ОТ}': formatShortDate(form.startDate), // Table - Cyrillic О
        '{ Начин на отчитане на в. маси }': form.waterMeasurementMethod || '________',
        '{ЦЕНА}': form.price || '0.0128',
        // Култура 1
        '{КУЛТУРА}': form.crops[0]?.crop || '______',
        '{ДКА}': form.crops[0]?.area || '___',
        '{ПОЛ НОРМА}': form.crops[0]?.irrigationNorm || '___',
        '{ГРАВИТАЧНО}': form.crops[0]?.gravitational || '',
        '{ПОМПЕНО}': form.crops[0]?.pumped || '',
        '{АВТОМАТИЧНО ИЗЧИСЛЕНИЕ}': num(form.crops[0]?.calculatedAmount || 0, 2),
        // Култура 2
        '{КУЛТУРА2}': form.crops[1]?.crop || '______',
        // Култура 3
        '{КУЛТУРА 3}': form.crops[2]?.crop || '______',
      }

      const blob = await fillDocxTemplate(templateFile, tagData)
      await downloadBlob(blob, `Приложение_4_Заявка_${form.irrigationNumber || 'проект'}.docx`)
    } catch (err) {
      setFillError(docxFillErrorMessage(err))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">📝</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Приложение 4 - Заявка</p>
            <p className="text-xs text-gray-400">Заявка за напояване</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormRow label="Водоползвател" required>
            <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
              <option value="">— Избери —</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormRow>
          <FormRow label="Договор №" required>
            <Input value={form.contractNumber} onChange={e => setF({ contractNumber: e.target.value })} placeholder="123/2026" />
          </FormRow>
          <FormRow label="ПИ №" required>
            <Input value={form.piNumber} onChange={e => setF({ piNumber: e.target.value })} placeholder="12345.678.90" />
          </FormRow>
          <FormRow label="ХТУ" required>
            <Input value={form.htu} onChange={e => setF({ htu: e.target.value })} placeholder="ХТУ Ямбол" />
          </FormRow>
          <FormRow label="НС (Напоителна система)" required>
            <Input value={form.irrigationSystem} onChange={e => setF({ irrigationSystem: e.target.value })} placeholder="Тунджа" />
          </FormRow>
          <FormRow label="Съоръжение" required>
            <Input value={form.equipment} onChange={e => setF({ equipment: e.target.value })} placeholder="Канал К-1" />
          </FormRow>
          <FormRow label="Номер на поливка" required>
            <Input value={form.irrigationNumber} onChange={e => setF({ irrigationNumber: e.target.value })} placeholder="1" />
          </FormRow>
          <FormRow label="Начална дата" required>
            <Input type="date" value={form.startDate} onChange={e => setF({ startDate: e.target.value })} />
          </FormRow>
          <FormRow label="Крайна дата">
            <Input type="date" value={form.endDate} onChange={e => setF({ endDate: e.target.value })} />
          </FormRow>
          <FormRow label="Начин на отчитане на в. маси" required>
            <Input value={form.waterMeasurementMethod} onChange={e => setF({ waterMeasurementMethod: e.target.value })} placeholder="Водомер" />
          </FormRow>
          <FormRow label="Цена (€)" required>
            <Input value={form.price} onChange={e => updatePrice(e.target.value)} placeholder="0.0128" />
          </FormRow>
        </div>

        {/* Култури секция */}
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Култури</p>
            <button
              type="button"
              onClick={addCrop}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg transition-colors"
            >
              + Добави култура
            </button>
          </div>

          {form.crops.map((cropItem, index) => (
            <div key={index} className="bg-white rounded-lg p-3 mb-2 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">Култура {index + 1}</p>
                {form.crops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCrop(index)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    ✕ Премахни
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <FormRow label="Култура">
                    <Input
                      value={cropItem.crop}
                      onChange={e => updateCrop(index, 'crop', e.target.value)}
                      placeholder="Царевица"
                    />
                  </FormRow>
                  <FormRow label="Площ (дка)">
                    <Input
                      value={cropItem.area}
                      onChange={e => updateCrop(index, 'area', e.target.value)}
                      placeholder="100"
                    />
                  </FormRow>
                  <FormRow label="Норма (м³)">
                    <Input
                      value={cropItem.irrigationNorm}
                      onChange={e => updateCrop(index, 'irrigationNorm', e.target.value)}
                      placeholder="300"
                    />
                  </FormRow>
                </div>

                {/* Начин на водоподаване */}
                <div className="grid grid-cols-2 gap-2">
                  <FormRow label="Гравитачно">
                    <Input
                      value={cropItem.gravitational as string}
                      onChange={e => updateCrop(index, 'gravitational', e.target.value)}
                      placeholder="Капково"
                    />
                  </FormRow>
                  <FormRow label="Помпено">
                    <Input
                      value={cropItem.pumped as string}
                      onChange={e => updateCrop(index, 'pumped', e.target.value)}
                      placeholder="Помпа"
                    />
                  </FormRow>
                </div>

                {/* Автоматично изчисление */}
                <div className="bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700 font-medium">Дължима сума с ДДС:</span>
                    <span className="text-sm font-bold text-green-800">{num(cropItem.calculatedAmount, 2)} €</span>
                  </div>
                  <p className="text-[10px] text-green-600 mt-0.5">
                    {cropItem.area} дка × {cropItem.irrigationNorm} м³ × {form.price} € × 1.20
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {fillError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {fillError}
          </div>
        )}

        <Btn
          onClick={handleGenerate}
          disabled={filling || !form.vodopolzvatel || !form.contractNumber || !form.piNumber || !form.htu || !form.irrigationSystem || !form.equipment || !form.irrigationNumber}
          variant="primary"
          className="w-full mt-2"
        >
          {filling ? 'Генериране...' : '📥 Генерирай и изтегли'}
        </Btn>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 font-serif text-xs leading-relaxed">
          {/* Header - Right aligned */}
          <p className="text-right font-bold mb-4">Приложение № 4 по чл.12 от Общите условия</p>

          {/* Title - Center aligned */}
          <p className="text-center font-bold text-sm mb-1">ЗАЯВКА   ЗА ПОЛИВКА №  {form.irrigationNumber || '___'}</p>
          <p className="mb-3"></p>

          {/* Subtitle - Justified, Bold */}
          <p className="font-bold mb-3">Към Договор за доставка на вода за напояване №  {form.contractNumber || '________'}</p>
          <p className="mb-3"></p>

          {/* Supplier & Client Info */}
          <p className="mb-1">ДОСТАВЧИК: клон " Средна Тунджа", ХТР/ХТУ: ЯМБОЛ/{form.htu || '________'}</p>
          <p className="mb-3">ВОДОПОЛЗВАТЕЛ: {form.vodopolzvatel || '___________'}</p>
          <p className="mb-3"></p>

          {/* Introduction */}
          <p className="text-justify mb-3">
            Доставчикът се задължава да достави вода за напояване за имоти и по култури,
            заявени от Водоползвателя, както следва:
          </p>
          <p className="mb-3"></p>

          {/* Property & System Info */}
          <p className="font-bold mb-1">
            ПИ№ {form.piNumber || '________'} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; НС  {form.irrigationSystem || '________'}
          </p>
          <p className="font-bold text-justify mb-1">съоръжение/{form.equipment || '________'}, поливка № {form.irrigationNumber || '___'}</p>
          <p className="font-bold text-justify mb-3">
            за времето от {formatShortDate(form.startDate)} до {form.endDate ? formatShortDate(form.endDate) : '________'} 2026 г. желая да ми бъде доставена вода, както следва:
          </p>
          <p className="mb-2"></p>

          {/* Table */}
          <table className="w-full border-collapse border border-gray-400 text-[10px] mb-3">
            {/* Header Row 0 */}
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>КУЛТУРИ</th>
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>Площ</th>
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>Поливна норма</th>
                <th className="border border-gray-400 p-1 text-center" rowSpan={4}>поливка</th>
                <th className="border border-gray-400 p-1 text-center" colSpan={4}>времетраене  на  поливането</th>
                <th className="border border-gray-400 p-1 text-center" colSpan={2} rowSpan={3}>Начин на водопод.</th>
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>Начин на отчитане на в. маси</th>
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>Цена по Заповед</th>
                <th className="border border-gray-400 p-1 text-left" rowSpan={4}>Дължима сума, с ДДС</th>
              </tr>
              {/* Header Row 1 */}
              <tr className="bg-gray-50">
                <th className="border border-gray-400 p-1 text-left" colSpan={2}>Начало</th>
                <th className="border border-gray-400 p-1 text-left" colSpan={2}>Край</th>
              </tr>
              {/* Header Row 2 */}
              <tr className="bg-gray-50">
                <th className="border border-gray-400 p-1 text-left">дата</th>
                <th className="border border-gray-400 p-1 text-left">час</th>
                <th className="border border-gray-400 p-1 text-left">дата</th>
                <th className="border border-gray-400 p-1 text-left">час</th>
              </tr>
              {/* Header Row 3 - Column Numbers */}
              <tr className="bg-gray-50">
                <th className="border border-gray-400 p-1 text-center">Гравитачно</th>
                <th className="border border-gray-400 p-1 text-center">Помпено</th>
              </tr>
              {/* Header Row 4 - Units */}
              <tr className="bg-gray-100 font-normal">
                <td className="border border-gray-400 p-1 text-center">1</td>
                <td className="border border-gray-400 p-1 text-center">2</td>
                <td className="border border-gray-400 p-1 text-center">3</td>
                <td className="border border-gray-400 p-1 text-center">4</td>
                <td className="border border-gray-400 p-1 text-center">5</td>
                <td className="border border-gray-400 p-1 text-center">6</td>
                <td className="border border-gray-400 p-1 text-center">7</td>
                <td className="border border-gray-400 p-1 text-center">8</td>
                <td className="border border-gray-400 p-1 text-center">9</td>
                <td className="border border-gray-400 p-1 text-center">10</td>
                <td className="border border-gray-400 p-1 text-center">11</td>
                <td className="border border-gray-400 p-1 text-center">12</td>
                <td className="border border-gray-400 p-1 text-center">13</td>
              </tr>
            </thead>
            <tbody>
              {/* Data Rows - динамични култури */}
              {form.crops.map((cropItem, index) => (
                <tr key={index}>
                  <td className="border border-gray-400 p-1">{cropItem.crop || '______'}</td>
                  <td className="border border-gray-400 p-1">{cropItem.area || '___'}</td>
                  <td className="border border-gray-400 p-1">{cropItem.irrigationNorm || '___'}</td>
                  <td className="border border-gray-400 p-1">{form.irrigationNumber || ''}</td>
                  <td className="border border-gray-400 p-1">{form.startDate ? formatShortDate(form.startDate) : '___'}</td>
                  <td className="border border-gray-400 p-1"></td>
                  <td className="border border-gray-400 p-1">{form.endDate ? formatShortDate(form.endDate) : '___'}</td>
                  <td className="border border-gray-400 p-1"></td>
                  <td className="border border-gray-400 p-1 text-[9px]">{cropItem.gravitational || ''}</td>
                  <td className="border border-gray-400 p-1 text-[9px]">{cropItem.pumped || ''}</td>
                  <td className="border border-gray-400 p-1 text-[9px]">{form.waterMeasurementMethod || ''}</td>
                  <td className="border border-gray-400 p-1 text-right">{form.price}</td>
                  <td className="border border-gray-400 p-1 text-right font-bold text-green-700">{num(cropItem.calculatedAmount, 2)} €</td>
                </tr>
              ))}
              {/* Empty Rows - само ако има по-малко от 6 */}
              {[...Array(Math.max(0, 6 - form.crops.length))].map((_, i) => (
                <tr key={`empty-${i}`}>
                  {[...Array(13)].map((_, j) => (
                    <td key={j} className="border border-gray-400 p-1 h-6"></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer Text */}
          <p className="text-justify text-[11px] mb-1">
            На основание чл. 13 от Общите условия към Договори за доставка на вода за напояване:
          </p>
          <p className="text-justify text-[11px] mb-1">
            - Доставчикът отчита доставената вода на Водоползвателя, чрез Акт дневник за напояване.
          </p>
          <p className="text-justify text-[11px] mb-3">
            - Водоползвателят, заявява, че е запознат с Общите условия към Договори за доставка на вода за
            напояване и ги приема безусловно.
          </p>

          <p className="mb-2"></p>

          {/* Signatures */}
          <p className="text-justify text-[11px]">
            Доставчик: ……………………&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Водоползвател: ………………………...
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── UDVN SECTION ──────────────────────────────────────────────────────────────

/** Converts newline characters to Word XML line breaks
 * Uses proper XML structure: close current text run, add break, start new text run
 * Also applies Times New Roman 12pt formatting and left alignment */
function textToWordXml(text: string): string {
  // Split text by newlines and rebuild with proper Word XML structure
  const lines = text.split('\n')

  if (lines.length === 1) {
    return text // No newlines, return as-is
  }

  // Build proper XML with formatting and left alignment
  // Close current paragraph, start new paragraph with left alignment
  const fontProps = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
  const paraProps = '<w:pPr><w:jc w:val="left"/></w:pPr>' // Left alignment

  return lines.join(`</w:t></w:r></w:p><w:p>${paraProps}<w:r>${fontProps}<w:t>`)
}

/** Replaces XML placeholders like {NAME} with their actual values, even if split by XML tags. */
function replacePlaceholder(xml: string, placeholder: string, value: string): string {
  // Convert newlines in value to Word XML line breaks (only for {РЕМОНТИ})
  const processedValue = placeholder === '{РЕМОНТИ}' ? textToWordXml(value) : value

  // First try simple replacement (for placeholders that aren't split)
  const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&')
  let result = xml.replace(new RegExp(escapedPlaceholder, 'g'), processedValue)

  // If the placeholder might be split across XML tags, use a more flexible pattern
  // For example: {</w:t></w:r><w:r><w:t>МЕСЕЦ</w:t></w:r><w:r><w:t>}
  // Pattern matches: \{ + (XML tags + text)* + \}
  const placeholderText = placeholder.slice(1, -1) // Remove { and }

  // This pattern allows any combination of XML tags and text between { and }
  // as long as all the placeholder characters appear in order
  const chars = placeholderText.split('')
  const xmlTagPattern = '(?:<[^>]+>)*'

  // Build flexible pattern that allows XML tags anywhere
  const flexPattern = '\\{' + xmlTagPattern +
    chars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + xmlTagPattern).join('') +
    '\\}'

  result = result.replace(new RegExp(flexPattern, 'g'), processedValue)

  return result
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
  facilityType?: string  // Тръбопровод или Канал - за всеки ремонт
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
  zemljishte?: string
  repairs: UdvnRepairItem[]
}

const EMPTY_REPAIR: UdvnRepairItem = {
  pipeline: '',
  locations: [{ unit: 'hkm', value: '' }],
  facilityType: 'Тръбопровод',
  repairType: '',
  description: '',
  materials: '',
  workersCount: '',
  excavatorTime: '',
  workers: ''
}

const EMPTY_FACILITY: UdvnFacility = {
  name: '',
  repairs: [JSON.parse(JSON.stringify(EMPTY_REPAIR))]
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
  const [submittedRepairsText, setSubmittedRepairsText] = useState('')

  function filterOutSubmittedRepairs() {
    if (!submittedRepairsText.trim()) {
      alert('Моля, въведете текст с вече подадените ремонти.')
      return
    }

    // Normalize the submitted text for comparison
    const normalizedText = submittedRepairsText.toLowerCase().trim()

    // Filter facilities: keep only those whose name is NOT mentioned in the submitted text
    const remainingFacilities = facilities.filter(facility => {
      if (!facility.name) return true // Keep empty facilities

      const facilityNameLower = facility.name.toLowerCase()

      // Check if facility name appears in the submitted text
      const isMentioned = normalizedText.includes(facilityNameLower)

      return !isMentioned // Keep only facilities NOT mentioned
    })

    if (remainingFacilities.length === 0) {
      alert('Всички съоръжения са споменати в подадените ремонти. Списъкът ще бъде изчистен.')
      setFacilities([JSON.parse(JSON.stringify(EMPTY_FACILITY))])
    } else {
      setFacilities(remainingFacilities)
      alert(`Филтрирани ${facilities.length - remainingFacilities.length} вече подадени ремонти. Остават ${remainingFacilities.length} съоръжения.`)
    }
  }

  function updateFacility(index: number, field: keyof UdvnFacility, value: any) {
    const updated = JSON.parse(JSON.stringify(facilities))
    updated[index][field] = value
    setFacilities(updated)
  }

  function addFacility() {
    setFacilities([...facilities, JSON.parse(JSON.stringify(EMPTY_FACILITY))])
  }

  function removeFacility(index: number) {
    if (facilities.length > 1) {
      setFacilities(facilities.filter((_, i) => i !== index))
    }
  }

  function addRepair(facilityIndex: number) {
    const updated = JSON.parse(JSON.stringify(facilities))
    updated[facilityIndex].repairs.push(JSON.parse(JSON.stringify(EMPTY_REPAIR)))
    setFacilities(updated)
  }

  function removeRepair(facilityIndex: number, repairIndex: number) {
    const updated = JSON.parse(JSON.stringify(facilities))
    if (updated[facilityIndex].repairs.length > 1) {
      updated[facilityIndex].repairs.splice(repairIndex, 1)
      setFacilities(updated)
    }
  }

  function updateRepair(facilityIndex: number, repairIndex: number, field: keyof UdvnRepairItem, value: any) {
    const updated = JSON.parse(JSON.stringify(facilities))
    const repair = updated[facilityIndex].repairs[repairIndex]

    // Update the field
    repair[field] = value

    // Auto-fill materials and workers when repair type changes to "Ремонт на хидрант"
    if (field === 'repairType' && value === 'Ремонт на хидрант') {
      repair.materials = '1 бр. планка с гумени уплътнения и 4 бр. болт с гайка М14/80'
      repair.workers = 'работници 3 човека – 3 часа, багер 2 часа'
      repair.excavatorTime = '2 часа'
      repair.pipeType = ''
      repair.pipeSize = ''
      repair.pipeCount = undefined
    }

    // Auto-fill materials and workers when repair type changes to "Ремонт на тръба"
    if (field === 'repairType' && value === 'Ремонт на тръба') {
      // Initialize pipe fields with defaults if not set
      repair.pipeType = repair.pipeType || 'ПВЦ'
      repair.pipeSize = repair.pipeSize || '200/10'
      repair.pipeCount = repair.pipeCount || 1

      // Auto-calculate materials with default values
      const skobi = (repair.pipeCount || 1) * 2
      repair.materials = `${repair.pipeType} тръба Ф${repair.pipeSize}, ${repair.pipeCount} бр., ${skobi} бр. аварийни скоби`
      repair.workers = 'работници 3 човека – 3 часа, багер 2 часа'
      repair.excavatorTime = '2 часа'
    }

    // Calculate materials for pipe repair when pipeType, pipeSize, or pipeCount change
    if (repair.repairType === 'Ремонт на тръба' && (field === 'pipeType' || field === 'pipeSize' || field === 'pipeCount')) {
      const pipeType = repair.pipeType || ''
      const pipeSize = repair.pipeSize || ''
      const pipeCount = repair.pipeCount || 0

      if (pipeType && pipeSize && pipeCount > 0) {
        const skobi = pipeCount * 2
        repair.materials = `${pipeType} тръба Ф${pipeSize}, ${pipeCount} бр., ${skobi} бр. аварийни скоби`
        repair.workers = 'работници 3 човека – 3 часа, багер 2 часа'
        repair.excavatorTime = '2 часа'
      }
    }

    updated[facilityIndex].repairs[repairIndex] = repair
    setFacilities(updated)
  }

  function addLocation(facilityIndex: number, repairIndex: number) {
    const updated = JSON.parse(JSON.stringify(facilities))
    updated[facilityIndex].repairs[repairIndex].locations.push({ unit: 'hkm', value: '' })
    setFacilities(updated)
  }

  function removeLocation(facilityIndex: number, repairIndex: number, locationIndex: number) {
    const updated = JSON.parse(JSON.stringify(facilities))
    if (updated[facilityIndex].repairs[repairIndex].locations.length > 1) {
      updated[facilityIndex].repairs[repairIndex].locations.splice(locationIndex, 1)
      setFacilities(updated)
    }
  }

  function updateLocation(facilityIndex: number, repairIndex: number, locationIndex: number, field: 'unit' | 'value', value: string) {
    const updated = JSON.parse(JSON.stringify(facilities))
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
      xml = replacePlaceholder(xml, '{ГОДИНА}', '2026')
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(reportDate))

      // Generate repairs list formatted text
      let repairsList = ''

      // Add submitted repairs text if provided and count how many facilities are in it
      let submittedFacilitiesCount = 0
      if (submittedRepairsText.trim()) {
        repairsList += submittedRepairsText.trim() + '\n\n'

        // Count numbered items (1., 2., 3., etc.) in the submitted text
        const matches = submittedRepairsText.match(/^\s*\d+\.\s/gm)
        submittedFacilitiesCount = matches ? matches.length : 0
      }

      facilities.forEach((facility, fIdx) => {
        if (!facility.name && facility.repairs.every(r => !r.pipeline)) return

        // Facility title with number - continue numbering after submitted repairs
        const facilityNum = submittedFacilitiesCount + fIdx + 1
        repairsList += `${facilityNum}. ${facility.name || '____________'}\n`

        // Repairs for this facility
        facility.repairs.forEach(repair => {
          if (!repair.pipeline && !repair.repairType) return

          const facilityType = repair.facilityType || 'Тръбопровод'
          const locations = formatLocations(repair.locations)
          const pipeline = repair.pipeline || '______'
          const repairType = repair.repairType || '______'
          const materials = repair.materials || '____________'
          const workers = repair.workers || '____________'

          repairsList += `  - ${facilityType} ${pipeline} ${locations || '_______'} – ${repairType}\n`
          repairsList += `Използвани материали: ${materials}\n`
          repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
        })

        repairsList += '\n' // Empty line between facilities
      })

      xml = replacePlaceholder(xml, '{РЕМОНТИ}', repairsList.trim())

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

  // Preview content generator - returns JSX with underlined text
  function generatePreviewContent() {
    const monthName = month || '____________'
    const dateStr = reportDate ? formatShortDate(reportDate) : '__.__.____'

    let repairsList = ''

    // Add submitted repairs text if provided and count facilities
    let submittedFacilitiesCount = 0
    if (submittedRepairsText.trim()) {
      repairsList += submittedRepairsText.trim() + '\n\n'

      // Count numbered items (1., 2., 3., etc.) in the submitted text
      const matches = submittedRepairsText.match(/^\s*\d+\.\s/gm)
      submittedFacilitiesCount = matches ? matches.length : 0
    }

    facilities.forEach((facility, fIdx) => {
      // Показвай съоръжение ако има име ИЛИ ако има поне един ремонт с данни
      const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
      if (!hasContent) return

      // Напоително поле като заглавие - continue numbering after submitted repairs
      const facilityNum = submittedFacilitiesCount + fIdx + 1
      repairsList += `${facilityNum}. ${facility.name || '____________'}\n`

      // Ремонти за това съоръжение - с вид съоръжение, наименование, локации
      facility.repairs.forEach(repair => {
        // Показвай ремонт ако има ПОНЕ ЕДНО попълнено поле
        if (!repair.pipeline && !repair.repairType && !repair.materials) return

        const facilityType = repair.facilityType || 'Тръбопровод'
        const locations = formatLocations(repair.locations)
        const pipeline = repair.pipeline || '______'
        const repairType = repair.repairType || '______'
        const materials = repair.materials || '____________'
        const workers = repair.workers || '____________'

        repairsList += `-    ${facilityType} ${pipeline} ${locations || '_______'} ${repairType}\n`
        repairsList += `Използвани материали: ${materials}\n`
        repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
      })

      repairsList += '\n' // Празен ред между съоръженията
    })

    return (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {`ДО

Г-ЖА МИТОШКА ИШМЕРИЕВА
УПРАВИТЕЛ НА „НАПОИТЕЛНИ СИСТЕМИ" ЕАД
КЛОН „СРЕДНА ТУНДЖА"

ГР. СЛИВЕН

                                    ДОКЛАД
                                      от
                          инж. Станислава Димитрова  – инж. УДВН

На основание Заповед №РД-05-80/29.04.2026г на Управителя на "Напоителни системи" ЕАД, клон Средна Тунджа, във връзка с изпълнение  на дейности  по  Договор №РД-50-206/04.12.2025г. за услуга от общ икономически интерес доставка на вода за напояване/ УДВН/ и указания в писмо с вх.№РД-02-238/06.03.2026г. от "Напоителни системи" ЕАД             гр. София
                    Относно :  `}
        <u>Планирани ремонтни дейности   по УДВН за месец {monthName} 2026 г.</u>
        {`
         Планираните ремонтни дейности по съоръженията за месец ${monthName} са както следва:

${repairsList}

С уважение,

инж. Станислава Димитрова ………………………
инж. УДВН при „Напоителни системи" ЕАД –
клон „Средна Тунджа"

гр. Ямбол
  ${dateStr} г.`}
      </div>
    )
  }

// Visual styling fixes for UdvnUpcomingGenerator - replace the return statement

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Месец*</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">Избери...</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дата на доклада*</label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="px-3 py-2 shadow-sm" />
          </div>
        </div>

        {/* Filter for submitted repairs */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-amber-900 mb-2">
            Филтър: Вече подадени ремонти (опционално)
          </label>
          <p className="text-xs text-amber-700 mb-3">
            Въведете текст с вече подадените ремонти и натиснете бутона за да останат само непосочените съоръжения.
          </p>
          <textarea
            value={submittedRepairsText}
            onChange={e => setSubmittedRepairsText(e.target.value)}
            placeholder="Например: НП &quot;Зимница&quot;, НП &quot;Безмер&quot;..."
            className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-mono resize-y"
            rows={4}
          />
          <button
            onClick={filterOutSubmittedRepairs}
            className="mt-3 w-full px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm"
          >
            Филтрирай (остави само непосочените)
          </button>
        </div>

        {/* Facilities section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Съоръжения</h3>
            <button
              onClick={addFacility}
              className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-medium hover:bg-teal-600 transition-colors shadow-sm"
            >
              + Добави съоръжение
            </button>
          </div>

          {facilities.map((facility, fIdx) => (
            <div key={fIdx} className="bg-white rounded-xl shadow-md p-4 mb-4 border border-gray-100">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-gray-800">{fIdx + 1}. Съоръжение</h4>
                  {facilities.length > 1 && (
                    <button onClick={() => removeFacility(fIdx)} className="text-red-500 hover:text-red-700 text-xs font-medium">✕</button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Напоително поле*</label>
                  <Input
                    value={facility.name}
                    onChange={e => updateFacility(fIdx, 'name', e.target.value)}
                    placeholder='НП "Зимница"'
                    className="px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Землище</label>
                  <Input
                    value={facility.zemljishte || ''}
                    onChange={e => updateFacility(fIdx, 'zemljishte', e.target.value)}
                    placeholder='с. Зимница'
                    className="px-3 py-2"
                  />
                </div>
              </div>

              {/* Repairs subsection */}
              <div>
                <h5 className="text-xs font-semibold text-gray-700 mb-2">Ремонти</h5>
                {facility.repairs.map((repair, rIdx) => (
                  <div key={rIdx} className="bg-gray-50 rounded-lg p-3 mb-3 border-l-4 border-teal-400">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-700">— Ремонт #{rIdx + 1}</span>
                      {facility.repairs.length > 1 && (
                        <button
                          onClick={() => removeRepair(fIdx, rIdx)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          ✕ Премахни ремонт
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Facility Type */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Вид съоръжение*</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm"
                          value={repair.facilityType || 'Тръбопровод'}
                          onChange={e => updateRepair(fIdx, rIdx, 'facilityType', e.target.value)}
                        >
                          <option value="Тръбопровод">Тръбопровод</option>
                          <option value="Канал">Канал</option>
                        </select>
                      </div>

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

                      {/* Pipe details - show only when "Ремонт на тръба" is selected */}
                      {repair.repairType === 'Ремонт на тръба' && (
                        <div className="grid grid-cols-3 gap-3 bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Вид тръба</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-teal-500 text-sm"
                              value={repair.pipeType || ''}
                              onChange={e => updateRepair(fIdx, rIdx, 'pipeType', e.target.value)}
                            >
                              <option value="">Избери...</option>
                              <option value="ПВЦ">ПВЦ</option>
                              <option value="АЦ">АЦ</option>
                              <option value="Стомана">Стомана</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Размер (Ф)</label>
                            <Input
                              className="px-3 py-2"
                              value={repair.pipeSize || ''}
                              onChange={e => updateRepair(fIdx, rIdx, 'pipeSize', e.target.value)}
                              placeholder="200/10"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Брой тръби</label>
                            <Input
                              type="number"
                              min="1"
                              className="px-3 py-2"
                              value={repair.pipeCount || ''}
                              onChange={e => updateRepair(fIdx, rIdx, 'pipeCount', parseInt(e.target.value) || 0)}
                              placeholder="1"
                            />
                          </div>
                        </div>
                      )}

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
                  className="text-teal-600 text-xs font-medium hover:text-teal-700"
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
          className="w-full py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <DownloadIcon className="w-4 h-4" />
          Изтегли доклад
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="text-gray-900"
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
  const [plainText, setPlainText] = useState('')

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
      xml = replacePlaceholder(xml, '{ГОДИНА}', '2026')
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(reportDate))

      // Generate repairs list - use plainText if facilities are empty, otherwise build from structure
      let repairsList = ''

      // Check if facilities have any content
      const hasStructuredContent = facilities.some(facility =>
        facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
      )

      if (!hasStructuredContent && plainText.trim()) {
        // Use plain text but replace "Необходими" with "Използвани"
        repairsList = plainText.trim()
          .replace(/Необходими материали\s*:/gi, 'Използвани материали:')
          .replace(/Необходима техника и човешки ресурс\s*:/gi, 'Използвани техника и човешки ресурс:')
      } else {
        // Build from structured facilities
        facilities.forEach((facility, fIdx) => {
          const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
          if (!hasContent) return

          // Facility title with number
          repairsList += `${fIdx + 1}. ${facility.name || '____________'}\n\n`

          // Repairs for this facility with zemljishte
          facility.repairs.forEach(repair => {
            if (!repair.pipeline && !repair.repairType && !repair.materials) return

            const facilityType = repair.facilityType || 'Тръбопровод'
            const locations = formatLocations(repair.locations)
            const pipeline = repair.pipeline || '______'
            const repairType = repair.repairType || '______'
            const materials = repair.materials || '____________'
            const workers = repair.workers || '____________'
            const zemljishte = facility.zemljishte || '____________'

            repairsList += `-    ${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}\n`
            repairsList += `\nИзползвани материали :  ${materials}\n`
            repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
          })

          repairsList += '\n' // Empty line between facilities
        })
      }

      xml = replacePlaceholder(xml, '{РЕМОНТИ}', repairsList.trim())

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

  // Preview content generator - returns JSX with underlined text
  function generatePreviewContent() {
    const monthName = month || '____________'
    const dateStr = reportDate ? formatShortDate(reportDate) : '__.__.____'

    let repairsList = ''

    // Check if facilities have any content
    const hasStructuredContent = facilities.some(facility =>
      facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
    )

    if (!hasStructuredContent && plainText.trim()) {
      // Use plain text but replace "Необходими" with "Използвани"
      repairsList = plainText.trim()
        .replace(/Необходими материали\s*:/gi, 'Използвани материали:')
        .replace(/Необходима техника и човешки ресурс\s*:/gi, 'Използвани техника и човешки ресурс:')
    } else {
      // Build from structured facilities
      facilities.forEach((facility, fIdx) => {
        // Показвай съоръжение ако има име ИЛИ ако има поне един ремонт с данни
        const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
        if (!hasContent) return

        // Напоително поле като заглавие
        repairsList += `${fIdx + 1}. ${facility.name || '____________'}\n`

        // Ремонти за това съоръжение - с вид съоръжение, наименование, локации и землище
        facility.repairs.forEach(repair => {
          // Показвай ремонт ако има ПОНЕ ЕДНО попълнено поле
          if (!repair.pipeline && !repair.repairType && !repair.materials) return

          const facilityType = repair.facilityType || 'Тръбопровод'
          const locations = formatLocations(repair.locations)
          const pipeline = repair.pipeline || '______'
          const repairType = repair.repairType || '______'
          const materials = repair.materials || '____________'
          const workers = repair.workers || '____________'
          const zemljishte = facility.zemljishte || '____________'

          repairsList += `\n\n-    ${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}`
          repairsList += `\nИзползвани материали :  ${materials}\n`
          repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
        })

        repairsList += '\n' // Празен ред между съоръженията
      })
    }

    return (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {`ДО

Г-ЖА МИТОШКА ИШМЕРИЕВА
УПРАВИТЕЛ НА „НАПОИТЕЛНИ СИСТЕМИ" ЕАД
КЛОН „СРЕДНА ТУНДЖА"

ГР. СЛИВЕН

                                    ДОКЛАД
                                      от
                          инж. Станислава Димитрова  – инж. УДВН

На основание Заповед №РД-05-80/29.04.2026г на Управителя на "Напоителни системи" ЕАД, клон Средна Тунджа, във връзка с изпълнение  на дейности  по  Договор №РД-50-206/04.12.2025г. за услуга от общ икономически интерес доставка на вода за напояване/ УДВН/ и указания в писмо с вх.№РД-02-238/06.03.2026г. от "Напоителни системи" ЕАД             гр. София
                    Относно :  `}
        <u>Извършени ремонтни дейности по УДВН за месец {monthName} 2026 г.</u>
        {`
         Извършените ремонтни дейности по съоръженията за месец ${monthName} са както следва:

${repairsList}

С уважение,

инж. Станислава Димитрова ………………………
инж. УДВН при „Напоителни системи" ЕАД –
клон „Средна Тунджа"

гр. Ямбол
  ${dateStr} г.`}
      </div>
    )
  }

// Visual styling fixes for UdvnCompletedGenerator - replace the return statement

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Месец*</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">Избери...</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дата на доклада*</label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="px-3 py-2 shadow-sm" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-700 mb-3">
            Данните за ремонти се вземат от секцията <strong>"Предстоящи ремонти"</strong>.
            Или можете да поставите текст директно в полето по-долу (ако не са попълнени съоръжения).
          </p>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Текст на ремонти (алтернатива на структурираните данни)</label>
          <textarea
            value={plainText}
            onChange={e => setPlainText(e.target.value)}
            placeholder="Поставете текста с извършените ремонти тук... Ако има попълнени съоръжения в 'Предстоящи ремонти', те ще имат приоритет."
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm font-mono resize-none"
          />
        </div>

        <button onClick={handleDownload} className="w-full py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md">
          <DownloadIcon className="w-4 h-4" />
          Изтегли доклад
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="text-gray-900"
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
  month,
  setMonth,
  letterDate,
  setLetterDate,
  outgoingNumber,
  setOutgoingNumber,
  facilities,
  setFacilities
}: {
  month: string
  setMonth: (m: string) => void
  letterDate: string
  setLetterDate: (d: string) => void
  outgoingNumber: string
  setOutgoingNumber: (n: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/писмо ОДЗ.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{ИЗХ_НОМЕР}', outgoingNumber)
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(letterDate))
      xml = replacePlaceholder(xml, '{МЕСЕЦ}', month)

      let listContent = ''
      facilities.forEach((facility, fIdx) => {
        const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.facilityType)
        if (!hasContent) return

        // Напоително поле като заглавие
        listContent += `${fIdx + 1}. ${facility.name || '____________'}:\n\n`

        // Ремонти - само вид съоръжение, pipeline и локации с землище
        facility.repairs.forEach(repair => {
          if (!repair.pipeline && !repair.facilityType) return

          const facilityType = repair.facilityType || 'Тръбопровод'
          const locations = formatLocations(repair.locations)
          const pipeline = repair.pipeline || '______'
          const zemljishte = facility.zemljishte || '____________'

          listContent += `-\t${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}\n`
        })

        listContent += '\n' // Празен ред между съоръженията
      })

      xml = replacePlaceholder(xml, '{РЕМОНТИ}', listContent.trim())

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
    const monthName = month || '____________'
    const outNum = outgoingNumber || '______'
    const dateStr = letterDate ? formatShortDate(letterDate) : '__.__.____'

    let listContent = ''
    facilities.forEach((facility, fIdx) => {
      // Показвай съоръжение ако има име ИЛИ ако има поне един ремонт с данни
      const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.facilityType)
      if (!hasContent) return

      // Напоително поле като заглавие
      listContent += `${fIdx + 1}. ${facility.name || '____________'}:\n\n`

      // Ремонти - само вид съоръжение, pipeline и локации с землище
      facility.repairs.forEach(repair => {
        if (!repair.pipeline && !repair.facilityType) return

        const facilityType = repair.facilityType || 'Тръбопровод'
        const locations = formatLocations(repair.locations)
        const pipeline = repair.pipeline || '______'
        const zemljishte = facility.zemljishte || '____________'

        listContent += `-\t${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}\n`
      })

      listContent += '\n' // Празен ред между съоръженията
    })

    return `Изх. № ${outNum}/${dateStr} г.

ДО Г-ЖА ДОНКА ГЕОРГИЕВА				Съгласувам:……………………
ДИРЕКТОР НА ОБЛАСТНА ДИРЕКЦИЯ		 		/Донка Георгиева/
„ЗЕМЕДЕЛИЕ" - ГР. ЯМБОЛ	Директор на Областна дирекция        „Земеделие" – гр. Ямбол


КОПИЕ:
ДО Г-ЖА СНЕЖИНА ДИНЕВА
ИЗПЪЛНИТЕЛЕН ДИРЕКТОР
НА „НАПОИТЕЛНИ СИСТЕМИ" ЕАД
СОФИЯ

ОТНОСНО: Ремонтно - възстановителни работи/РВР/ на обекти за УДВН за
м. ${monthName}  2026 г.

УВАЖАЕМА ГОСПОЖО ГЕОРГИЕВА,
В изпълнение на Договор № РД-206/04.12.2025г. за УДВН, приложено, изпращаме Ви информация за следните  обекти:
СЪОРЪЖЕНИЕ:
${listContent}

за изпълнение "със собствени сили" на  ремонтно- възстановителни работи /РВР/.
Уведомяваме Ви, че предприемаме  неотложните  ремонтно- възстановителни работи /РВР/ на горецитираните обекти.

Изготвил: ………………………
      /инж. Ст. Димитрова/



С уважение,

инж. Митошка Ишмериева
Управител на „Напоителни системи" ЕАД
Клон „Средна Тунджа" – Сливен`
  }

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Изх. номер*</label>
            <Input value={outgoingNumber} onChange={e => setOutgoingNumber(e.target.value)} placeholder="РД-02-540" className="px-3 py-2 shadow-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дата*</label>
            <Input type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)} className="px-3 py-2 shadow-sm" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Месец*</label>
          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="">Избери...</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-700">
            Данните за ремонти се вземат от секцията <strong>"Предстоящи ремонти"</strong>.
            Попълнете там информацията за съоръжения, тръбопроводи и локации.
          </p>
        </div>

        <button onClick={handleDownload} className="w-full py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md">
          <DownloadIcon className="w-4 h-4" />
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
  month,
  setMonth,
  protocolNumber,
  setProtocolNumber,
  protocolDate,
  setProtocolDate,
  facilities,
  setFacilities
}: {
  month: string
  setMonth: (m: string) => void
  protocolNumber: string
  setProtocolNumber: (n: string) => void
  protocolDate: string
  setProtocolDate: (d: string) => void
  facilities: UdvnFacility[]
  setFacilities: (f: UdvnFacility[]) => void
}) {
  const [plainText, setPlainText] = useState('')

  async function handleDownload() {
    try {
      const templatePath = './templates/УДВН шаблони/Протокол.docx'
      const response = await fetch(templatePath)
      if (!response.ok) throw new Error(`Грешка: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const zip = new PizZip(arrayBuffer)
      const docXml = zip.file('word/document.xml')
      if (!docXml) throw new Error('Липсва document.xml')
      let xml = docXml.asText()

      xml = replacePlaceholder(xml, '{МЕСЕЦ}', month)
      xml = replacePlaceholder(xml, '{ДАТА}', formatShortDate(protocolDate))

      // Generate repairs list - use plainText if facilities are empty, otherwise build from structure
      let repairsList = ''

      // Check if facilities have any content
      const hasStructuredContent = facilities.some(facility =>
        facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
      )

      if (!hasStructuredContent && plainText.trim()) {
        // Use plain text but replace "Необходими" with "Използвани"
        repairsList = plainText.trim()
          .replace(/Необходими материали\s*:/gi, 'Използвани материали:')
          .replace(/Необходима техника и човешки ресурс\s*:/gi, 'Използвани техника и човешки ресурс:')
      } else {
        // Build from structured facilities
        facilities.forEach((facility, fIdx) => {
          const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
          if (!hasContent) return

          // Facility title with number
          repairsList += `${fIdx + 1}. ${facility.name || '____________'}\n\n`

          // Repairs for this facility with zemljishte
          facility.repairs.forEach(repair => {
            if (!repair.pipeline && !repair.repairType && !repair.materials) return

            const facilityType = repair.facilityType || 'Тръбопровод'
            const locations = formatLocations(repair.locations)
            const pipeline = repair.pipeline || '______'
            const repairType = repair.repairType || '______'
            const materials = repair.materials || '____________'
            const workers = repair.workers || '____________'
            const zemljishte = facility.zemljishte || '____________'

            repairsList += `-    ${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}\n`
            repairsList += `\nИзползвани материали :  ${materials}\n`
            repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
          })

          repairsList += '\n' // Empty line between facilities
        })
      }

      xml = replacePlaceholder(xml, '{РЕМОНТИ}', repairsList.trim())

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })
      const fileName = `Протокол_УДВН_${protocolNumber || 'без_номер'}.docx`
      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  // Preview content generator - returns JSX with underlined text
  function generatePreviewContent() {
    const monthName = month || '____________'
    const dateStr = protocolDate ? formatShortDate(protocolDate) : '__.__.____'

    let repairsList = ''

    // Check if facilities have any content
    const hasStructuredContent = facilities.some(facility =>
      facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
    )

    if (!hasStructuredContent && plainText.trim()) {
      // Use plain text but replace "Необходими" with "Използвани"
      repairsList = plainText.trim()
        .replace(/Необходими материали\s*:/gi, 'Използвани материали:')
        .replace(/Необходима техника и човешки ресурс\s*:/gi, 'Използвани техника и човешки ресурс:')
    } else {
      // Build from structured facilities
      facilities.forEach((facility, fIdx) => {
        // Показвай съоръжение ако има име ИЛИ ако има поне един ремонт с данни
        const hasContent = facility.name || facility.repairs.some(r => r.pipeline || r.repairType || r.materials)
        if (!hasContent) return

        // Напоително поле като заглавие
        repairsList += `${fIdx + 1}. ${facility.name || '____________'}\n`

        // Ремонти за това съоръжение - с вид съоръжение, наименование, локации и землище
        facility.repairs.forEach(repair => {
          // Показвай ремонт ако има ПОНЕ ЕДНО попълнено поле
          if (!repair.pipeline && !repair.repairType && !repair.materials) return

          const facilityType = repair.facilityType || 'Тръбопровод'
          const locations = formatLocations(repair.locations)
          const pipeline = repair.pipeline || '______'
          const repairType = repair.repairType || '______'
          const materials = repair.materials || '____________'
          const workers = repair.workers || '____________'
          const zemljishte = facility.zemljishte || '____________'

          repairsList += `\n\n-    ${facilityType} ${pipeline}, с местонахождение в землището на ${zemljishte}  ${locations || '_______'}`
          repairsList += `\nИзползвани материали :  ${materials}\n`
          repairsList += `Използвана техника и човешки ресурс: ${workers}\n`
        })

        repairsList += '\n' // Празен ред mezi съоръженията
      })
    }

    return (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {`Изх. № ………............/……………….
ПРОТОКОЛ
По чл. 1, ал. 3,  от Договор № РД-50-206/04.12.2025 г.
за установяване изпълнение и завършване на натурални видове работи
 за м. ${monthName} 2026г.

Днес ${dateStr} г., представители на Областна дирекция „Земеделие" – Ямбол - инж. Евгени Енев – Главен експерт и „Напоителни системи" ЕАД – клон „Средна Тунджа" – инж. Николай Касидов – Р-л ХТР Ямбол, установиха:

На  следните обекти са извършени /изпълнени и завършени/ следните натурални видове работи:

${repairsList}

Работите са извършени от „Напоителни системи" ЕАД – клон „Средна Тунджа" със собствени сили и механизация през месец ${monthName}.

За Областна дирекция „Земеделие" – Ямбол
…………………………
/инж. Евгени Енев – Главен експерт/

За „Напоителни системи" ЕАД – клон „Средна Тунджа"
…………………………
/инж. Николай Касидов – Р-л ХТР Ямбол/`}
      </div>
    )
  }

// Visual styling fixes for ProtocolGenerator - replace the return statement

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-8 h-full bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl">
      {/* LEFT PANEL - FORM */}
      <div className="overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Месец*</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="">Избери...</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дата*</label>
            <Input type="date" value={protocolDate} onChange={e => setProtocolDate(e.target.value)} className="px-3 py-2 shadow-sm" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-700 mb-3">
            Данните за ремонти се вземат от секцията <strong>"Предстоящи ремонти"</strong>.
            Или можете да поставите текст директно в полето по-долу (ако не са попълнени съоръжения).
          </p>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Текст на ремонти (алтернатива на структурираните данни)</label>
          <textarea
            value={plainText}
            onChange={e => setPlainText(e.target.value)}
            placeholder="Поставете текста с ремонтите тук... Ако има попълнени съоръжения в 'Предстоящи ремонти', те ще имат приоритет."
            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 text-sm font-mono resize-none"
          />
        </div>

        <button onClick={handleDownload} className="w-full py-2.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 shadow-md">
          <DownloadIcon className="w-4 h-4" />
          Изтегли протокол
        </button>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW */}
      <div className="bg-white rounded-xl shadow-lg p-8 overflow-y-auto border border-gray-200">
        <div className="prose prose-sm max-w-none">
          <div
            className="text-gray-900"
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
  { name: 'гр. Болярово', ekatte: '05284', municipality: 'Болярово' },
  { name: 'с. Воден', ekatte: '11658', municipality: 'Болярово' },
  { name: 'с. Вълчи извор', ekatte: '12588', municipality: 'Болярово' },
  { name: 'с. Голямо Крушево', ekatte: '15881', municipality: 'Болярово' },
  { name: 'с. Горска поляна', ekatte: '17097', municipality: 'Болярово' },
  { name: 'с. Денница', ekatte: '20657', municipality: 'Болярово' },
  { name: 'с. Дъбово', ekatte: '24356', municipality: 'Болярово' },
  { name: 'с. Златиница', ekatte: '31019', municipality: 'Болярово' },
  { name: 'с. Иглика', ekatte: '32264', municipality: 'Болярово' },
  { name: 'с. Камен връх', ekatte: '35756', municipality: 'Болярово' },
  { name: 'с. Крайново', ekatte: '39356', municipality: 'Болярово' },
  { name: 'с. Малко Шарково', ekatte: '46704', municipality: 'Болярово' },
  { name: 'с. Мамарчево', ekatte: '46958', municipality: 'Болярово' },
  { name: 'с. Оман', ekatte: '53504', municipality: 'Болярово' },
  { name: 'с. Попово', ekatte: '57652', municipality: 'Болярово' },
  { name: 'с. Ружица', ekatte: '63272', municipality: 'Болярово' },
  { name: 'с. Ситово', ekatte: '66679', municipality: 'Болярово' },
  { name: 'с. Стефан Караджово', ekatte: '69208', municipality: 'Болярово' },
  { name: 'с. Странджа', ekatte: '69674', municipality: 'Болярово' },
  { name: 'с. Шарково', ekatte: '83051', municipality: 'Болярово' },

  // Елхово
  { name: 'гр. Елхово', ekatte: '27382', municipality: 'Елхово' },
  { name: 'с. Борисово', ekatte: '05520', municipality: 'Елхово' },
  { name: 'с. Бояново', ekatte: '06001', municipality: 'Елхово' },
  { name: 'с. Вълча поляна', ekatte: '12530', municipality: 'Елхово' },
  { name: 'с. Голям Дервент', ekatte: '15730', municipality: 'Елхово' },
  { name: 'с. Гранитово', ekatte: '17748', municipality: 'Елхово' },
  { name: 'с. Добрич', ekatte: '21542', municipality: 'Елхово' },
  { name: 'с. Жребино', ekatte: '29516', municipality: 'Елхово' },
  { name: 'с. Изгрев', ekatte: '32576', municipality: 'Елхово' },
  { name: 'с. Кирилово', ekatte: '36909', municipality: 'Елхово' },
  { name: 'с. Лалково', ekatte: '43116', municipality: 'Елхово' },
  { name: 'с. Лесово', ekatte: '43459', municipality: 'Елхово' },
  { name: 'с. Малко Кирилово', ekatte: '46615', municipality: 'Елхово' },
  { name: 'с. Маломирово', ekatte: '46797', municipality: 'Елхово' },
  { name: 'с. Малък манастир', ekatte: '46904', municipality: 'Елхово' },
  { name: 'с. Мелница', ekatte: '47768', municipality: 'Елхово' },
  { name: 'с. Пчела', ekatte: '58801', municipality: 'Елхово' },
  { name: 'с. Раздел', ekatte: '61738', municipality: 'Елхово' },
  { name: 'с. Славейково', ekatte: '66980', municipality: 'Елхово' },
  { name: 'с. Стройно', ekatte: '69883', municipality: 'Елхово' },
  { name: 'с. Трънково', ekatte: '73328', municipality: 'Елхово' },
  { name: 'с. Чернозем', ekatte: '81121', municipality: 'Елхово' },

  // Стралджа
  { name: 'гр. Стралджа', ekatte: '69660', municipality: 'Стралджа' },
  { name: 'с. Александрово', ekatte: '00343', municipality: 'Стралджа' },
  { name: 'с. Атолово', ekatte: '00816', municipality: 'Стралджа' },
  { name: 'с. Богорово', ekatte: '04786', municipality: 'Стралджа' },
  { name: 'с. Воденичане', ekatte: '11661', municipality: 'Стралджа' },
  { name: 'с. Войника', ekatte: '11908', municipality: 'Стралджа' },
  { name: 'с. Джинот', ekatte: '20804', municipality: 'Стралджа' },
  { name: 'с. Зимница', ekatte: '30898', municipality: 'Стралджа' },
  { name: 'с. Иречеково', ekatte: '32771', municipality: 'Стралджа' },
  { name: 'с. Каменец', ekatte: '35794', municipality: 'Стралджа' },
  { name: 'с. Леярово', ekatte: '43615', municipality: 'Стралджа' },
  { name: 'с. Лозенец', ekatte: '44118', municipality: 'Стралджа' },
  { name: 'с. Люлин', ekatte: '44666', municipality: 'Стралджа' },
  { name: 'с. Маленово', ekatte: '46303', municipality: 'Стралджа' },
  { name: 'с. Недялско', ekatte: '51384', municipality: 'Стралджа' },
  { name: 'с. Палаузово', ekatte: '55244', municipality: 'Стралджа' },
  { name: 'с. Поляна', ekatte: '57409', municipality: 'Стралджа' },
  { name: 'с. Правдино', ekatte: '58003', municipality: 'Стралджа' },
  { name: 'с. Първенец', ekatte: '59046', municipality: 'Стралджа' },
  { name: 'с. Саранско', ekatte: '65406', municipality: 'Стралджа' },
  { name: 'с. Тамарино', ekatte: '72076', municipality: 'Стралджа' },
  { name: 'с. Чарда', ekatte: '80220', municipality: 'Стралджа' },

  // Тунджа
  { name: 'с. Асеново', ekatte: '00758', municipality: 'Тунджа' },
  { name: 'с. Безмер', ekatte: '03229', municipality: 'Тунджа' },
  { name: 'с. Болярско', ekatte: '05308', municipality: 'Тунджа' },
  { name: 'с. Ботево', ekatte: '05863', municipality: 'Тунджа' },
  { name: 'с. Бояджик', ekatte: '05952', municipality: 'Тунджа' },
  { name: 'с. Веселиново', ekatte: '10776', municipality: 'Тунджа' },
  { name: 'с. Видинци', ekatte: '10985', municipality: 'Тунджа' },
  { name: 'с. Генерал Инзово', ekatte: '32740', municipality: 'Тунджа' },
  { name: 'с. Генерал Тошево', ekatte: '14725', municipality: 'Тунджа' },
  { name: 'с. Голям манастир', ekatte: '15789', municipality: 'Тунджа' },
  { name: 'с. Гълъбинци', ekatte: '18259', municipality: 'Тунджа' },
  { name: 'с. Дражево', ekatte: '23501', municipality: 'Тунджа' },
  { name: 'с. Драма', ekatte: '23557', municipality: 'Тунджа' },
  { name: 'с. Дряново', ekatte: '23978', municipality: 'Тунджа' },
  { name: 'с. Завой', ekatte: '30096', municipality: 'Тунджа' },
  { name: 'с. Златари', ekatte: '30956', municipality: 'Тунджа' },
  { name: 'с. Кабиле', ekatte: '35028', municipality: 'Тунджа' },
  { name: 'с. Калчево', ekatte: '35609', municipality: 'Тунджа' },
  { name: 'с. Каравелово', ekatte: '36200', municipality: 'Тунджа' },
  { name: 'с. Козарево', ekatte: '37681', municipality: 'Тунджа' },
  { name: 'с. Коневец', ekatte: '38279', municipality: 'Тунджа' },
  { name: 'с. Крумово', ekatte: '40018', municipality: 'Тунджа' },
  { name: 'с. Кукорево', ekatte: '40484', municipality: 'Тунджа' },
  { name: 'с. Маломир', ekatte: '46783', municipality: 'Тунджа' },
  { name: 'с. Меден кладенец', ekatte: '47562', municipality: 'Тунджа' },
  { name: 'с. Межда', ekatte: '47682', municipality: 'Тунджа' },
  { name: 'с. Миладиновци', ekatte: '48101', municipality: 'Тунджа' },
  { name: 'с. Могила', ekatte: '48787', municipality: 'Тунджа' },
  { name: 'с. Овчи кладенец', ekatte: '53299', municipality: 'Тунджа' },
  { name: 'с. Окоп', ekatte: '53480', municipality: 'Тунджа' },
  { name: 'с. Победа', ekatte: '56873', municipality: 'Тунджа' },
  { name: 'с. Робово', ekatte: '62757', municipality: 'Тунджа' },
  { name: 'с. Роза', ekatte: '62921', municipality: 'Тунджа' },
  { name: 'с. Савино', ekatte: '65036', municipality: 'Тунджа' },
  { name: 'с. Симеоново', ekatte: '66456', municipality: 'Тунджа' },
  { name: 'с. Скалица', ekatte: '66737', municipality: 'Тунджа' },
  { name: 'с. Сламино', ekatte: '67177', municipality: 'Тунджа' },
  { name: 'с. Стара река', ekatte: '68878', municipality: 'Тунджа' },
  { name: 'с. Тенево', ekatte: '72240', municipality: 'Тунджа' },
  { name: 'с. Търнава', ekatte: '73657', municipality: 'Тунджа' },
  { name: 'с. Хаджидимитрово', ekatte: '77030', municipality: 'Тунджа' },
  { name: 'с. Ханово', ekatte: '77150', municipality: 'Тунджа' },
  { name: 'с. Чарган', ekatte: '80217', municipality: 'Тунджа' },
  { name: 'с. Челник', ekatte: '80306', municipality: 'Тунджа' },

  // Ямбол
  { name: 'гр. Ямбол', ekatte: '87374', municipality: 'Ямбол' },
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
  sketchType: 'Скица' | 'Скица - проект'
  representsType: 'представлява' | 'не представлява'
  sketchNumber: string
  issueDate: string
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
    sketchType: 'Скица',
    representsType: 'не представлява',
    sketchNumber: '',
    issueDate: new Date().toISOString().split('T')[0]
  })

  // Autocomplete state
  const [localitySearch, setLocalitySearch] = useState('')
  const [showLocalityDropdown, setShowLocalityDropdown] = useState(false)
  const [previewText, setPreviewText] = useState('')

  // Group localities by municipality
  const localitiesByMunicipality = YAMBOL_LOCALITIES.reduce((acc, loc) => {
    if (!acc[loc.municipality]) acc[loc.municipality] = []
    acc[loc.municipality].push(loc)
    return acc
  }, {} as Record<string, LocalityInfo[]>)

  const municipalities = Object.keys(localitiesByMunicipality).sort()

  // Filter localities based on search
  const filteredLocalities = YAMBOL_LOCALITIES.filter(loc =>
    loc.name.toLowerCase().includes(localitySearch.toLowerCase())
  )

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
      setLocalitySearch(locality.name)
      setShowLocalityDropdown(false)
    }
  }

  // Generate formatted preview matching official template
  function generatePreview() {
    const irrigableText = cert.representsType === 'представлява' ? 'ПОЛИВНА' : 'НЕПОЛИВНА'
    const localityWithoutPrefix = cert.locality.replace(/^(гр\.|с\.)\s*/, '')
    const localityType = cert.locality.startsWith('гр.') ? 'гр.' : 'с.'

    return `Приложение към Заповед № РД-09-845/02.08.2024 г.


УДОСТОВЕРЕНИЕ
ЗА ПОЛИВНОСТ НА ЗЕМЕДЕЛСКА ЗЕМЯ

На основание чл. 30, ал. 1, т. 4 от Правилника за прилагане на Закона за опазване на земеделските земи, във връзка с § 1, т. 10 от Допълнителни разпоредби на Закона за опазване на земеделските земи и в изпълнение на Заповед № РД-09-845./02.08.2024 г. на министъра на земеделието и храните,

„НАПОИТЕЛНИ СИСТЕМИ" ЕАД, клон Средна Тунджа, издава настоящото удостоверение за:

Поземлен имот с идентификатор ${cert.ekatte || '…..'}.${cert.kadNumber || '……………………..'}, с площ  ${cert.area || '…………'}  кв. м по Кадастралната карта и кадастралните регистри на ${localityWithoutPrefix || '……………………..'} община ${cert.municipality || '……………………..'}, област Ямбол, съгласно ${cert.sketchType}  № ${cert.sketchNumber || '……………………..'}-${formatShortDate(cert.issueDate)} г., издадена от Служба по геодезия, картография и кадастър – гр. Ямбол или

Поземлен имот № ………………….. по Картата на възстановената собственост на ${localityType}${cert.locality ? localityWithoutPrefix : '……………………..'}, община ${cert.municipality || '……………………..'}, област Ямбол, с площ от ${cert.area || '…………'} кв. м., съгласно Скица № ${cert.sketchNumber || '……………………..'} / ${formatShortDate(cert.issueDate)} г., издадена от Общинска служба по земеделие - ${cert.municipality || '……………………..'}

в уверение на това, че земята в обхвата на имота  ${cert.representsType} земеделска земя, която е разположена на територията, обслужвана от напоителна система или напоително поле, или може да се напоява от естествен водоизточник, позволяващ гравитачно подаване на вода в имота.

Предвид гореизложеното, към датата на издаване на настоящото Удостоверение, земята в обхвата на поземления имот с идентификатор ${cert.ekatte || '…..'}.${cert.kadNumber || '……………………..'} по КККР
 (№ …………………. по КВС на землище ${localityType}/${cert.locality ? localityWithoutPrefix : '……………………..'}) е ${irrigableText}  земеделска земя.




Инж. Митошка Ишмериева
Управител на „Напоителни системи" ЕАД
клон Средна Тунджа`
  }

  // Update preview when cert changes
  useEffect(() => {
    setPreviewText(generatePreview())
  }, [cert])

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

      // Irrigability status - automatic based on representsType
      const irrigableText = cert.representsType === 'представлява' ? 'ПОЛИВНА' : 'НЕПОЛИВНА'

      xml = replacePlaceholder(xml, '{ИМОТНОМЕР}', cert.kadNumber)
      xml = replacePlaceholder(xml, '{ПЛОЩ}', cert.area)
      xml = replacePlaceholder(xml, '{ЗЕМЛИЩЕ}', cert.locality)
      xml = replacePlaceholder(xml, '{ЕКАТТЕ}', cert.ekatte)
      xml = replacePlaceholder(xml, '{ОБЩИНА}', cert.municipality)
      xml = replacePlaceholder(xml, '{ОБЛАСТ}', 'Ямбол')
      xml = replacePlaceholder(xml, '{НОМЕРСКИЦА}', cert.sketchNumber)
      xml = replacePlaceholder(xml, '{ОТДАТА}', formatShortDate(cert.issueDate))
      xml = replacePlaceholder(xml, '{ПОЛИВНОСТ}', irrigableText)

      // Replace sketch type and represents type in the text
      xml = xml.replace(/съгласно Скица/g, `съгласно ${cert.sketchType}`)
      xml = xml.replace(/не представлява/g, cert.representsType)

      zip.file('word/document.xml', xml)
      const blob = zip.generate({ type: 'blob' })

      // Премахваме префикса "гр." или "с." от землището за по-чисто име на файла
      const localityName = cert.locality.replace(/^(гр\.|с\.)\s*/, '')
      const fileName = `Удостоверение_поливност_${localityName}_${cert.kadNumber.replace(/\./g, '_')}.docx`

      await downloadBlob(blob, fileName)
      alert('Документът е генериран!')
    } catch (error) {
      console.error(error)
      alert('Грешка: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  return (
    <div className="space-y-4">
      {/* Property Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Данни за имота</h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Населено място*</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              value={localitySearch}
              onChange={e => {
                setLocalitySearch(e.target.value)
                setShowLocalityDropdown(true)
              }}
              onFocus={() => setShowLocalityDropdown(true)}
              placeholder="Започни да пишеш..."
            />
            {showLocalityDropdown && filteredLocalities.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredLocalities.map(loc => (
                  <div
                    key={loc.ekatte}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                    onClick={() => handleLocalityChange(loc.name)}
                  >
                    <div className="font-medium">{loc.name}</div>
                    <div className="text-xs text-gray-500">
                      {loc.municipality} • ЕКАТТЕ: {loc.ekatte}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">ЕКАТТЕ код</label>
            <Input value={cert.ekatte} readOnly className="bg-gray-50 px-3 py-2" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Община</label>
            <Input value={cert.municipality} readOnly className="bg-gray-50 px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Кадастрален номер (идентификатор)*</label>
            <Input
              value={cert.kadNumber}
              onChange={e => updateField('kadNumber', e.target.value)}
              placeholder="12345.678.901"
              className="px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Площ (кв.м)*</label>
            <Input
              value={cert.area}
              onChange={e => updateField('area', e.target.value)}
              placeholder="12500"
              className="px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Certificate Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Детайли на удостоверението</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Вид скица*</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              value={cert.sketchType}
              onChange={e => updateField('sketchType', e.target.value as 'Скица' | 'Скица - проект')}
            >
              <option value="Скица">Скица</option>
              <option value="Скица - проект">Скица - проект</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Номер на скицата*</label>
            <Input
              value={cert.sketchNumber}
              onChange={e => updateField('sketchNumber', e.target.value)}
              placeholder="123/2026"
              className="px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Имотът...</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              value={cert.representsType}
              onChange={e => updateField('representsType', e.target.value as 'представлява' | 'не представлява')}
            >
              <option value="не представлява">не представлява</option>
              <option value="представлява">представлява</option>
            </select>
            <span className="text-xs text-gray-500 mt-1 block">...поземлен имот с недвижима собственост</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Дата на издаване*</label>
            <Input
              type="date"
              value={cert.issueDate}
              onChange={e => updateField('issueDate', e.target.value)}
              className="px-3 py-2"
            />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="flex items-start gap-2">
            <FileTextIcon className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800">
              <strong>Поливност:</strong> {cert.representsType === 'представлява' ? 'ПОЛИВНА' : 'НЕПОЛИВНА'}
              <div className="text-blue-600 mt-1">
                (Автоматично определена според избора "{cert.representsType}")
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <FileTextIcon className="w-4 h-4" />
          Преглед на съдържанието
        </h3>
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
          {previewText || 'Зареждане на шаблон...'}
        </div>
      </div>

      <Btn onClick={handleDownload} className="w-full">
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
  const [napoyavaneTab, setNapoyavaneTab] = useState<'contract' | 'act' | 'app1' | 'app2' | 'app3' | 'app4' | 'app6'>('contract')

  // UDVN tabs
  const [udvnTab, setUdvnTab] = useState<'upcoming' | 'completed' | 'odz-letter' | 'protocol'>('upcoming')

  // UDVN state for all generators
  const [udvnMonth, setUdvnMonth] = useState('Януари')
  const [udvnReportDate, setUdvnReportDate] = useState('')
  const [udvnFacilities, setUdvnFacilities] = useState<UdvnFacility[]>([JSON.parse(JSON.stringify(EMPTY_FACILITY))])
  const [udvnLetterDate, setUdvnLetterDate] = useState('')
  const [udvnOutgoingNumber, setUdvnOutgoingNumber] = useState('')
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
      setNapoyavaneTab(defaultTab as 'contract' | 'act' | 'app1' | 'app2' | 'app3' | 'app4' | 'app6')
    }
  })

  const napoyavaneTabs = [
    { id: 'contract', label: 'Договор', subtitle: '' },
    { id: 'act', label: 'Акт', subtitle: '' },
    { id: 'app1', label: 'Заявление', subtitle: 'прил. 1' },
    { id: 'app2', label: 'Протокол замерване', subtitle: 'прил. 2' },
    { id: 'app3', label: 'Рекапитулация', subtitle: 'прил. 3' },
    { id: 'app4', label: 'Заявка', subtitle: 'прил. 4' },
    { id: 'app6', label: 'Декларация', subtitle: 'прил. 6' },
  ] as const

  const udvnTabs = [
    { id: 'upcoming', label: 'Предстоящи ремонти' },
    { id: 'odz-letter', label: 'Писмо до ОДЗ' },
    { id: 'completed', label: 'Извършени ремонти' },
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
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${category === 'napoyavane' ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <WaterDropIcon className="w-5 h-5" />
          Напояване
        </button>
        <button
          onClick={() => setCategory('udvn')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${category === 'udvn' ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <ToolsIcon className="w-5 h-5" />
          УДВН
        </button>
        <button
          onClick={() => setCategory('certificates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${category === 'certificates' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <FileTextIcon className="w-5 h-5" />
          Удостоверения
        </button>
      </div>

      {/* Napoyavane tabs */}
      {category === 'napoyavane' && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
            {napoyavaneTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setNapoyavaneTab(t.id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${napoyavaneTab === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <div className="flex flex-col items-center">
                  <span>{t.label}</span>
                  {t.subtitle && <span className="text-xs opacity-70 mt-0.5">{t.subtitle}</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {napoyavaneTab === 'contract' && <ContractGenerator />}
            {napoyavaneTab === 'act' && <ActGenerator />}
            {napoyavaneTab === 'app1' && <Appendix1Generator />}
            {napoyavaneTab === 'app2' && <Appendix2Generator />}
            {napoyavaneTab === 'app3' && <Appendix3Generator />}
            {napoyavaneTab === 'app4' && <Appendix4Generator />}
            {napoyavaneTab === 'app6' && <Appendix6Generator />}
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
                month={udvnMonth}
                setMonth={setUdvnMonth}
                letterDate={udvnLetterDate}
                setLetterDate={setUdvnLetterDate}
                outgoingNumber={udvnOutgoingNumber}
                setOutgoingNumber={setUdvnOutgoingNumber}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'protocol' && (
              <ProtocolGenerator
                month={udvnMonth}
                setMonth={setUdvnMonth}
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
