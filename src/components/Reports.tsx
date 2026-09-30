import React, { useState, useMemo } from 'react'
import { useStore } from '../store'
import { PageHeader, StatCard, Card, Select, Input, Btn, num, ExportIcon, Combobox } from './ui'
import { countActs, countContracts } from '../lib/acts'
import { exportStyledWorkbook, exportFilename } from '../lib/spreadsheet'
import { downloadBlob } from '../lib/docx-fill'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ARIAL_FONT_BASE64, ARIAL_BOLD_FONT_BASE64 } from '../lib/arial-font'

const MONTHS = [
  'Януари',
  'Февруари',
  'Март',
  'Април',
  'Май',
  'Юни',
  'Юли',
  'Август',
  'Септември',
  'Октомври',
  'Ноември',
  'Декември'
]

const ANALYSIS_COLORS = {
  teal: 'from-teal-500 to-teal-600',
  blue: 'from-blue-500 to-blue-600',
  amber: 'from-amber-400 to-amber-500',
  emerald: 'from-emerald-500 to-emerald-600',
} as const

function ContractorComparisonTable({ data, color = 'teal' }: { data: any[]; color?: keyof typeof ANALYSIS_COLORS }) {
  const [sortField, setSortField] = React.useState<string | null>(null)
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc')

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedData = React.useMemo(() => {
    if (!sortField) return data

    return [...data].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'bg')
          : bVal.localeCompare(aVal, 'bg')
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [data, sortField, sortDirection])

  const SortableHeader = ({ label, field, align = 'center' }: { label: string; field: string; align?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`text-${align} px-3 py-3 text-xs font-semibold text-white leading-tight cursor-pointer hover:bg-white/10 transition-colors`}
    >
      {label} {sortField === field && (sortDirection === 'asc' ? '▲' : '▼')}
    </th>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`bg-gradient-to-br ${ANALYSIS_COLORS[color]}`}>
            <SortableHeader label="Контрагент" field="name" align="left" />
            <SortableHeader label="ХТУ" field="htuName" align="center" />
            <SortableHeader label="Договорена площ дка" field="contractedArea" />
            <SortableHeader label="Актувана площ физ.дка" field="actualArea" />
            <SortableHeader label="Разлика дка" field="areaDifference" />
            <SortableHeader label="Договорен обем м³" field="contractedVolume" />
            <SortableHeader label="Реализиран обем м³" field="actualVolume" />
            <SortableHeader label="Разлика м³" field="volumeDifference" />
            <SortableHeader label="Договорени бр. поливки" field="contractedIrrigations" />
            <SortableHeader label="Реализирани бр. поливки" field="actualIrrigations" />
            <SortableHeader label="Разлика бр." field="irrigationsDifference" />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((x, i) => (
            <tr key={x.name} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
              <td className="px-3 py-2 font-medium text-left">{x.name}</td>
              <td className="px-3 py-2 text-center text-xs text-gray-600">{x.htuName}</td>
              <td className="px-3 py-2 text-center">{num(x.contractedArea, 2)}</td>
              <td className="px-3 py-2 text-center">{num(x.actualArea, 2)}</td>
              <td className={`px-3 py-2 text-center font-semibold ${x.areaDifference > 0 ? 'text-amber-600' : x.areaDifference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {num(x.areaDifference, 2)}
              </td>
              <td className="px-3 py-2 text-center">{num(x.contractedVolume, 0)}</td>
              <td className="px-3 py-2 text-center">{num(x.actualVolume, 0)}</td>
              <td className={`px-3 py-2 text-center font-semibold ${x.volumeDifference > 0 ? 'text-amber-600' : x.volumeDifference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {num(x.volumeDifference, 0)}
              </td>
              <td className="px-3 py-2 text-center">{num(x.contractedIrrigations, 2)}</td>
              <td className="px-3 py-2 text-center">{num(x.actualIrrigations, 2)}</td>
              <td className={`px-3 py-2 text-center font-semibold ${x.irrigationsDifference > 0 ? 'text-amber-600' : x.irrigationsDifference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {num(x.irrigationsDifference, 2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
            <td className="px-3 py-2 text-left">ОБЩО:</td>
            <td className="px-3 py-2 text-center">—</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.contractedArea, 0), 2)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.actualArea, 0), 2)}</td>
            <td className="px-3 py-2 text-center font-semibold text-teal-700">{num(data.reduce((s, x) => s + x.areaDifference, 0), 2)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.contractedVolume, 0), 0)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.actualVolume, 0), 0)}</td>
            <td className="px-3 py-2 text-center font-semibold text-teal-700">{num(data.reduce((s, x) => s + x.volumeDifference, 0), 0)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.contractedIrrigations, 0), 2)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + x.actualIrrigations, 0), 2)}</td>
            <td className="px-3 py-2 text-center font-semibold text-teal-700">{num(data.reduce((s, x) => s + x.irrigationsDifference, 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CropMonthAnalysisTable({ data, color = 'amber' }: { data: any[]; color?: keyof typeof ANALYSIS_COLORS }) {
  // Group data by month
  const groupedByMonth: Record<string, any[]> = {}
  data.forEach(row => {
    if (!groupedByMonth[row.month]) {
      groupedByMonth[row.month] = []
    }
    groupedByMonth[row.month].push(row)
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`bg-gradient-to-br ${ANALYSIS_COLORS[color]}`}>
            <th className="text-left px-3 py-3 text-xs font-semibold text-white leading-tight">Месец</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-white leading-tight">Култура</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Договори<br/>бр.</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Договорирана<br/>площ дка</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Вода<br/>договори м³</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Стойност<br/>договори €</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Актове<br/>бр.</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Актувана<br/>площ дка</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Актувана<br/>вода м³</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-white leading-tight">Стойност<br/>актове €</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedByMonth).map(([month, rows]) => (
            <React.Fragment key={month}>
              {rows.map((x, i) => (
                <tr key={`${month}-${x.name}`} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  {i === 0 && <td className="px-3 py-2 font-semibold text-left bg-amber-50" rowSpan={rows.length}>{month}</td>}
                  <td className="px-3 py-2 font-medium text-left">{x.name}</td>
                  <td className="px-3 py-2 text-center">{x.contractCount}</td>
                  <td className="px-3 py-2 text-center">{num(x.contractArea, 2)}</td>
                  <td className="px-3 py-2 text-center">{num(x.contractWater, 0)}</td>
                  <td className="px-3 py-2 text-center">{num(x.contractValue, 2)}</td>
                  <td className="px-3 py-2 text-center">{x.actCount}</td>
                  <td className="px-3 py-2 text-center">{num(x.actArea, 2)}</td>
                  <td className="px-3 py-2 text-center">{num(x.actWater, 0)}</td>
                  <td className="px-3 py-2 text-center">{num(x.actValue, 2)}</td>
                </tr>
              ))}
              <tr className="bg-amber-100 font-semibold border-t-2 border-amber-300">
                <td className="px-3 py-2 text-left" colSpan={2}>Обобщение {month}:</td>
                <td className="px-3 py-2 text-center text-gray-400">—</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.contractArea || 0), 0), 2)}</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.contractWater || 0), 0), 0)}</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.contractValue || 0), 0), 2)}</td>
                <td className="px-3 py-2 text-center text-gray-400">—</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.actArea || 0), 0), 2)}</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.actWater || 0), 0), 0)}</td>
                <td className="px-3 py-2 text-center">{num(rows.reduce((s, x) => s + (x.actValue || 0), 0), 2)}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
            <td className="px-3 py-2 text-left" colSpan={2}>ОБЩО:</td>
            <td className="px-3 py-2 text-center text-gray-400">—</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.contractArea || 0), 0), 2)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.contractWater || 0), 0), 0)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.contractValue || 0), 0), 2)}</td>
            <td className="px-3 py-2 text-center text-gray-400">—</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.actArea || 0), 0), 2)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.actWater || 0), 0), 0)}</td>
            <td className="px-3 py-2 text-center">{num(data.reduce((s, x) => s + (x.actValue || 0), 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function AnalysisTable({ data, color = 'teal', showTotals = true, sumCounts = false, showHtuMonth = false }: { data: any[]; color?: keyof typeof ANALYSIS_COLORS; showTotals?: boolean; sumCounts?: boolean; showHtuMonth?: boolean }) {

  // Ако showHtuMonth е true, добавяме колони за ХТУ и Месец
  const headers = showHtuMonth ? [
    ['ХТУ', 'ХТУ'],
    ['Месец', 'Месец'],
    ['Култура', 'Култура'],
    [<>Договори<br/>бр.</>, 'Договори бр.'],
    [<>Договорирана<br/>площ дка</>, 'Договорирана площ дка'],
    [<>Вода<br/>договори<br/>м³</>, 'Вода договори м³'],
    [<>Стойност<br/>договори €</>, 'Стойност договори €'],
    [<>Актове<br/>бр.</>, 'Актове бр.'],
    [<>Актувана<br/>площ дка</>, 'Актувана площ дка'],
    [<>Актувана<br/>вода м³</>, 'Актувана вода м³'],
    [<>Стойност<br/>актове €</>, 'Стойност актове €'],
  ] : [
    ['Наименование', 'Наименование'],
    [<>Договори<br/>бр.</>, 'Договори бр.'],
    [<>Договорирана<br/>площ дка</>, 'Договорирана площ дка'],
    [<>Вода<br/>договори<br/>м³</>, 'Вода договори м³'],
    [<>Стойност<br/>договори €</>, 'Стойност договори €'],
    [<>Актове<br/>бр.</>, 'Актове бр.'],
    [<>Актувана<br/>площ дка</>, 'Актувана площ дка'],
    [<>Актувана<br/>вода м³</>, 'Актувана вода м³'],
    [<>Стойност<br/>актове €</>, 'Стойност актове €'],
  ]

  return (
    <div className="overflow-x-auto">

      <table className="w-full text-sm">

        <thead>
          <tr className={`bg-gradient-to-br ${ANALYSIS_COLORS[color]}`}>

            {(headers as [React.ReactNode, string][]).map(([label, key], idx) => (

              <th
                key={key}
                className={`${idx === 0 || (showHtuMonth && idx <= 2) ? 'text-left' : 'text-center'} px-3 py-3 text-xs font-semibold text-white leading-tight`}
              >
                {label}
              </th>

            ))}

          </tr>
        </thead>


        <tbody>

          {data.map((x, i) => (

            <tr
              key={showHtuMonth ? `${x.htuName}-${x.month}-${x.name}` : x.name}
              className={`border-b border-gray-50 ${
                i % 2 === 0 ? '' : 'bg-gray-50/40'
              }`}
            >

              {showHtuMonth && (
                <>
                  <td className="px-3 py-2 font-medium text-left">
                    {x.htuName}
                  </td>
                  <td className="px-3 py-2 text-left">
                    {x.month}
                  </td>
                </>
              )}

              <td className="px-3 py-2 font-medium text-left">
                {x.name}
              </td>

              <td className="px-3 py-2 text-center">
                {x.contractCount}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.contractArea, 2)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.contractWater, 0)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.contractValue, 2)}
              </td>

              <td className="px-3 py-2 text-center">
                {x.actCount}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.actArea, 2)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.actWater, 0)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.actValue, 2)}
              </td>

            </tr>

          ))}


        </tbody>

        {showTotals && (
          <tfoot>
            <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
              {showHtuMonth && (
                <>
                  <td className="px-3 py-2 text-left" colSpan={2}>ОБЩО:</td>
                  <td className="px-3 py-2"></td>
                </>
              )}
              {!showHtuMonth && <td className="px-3 py-2 text-left">ОБЩО:</td>}
              <td className="px-3 py-2 text-center">{sumCounts ? data.reduce((sum, x) => sum + (x.contractCount || 0), 0) : <span className="text-gray-400">—</span>}</td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.contractArea || 0), 0), 2)}
              </td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.contractWater || 0), 0), 0)}
              </td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.contractValue || 0), 0), 2)}
              </td>
              <td className="px-3 py-2 text-center">{sumCounts ? data.reduce((sum, x) => sum + (x.actCount || 0), 0) : <span className="text-gray-400">—</span>}</td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.actArea || 0), 0), 2)}
              </td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.actWater || 0), 0), 0)}
              </td>
              <td className="px-3 py-2 text-center">
                {num(data.reduce((sum, x) => sum + (x.actValue || 0), 0), 2)}
              </td>
            </tr>
          </tfoot>
        )}

      </table>

    </div>
  )
}

// Компонент за отчетност по месеци
function ReportingTable({ data }: { data: any[] }) {
  return (
    <div>
      {/* DEBUG INFO - показва детайли за изчисленията */}
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded text-xs">
        <h4 className="font-bold mb-2">🔍 DEBUG INFO - Детайли за договорите по месеци:</h4>
        <div className="space-y-1 font-mono text-[10px]">
          {data.map((row, i) => (
            <div key={i} className="border-b border-yellow-200 pb-1">
              <strong>{row.month}:</strong> {row.debugInfo}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse border border-gray-300">
        {/* Header Row 1 - Main groups */}
        <thead>
          <tr className="bg-white">
            <th rowSpan={3} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              Към месец
            </th>
            <th rowSpan={3} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              Годни<br/>площи
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ПО ДОГОВОР
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ОБЩО ПОЛЯТИ
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ЦАРЕВИЦА
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ТЮТЮН
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ЗЕЛЕНЧУЦИ
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ТРАЙНИ НАСАЖДЕНИЯ
            </th>
            <th colSpan={4} className="border border-gray-300 px-2 py-2 font-semibold text-center">
              ДРУГИ КУЛТУРИ
            </th>
          </tr>

          {/* Header Row 2 - Sub groups */}
          <tr className="bg-white">
            <th rowSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              площи
            </th>
            <th rowSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              вод. маси
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              поливодекари
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              ІІ поливка и следващи
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              ІІ поливка и следващи
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              ІІ поливка и следващи
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              ІІ поливка и следващи
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              І поливка
            </th>
            <th colSpan={2} className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">
              ІІ поливка и следващи
            </th>
          </tr>

          {/* Header Row 3 - Units */}
          <tr className="bg-white">
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            {/* ЦАРЕВИЦА */}
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            {/* ТЮТЮН */}
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            {/* ЗЕЛЕНЧУЦИ */}
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            {/* ТРАЙНИ НАСАЖДЕНИЯ */}
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            {/* ДРУГИ КУЛТУРИ */}
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка.</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">дка</th>
            <th className="border border-gray-300 px-2 py-1 font-semibold text-center text-[10px]">х. м3</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row, idx) => {
            // Професионална цветова палитра по сезони
            const monthColors: Record<string, string> = {
              // Пролет (Април, Май) - светло зелени тонове
              'Април': 'bg-emerald-50',      // Светло изумруд
              'Май': 'bg-green-100',          // Светло зелен

              // Лято (Юни, Юли, Август) - топли зелени и жълти тонове
              'Юни': 'bg-lime-100',           // Лаймово зелен
              'Юли': 'bg-yellow-50',          // Светло жълт
              'Август': 'bg-amber-50',        // Светло кехлибарен

              // Есен (Септември, Октомври, Ноември) - топли оранжеви тонове
              'Септември': 'bg-orange-50',    // Светло оранжев
              'Октомври': 'bg-rose-50',       // Светло розов
              'Ноември': 'bg-purple-50',      // Светло лилав

              // Зима (Декември, Януари, Февруари, Март) - студени сини тонове
              'Декември': 'bg-blue-50',       // Светло син
              'Януари': 'bg-cyan-50',         // Светло циан
              'Февруари': 'bg-sky-50',        // Светло небесно син
              'Март': 'bg-teal-50',           // Светло тюркоаз
            }
            const rowColor = monthColors[row.month] || 'bg-gray-50'

            return (
            <tr key={idx} className={rowColor}>
              <td className="border border-gray-300 px-2 py-2 font-medium text-center">{row.month}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.availableArea ? num(row.availableArea, 2) : '—'}</td>
              {/* ПО ДОГОВОР */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(row.contractArea || 0, 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(row.contractWater || 0, 2)}</td>
              {/* ОБЩО ПОЛЯТИ */}
              <td className="border border-gray-300 px-2 py-2 text-center font-medium">{row.totalFirstArea ? num(row.totalFirstArea, 2) : '—'}</td>
              <td className="border border-gray-300 px-2 py-2 text-center font-medium">{row.totalFirstWater ? num(row.totalFirstWater, 2) : '—'}</td>
              <td className="border border-gray-300 px-2 py-2 text-center font-medium">{row.totalPolivodecares ? num(row.totalPolivodecares, 2) : '—'}</td>
              <td className="border border-gray-300 px-2 py-2 text-center font-medium">{row.totalPolivodecaresWater ? num(row.totalPolivodecaresWater, 2) : '—'}</td>
              {/* ЦАРЕВИЦА */}
              <td className="border border-gray-300 px-2 py-2 text-center">{row.corn1Area ? num(row.corn1Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.corn1Water ? num(row.corn1Water, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.corn2Area ? num(row.corn2Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.corn2Water ? num(row.corn2Water, 2) : ''}</td>
              {/* ТЮТЮН */}
              <td className="border border-gray-300 px-2 py-2 text-center">{row.tobacco1Area ? num(row.tobacco1Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.tobacco1Water ? num(row.tobacco1Water, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.tobacco2Area ? num(row.tobacco2Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.tobacco2Water ? num(row.tobacco2Water, 2) : ''}</td>
              {/* ЗЕЛЕНЧУЦИ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{row.vegetables1Area ? num(row.vegetables1Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.vegetables1Water ? num(row.vegetables1Water, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.vegetables2Area ? num(row.vegetables2Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.vegetables2Water ? num(row.vegetables2Water, 2) : ''}</td>
              {/* ТРАЙНИ НАСАЖДЕНИЯ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{row.perennial1Area ? num(row.perennial1Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.perennial1Water ? num(row.perennial1Water, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.perennial2Area ? num(row.perennial2Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.perennial2Water ? num(row.perennial2Water, 2) : ''}</td>
              {/* ДРУГИ КУЛТУРИ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{row.other1Area ? num(row.other1Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.other1Water ? num(row.other1Water, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.other2Area ? num(row.other2Area, 2) : ''}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{row.other2Water ? num(row.other2Water, 2) : ''}</td>
            </tr>
            )
          })}

          {/* Total row - like "Общо 2026" */}
          {data.length > 0 && (
            <tr className="bg-purple-100 font-semibold border-t-2 border-purple-400">
              <td className="border border-gray-300 px-2 py-2 text-center">ОБЩО {new Date().getFullYear()}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">—</td>
              {/* ПО ДОГОВОР */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.contractArea || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.contractWater || 0), 0), 2)}</td>
              {/* ОБЩО ПОЛЯТИ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.totalFirstArea || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.totalFirstWater || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.totalPolivodecares || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.totalPolivodecaresWater || 0), 0), 2)}</td>
              {/* ЦАРЕВИЦА */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.corn1Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.corn1Water || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.corn2Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.corn2Water || 0), 0), 2)}</td>
              {/* ТЮТЮН */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.tobacco1Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.tobacco1Water || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.tobacco2Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.tobacco2Water || 0), 0), 2)}</td>
              {/* ЗЕЛЕНЧУЦИ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.vegetables1Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.vegetables1Water || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.vegetables2Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.vegetables2Water || 0), 0), 2)}</td>
              {/* ТРАЙНИ НАСАЖДЕНИЯ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.perennial1Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.perennial1Water || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.perennial2Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.perennial2Water || 0), 0), 2)}</td>
              {/* ДРУГИ КУЛТУРИ */}
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.other1Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.other1Water || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.other2Area || 0), 0), 2)}</td>
              <td className="border border-gray-300 px-2 py-2 text-center">{num(data.reduce((s, x) => s + (x.other2Water || 0), 0), 2)}</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}


export default function Reports({ onNavigate }: { onNavigate?: (module: 'contracts' | 'acts', contractorId?: string) => void }) {


const {
  contracts,
  acts,
  contractors,
  htus,
  crops,
  seasonArchives
} = useStore()



const [filterContractor,setFilterContractor] = useState('')
const [filterHTU,setFilterHTU] = useState('')
const [filterMonth,setFilterMonth] = useState('')

const [activeTab,setActiveTab] =
useState<
'overview' |
'analysis' |
'reporting' |
'seasons'
>('overview')



const contractorQuery = filterContractor.trim().toLowerCase()

const filteredContracts = useMemo(()=>{

return contracts.filter(c => {

const contractorName = contractors.find(x=>x.id===c.contractorId)?.name.toLowerCase() ?? ''
const htuName = htus.find(h=>h.id===c.htuId)?.htuName ?? ''

return (
(!contractorQuery ||
contractorName.includes(contractorQuery))

&&

(!filterHTU ||
htuName === filterHTU)

&&

(!filterMonth ||
c.month === filterMonth)
)

})

},[
contracts,
contractors,
htus,
contractorQuery,
filterHTU,
filterMonth
])



const filteredActs = useMemo(()=>{

return acts.filter(a => {

const htuName = htus.find(h=>h.id===a.htuId)?.htuName ?? ''

return (
(!filterContractor ||
a.contractorId === filterContractor)

&&

(!filterHTU ||
htuName === filterHTU)

&&

(!filterMonth ||
a.month === filterMonth)
)

})

},[
acts,
htus,
filterContractor,
filterHTU,
filterMonth
])



const totalWaterContracts =
filteredContracts.reduce(
(s,c)=>s+c.waterCubic,
0
)


const totalValueContracts =
filteredContracts.reduce(
(s,c)=>s+c.value,
0
)


const totalWaterActs =
filteredActs.reduce(
(s,a)=>s+a.waterCubic,
0
)


const totalValueActs =
filteredActs.reduce(
(s,a)=>s+a.value,
0
)


const totalArea =
filteredContracts.reduce(
(s,c)=>s+c.area,
0
)


const totalActArea =
filteredActs.reduce(
(s,a)=>s+a.area,
0
)

const totalActAreaFirstIrrigation =
filteredActs
.filter(a => a.irrigationNumber === '1' || a.irrigationNumber === 'Първа')
.reduce(
(s,a)=>s+a.area,
0
)


// ==========================
// АНАЛИЗ ПО МЕСЕЦИ
// ==========================

const analysisByMonth = useMemo(()=>{

return MONTHS.map(month=>{


const c =
filteredContracts.filter(
x=>x.month===month
)


const a =
filteredActs.filter(
x=>x.month===month
)



return {

name:month,


contractCount: countContracts(c),

contractWater:
c.reduce(
(s,x)=>s+x.waterCubic,
0
),

contractArea:
c.reduce(
(s,x)=>s+x.area,
0
),

contractValue:
c.reduce(
(s,x)=>s+x.value,
0
),


actCount:countActs(a),

actWater:
a.reduce(
(s,x)=>s+x.waterCubic,
0
),

actArea:
a.reduce(
(s,x)=>s+x.area,
0
),

actValue:
a.reduce(
(s,x)=>s+x.value,
0
)

}



}).filter(x=>
x.contractCount ||
x.actCount
)


},[
filteredContracts,
filteredActs
])
// ==========================
// АНАЛИЗ ПО КУЛТУРИ
// ==========================

const analysisByCrop = useMemo(()=>{

return crops.map(crop=>{


const c =
filteredContracts.filter(
x=>x.cropId===crop.id
)


const a =
filteredActs.filter(
x=>x.cropId===crop.id
)



return {

name:crop.name,


contractCount: countContracts(c),


contractWater:
c.reduce(
(s,x)=>s+x.waterCubic,
0
),

contractArea:
c.reduce(
(s,x)=>s+x.area,
0
),

contractValue:
c.reduce(
(s,x)=>s+x.value,
0
),



actCount:
a.length,


actWater:
a.reduce(
(s,x)=>s+x.waterCubic,
0
),


actArea:
a.reduce(
(s,x)=>s+x.area,
0
),


actValue:
a.reduce(
(s,x)=>s+x.value,
0
)

}


}).filter(x=>
x.contractCount ||
x.actCount
)


},[
crops,
filteredContracts,
filteredActs
])


// ==========================
// АНАЛИЗ ПО КУЛТУРИ ПО МЕСЕЦИ
// ==========================

const analysisByCropMonth = useMemo(()=>{

const keys = new Set<string>()

filteredContracts.forEach(c=>keys.add(`${c.cropId}|${c.month}`))
filteredActs.forEach(a=>keys.add(`${a.cropId}|${a.month}`))

const rows = [...keys].map(key=>{

const [cropId,month] = key.split('|')
const cropName = crops.find(x=>x.id===cropId)?.name ?? '—'

const c = filteredContracts.filter(x=>x.cropId===cropId && x.month===month)
const a = filteredActs.filter(x=>x.cropId===cropId && x.month===month)

return {
name: cropName,
month: month || 'без месец',
sortCrop: cropName,
sortMonth: MONTHS.indexOf(month),
contractCount: countContracts(c),
contractWater: c.reduce((s,x)=>s+x.waterCubic,0),
contractArea: c.reduce((s,x)=>s+x.area,0),
contractValue: c.reduce((s,x)=>s+x.value,0),
actCount: a.length,
actWater: a.reduce((s,x)=>s+x.waterCubic,0),
actArea: a.reduce((s,x)=>s+x.area,0),
actValue: a.reduce((s,x)=>s+x.value,0),
}

}).filter(x=>x.contractCount || x.actCount)

// Сортиране първо по месец, после по култура
rows.sort((x,y)=> x.sortMonth - y.sortMonth || x.sortCrop.localeCompare(y.sortCrop,'bg'))

return rows

},[
crops,
filteredContracts,
filteredActs
])


// ==========================
// АНАЛИЗ ПО ХТУ И КУЛТУРИ ПО МЕСЕЦИ
// ==========================

const analysisByHtuCropMonth = useMemo(()=>{

const htuNameOf = (id: string) => htus.find(x=>x.id===id)?.htuName ?? '—'

const keys = new Set<string>()

filteredContracts.forEach(c=>keys.add(`${htuNameOf(c.htuId)}|${c.cropId}|${c.month}`))
filteredActs.forEach(a=>keys.add(`${htuNameOf(a.htuId)}|${a.cropId}|${a.month}`))

const rows = [...keys].map(key=>{

const [htuName,cropId,month] = key.split('|')
const cropName = crops.find(x=>x.id===cropId)?.name ?? '—'

const c = filteredContracts.filter(x=>htuNameOf(x.htuId)===htuName && x.cropId===cropId && x.month===month)
const a = filteredActs.filter(x=>htuNameOf(x.htuId)===htuName && x.cropId===cropId && x.month===month)

return {
month: month || 'без месец',
htuName: htuName,
name: cropName,
sortKey: `${htuName}`,
sortHtu: htuName,
sortMonth: MONTHS.indexOf(month),
contractCount: countContracts(c),
contractWater: c.reduce((s,x)=>s+x.waterCubic,0),
contractArea: c.reduce((s,x)=>s+x.area,0),
contractValue: c.reduce((s,x)=>s+x.value,0),
actCount: a.length,
actWater: a.reduce((s,x)=>s+x.waterCubic,0),
actArea: a.reduce((s,x)=>s+x.area,0),
actValue: a.reduce((s,x)=>s+x.value,0),
}

}).filter(x=>x.contractCount || x.actCount)

rows.sort((x,y)=> x.sortKey.localeCompare(y.sortKey,'bg') || x.sortMonth - y.sortMonth)

return rows

},[
htus,
crops,
filteredContracts,
filteredActs
])

// ==========================
// ОТЧЕТНОСТ ПО МЕСЕЦИ
// ==========================

// Функция за определяне на категорията на култура
const getCropCategory = (cropName: string): 'corn' | 'tobacco' | 'vegetables' | 'perennial' | 'other' | null => {
  const name = cropName.toLowerCase()

  // ЦАРЕВИЦА
  if (name.includes('царевица')) return 'corn'

  // ТЮТЮН
  if (name.includes('тютюн')) return 'tobacco'

  // ЗЕЛЕНЧУЦИ: бостан, зеленчуци, домати, краставици, Картофи, броколи, бамя, фасул
  if (
    name.includes('бостан') ||
    name.includes('зеленчуци') ||
    name.includes('домати') ||
    name.includes('краставици') ||
    name.includes('картофи') ||
    name.includes('броколи') ||
    name.includes('бамя') ||
    name.includes('фасул')
  ) return 'vegetables'

  // ТРАЙНИ НАСАЖДЕНИЯ: лозя, тр насаждения, сливи, овошки, праскови, ябълки, бадем
  if (
    name.includes('лозя') ||
    name.includes('тр насаждения') ||
    name.includes('трайни насаждения') ||
    name.includes('сливи') ||
    name.includes('овошки') ||
    name.includes('праскови') ||
    name.includes('ябълки') ||
    name.includes('бадем')
  ) return 'perennial'

  // ДРУГИ КУЛТУРИ: маточина, люцерна, шипки, слънчоглед, пшеница
  if (
    name.includes('маточина') ||
    name.includes('люцерна') ||
    name.includes('шипки') ||
    name.includes('слънчоглед') ||
    name.includes('пшеница')
  ) return 'other'

  return null
}

const reportingData = useMemo(() => {
  // Генерираме данни за всеки месец от годината, започвайки от Април
  // Месеците са от индекс 3 (Април) до 11 (Декември), после 0 (Януари) до 2 (Март)
  const reorderedMonths = [...MONTHS.slice(3), ...MONTHS.slice(0, 3)] // Април-Декември, Януари-Март

  const monthsData = reorderedMonths.map((monthName, idx) => {
    // Филтрираме договори и актове за този месец
    // За договорите извличаме месеца от датата (ако няма поле month)
    const monthContracts = filteredContracts.filter(c => {
      // Ако договорът има поле month, използваме го
      if (c.month) {
        return c.month === monthName
      }
      // Иначе извличаме месеца от датата
      const contractDate = new Date(c.date)
      const contractMonthName = MONTHS[contractDate.getMonth()]
      return contractMonthName === monthName
    })
    // За актовете извличаме месеца от датата (ако няма поле month)
    const monthActs = filteredActs.filter(a => {
      // Ако актът има поле month, използваме го
      if (a.month) {
        return a.month === monthName
      }
      // Иначе извличаме месеца от датата
      const actDate = new Date(a.date)
      const actMonthName = MONTHS[actDate.getMonth()]
      return actMonthName === monthName
    })

    // ПО ДОГОВОР:
    // Площта = сума от физическата площ (area) на всички договори за месеца
    // Забележка: В договорите няма irrigationNumber - има само 1 ред на договор с физическата площ
    const contractArea = monthContracts.reduce((s, x) => s + x.area, 0)
    // Водата = от всички договорени поливки в хилядни кубици
    // waterCubic е вода за 1 поливка, затова умножаваме по irrigationCount
    const contractWater = monthContracts.reduce((s, x) => s + (x.waterCubic * x.irrigationCount), 0) / 1000

    // DEBUG INFO - ще го допълним след обработка на актовете
    let debugInfo = monthContracts.length > 0
      ? `Договори: ${monthContracts.length} | Area sum: ${contractArea} | Детайли: ${monthContracts.map((c, i) => `#${i+1}:area=${c.area},water=${c.waterCubic},cnt=${c.irrigationCount}`).join(' | ')}`
      : 'Няма договори'

    // Инициализираме данните за всяка категория
    const data: any = {
      month: monthName, // Използваме името на месеца вместо число
      availableArea: 0, // Годни площи - това ще остане празно или ще се попълва ръчно
      contractArea,
      contractWater,
      debugInfo: '', // DEBUG: ще се попълни по-късно
      // ОБЩО ПОЛЯТИ - ще се изчисли от формули
      totalFirstArea: 0,
      totalFirstWater: 0,
      totalPolivodecares: 0,
      totalPolivodecaresWater: 0,
      // ЦАРЕВИЦА
      corn1Area: 0,
      corn1Water: 0,
      corn2Area: 0,
      corn2Water: 0,
      // ТЮТЮН
      tobacco1Area: 0,
      tobacco1Water: 0,
      tobacco2Area: 0,
      tobacco2Water: 0,
      // ЗЕЛЕНЧУЦИ
      vegetables1Area: 0,
      vegetables1Water: 0,
      vegetables2Area: 0,
      vegetables2Water: 0,
      // ТРАЙНИ НАСАЖДЕНИЯ
      perennial1Area: 0,
      perennial1Water: 0,
      perennial2Area: 0,
      perennial2Water: 0,
      // ДРУГИ КУЛТУРИ
      other1Area: 0,
      other1Water: 0,
      other2Area: 0,
      other2Water: 0,
    }

    // Обработваме актовете и ги групираме по култура и поливка
    // Групираме по култура за да преброим поредния номер на поливката
    const actsByCrop: Record<string, any[]> = {}
    monthActs.forEach(act => {
      if (!actsByCrop[act.cropId]) {
        actsByCrop[act.cropId] = []
      }
      actsByCrop[act.cropId].push(act)
    })

    // Обработваме всяка култура
    Object.entries(actsByCrop).forEach(([cropId, acts]) => {
      const cropName = crops.find(c => c.id === cropId)?.name ?? ''
      const category = getCropCategory(cropName)

      if (!category) return // Пропускаме неизвестни култури

      // Обработваме всеки акт според номера на поливката (НЕ по дата!)
      acts.forEach((act) => {
        const area = act.area
        const water = act.waterCubic / 1000 // В хилядни

        // Проверяваме номера на поливката от акта
        const irrigationNumber = act.irrigationNumber
        const isFirstIrrigation = irrigationNumber === '1' || irrigationNumber === 'Първа'

        if (isFirstIrrigation) {
          data[`${category}1Area`] += area
          data[`${category}1Water`] += water
        } else {
          // ІІ поливка и следващи (2, 3, 4... или "Втора", "Трета"...)
          data[`${category}2Area`] += area
          data[`${category}2Water`] += water
        }
      })
    })

    // ОБЩО ПОЛЯТИ - І поливка = сума от всички първи поливки
    data.totalFirstArea = data.corn1Area + data.tobacco1Area + data.vegetables1Area + data.perennial1Area + data.other1Area
    data.totalFirstWater = data.corn1Water + data.tobacco1Water + data.vegetables1Water + data.perennial1Water + data.other1Water

    // ОБЩО ПОЛЯТИ - поливодекари = сума от всички поливки (І + ІІ)
    data.totalPolivodecares = data.totalFirstArea + data.corn2Area + data.tobacco2Area + data.vegetables2Area + data.perennial2Area + data.other2Area
    data.totalPolivodecaresWater = data.totalFirstWater + data.corn2Water + data.tobacco2Water + data.vegetables2Water + data.perennial2Water + data.other2Water

    // DEBUG INFO - добавяме информация за актовете
    if (monthActs.length > 0) {
      debugInfo += ` | Актове: ${monthActs.length} | ` + monthActs.map((a, i) => {
        const cropName = crops.find(c => c.id === a.cropId)?.name ?? '???'
        const category = getCropCategory(cropName)
        return `#${i+1}:crop=${cropName},cat=${category},irr=${a.irrigationNumber},area=${a.area},water=${a.waterCubic}`
      }).join(' | ')
    }
    data.debugInfo = debugInfo

    return data
  })

  // Филтрираме само месеците с данни (договори или актове)
  return monthsData.filter(m =>
    m.contractArea > 0 ||
    m.totalPolivodecares > 0 ||
    m.corn1Area > 0 || m.corn2Area > 0 ||
    m.tobacco1Area > 0 || m.tobacco2Area > 0 ||
    m.vegetables1Area > 0 || m.vegetables2Area > 0 ||
    m.perennial1Area > 0 || m.perennial2Area > 0 ||
    m.other1Area > 0 || m.other2Area > 0
  )
}, [filteredContracts, filteredActs, crops])



// ==========================
// АНАЛИЗ ПО КОНТРАГЕНТИ
// ==========================

const analysisByContractor = useMemo(() => {
  const htuNameOf = (id: string) => htus.find(x => x.id === id)?.htuName ?? '—'

  return contractors.map(contractor => {
    const c = filteredContracts.filter(x => x.contractorId === contractor.id)
    const a = filteredActs.filter(x => x.contractorId === contractor.id)

    // Вземи ХТУ от първия договор или акт
    const htuId = c[0]?.htuId || a[0]?.htuId || ''
    const htuName = htuNameOf(htuId)

    // Договорена площ - сума от всички договори
    const contractedArea = c.reduce((s, x) => s + x.area, 0)

    // Актувана площ - само от първата поливка (физ. дка)
    const firstIrrigationActs = a.filter(act => act.irrigationNumber === '1' || act.irrigationNumber === 'Първа')
    const actualArea = firstIrrigationActs.reduce((s, x) => s + x.area, 0)

    // Договорен обем - сума от всички договори
    const contractedVolume = c.reduce((s, x) => s + x.waterCubic, 0)

    // Реализиран обем - сума от всички актове
    const actualVolume = a.reduce((s, x) => s + x.waterCubic, 0)

    // Договорени бр. поливки - сума от irrigationCount
    const contractedIrrigations = c.reduce((s, x) => s + (x.irrigationCount || 0), 0)

    // Реализирани бр. поливки - уникални номера на поливки
    const uniqueIrrigationNumbers = new Set(
      a.map(act => act.irrigationNumber).filter(Boolean)
    )
    const actualIrrigations = uniqueIrrigationNumbers.size

    return {
      name: contractor.name,
      htuName,
      contractedArea,
      actualArea,
      areaDifference: contractedArea - actualArea,
      contractedVolume,
      actualVolume,
      volumeDifference: contractedVolume - actualVolume,
      contractedIrrigations,
      actualIrrigations,
      irrigationsDifference: contractedIrrigations - actualIrrigations,
    }
  }).filter(x => {
    // Изключваме "дворни места" и контрагенти без данни
    const isDvorniMesta = x.name.toLowerCase().includes('дворни места')
    const hasData = x.contractedArea > 0 || x.actualArea > 0
    return !isDvorniMesta && hasData
  })
}, [contractors, filteredContracts, filteredActs, htus])

// ==========================
// АНАЛИЗ ПО ХТУ
// ==========================

const analysisByHTU = useMemo(()=>{

const htuNameOf = (id: string) => htus.find(x=>x.id===id)?.htuName ?? '—'
const names = [...new Set(htus.map(h=>h.htuName))]

return names.map(name=>{


const c =
filteredContracts.filter(
x=>htuNameOf(x.htuId)===name
)


const a =
filteredActs.filter(
x=>htuNameOf(x.htuId)===name
)



return {

name,


contractCount: countContracts(c),


contractWater:
c.reduce(
(s,x)=>s+x.waterCubic,
0
),

contractArea:
c.reduce(
(s,x)=>s+x.area,
0
),

contractValue:
c.reduce(
(s,x)=>s+x.value,
0
),


actCount:
countActs(a),


actWater:
a.reduce(
(s,x)=>s+x.waterCubic,
0
),


actArea:
a.reduce(
(s,x)=>s+x.area,
0
),


actValue:
a.reduce(
(s,x)=>s+x.value,
0
)

}


}).filter(x=>
x.contractCount ||
x.actCount
)


},[
htus,
filteredContracts,
filteredActs
])





// ==========================
// EXPORT EXCEL
// ==========================

const ANALYSIS_HEADERS = ['Наименование', 'Договори бр.', 'Договорирана площ дка', 'Вода договори м³', 'Стойност договори €', 'Актове бр.', 'Актувана площ дка', 'Актувана вода м³', 'Стойност актове €']
const ANALYSIS_NUMERIC_COLS = ANALYSIS_HEADERS.slice(1)

function analysisRows(data: { name: string; contractCount: number; contractWater: number; contractArea: number; contractValue: number; actCount: number; actWater: number; actArea: number; actValue: number }[]) {
  return data.map(x => ({
    'Наименование': x.name, 'Договори бр.': x.contractCount, 'Договорирана площ дка': x.contractArea,
    'Вода договори м³': x.contractWater, 'Стойност договори €': x.contractValue, 'Актове бр.': x.actCount, 'Актувана площ дка': x.actArea,
    'Актувана вода м³': x.actWater, 'Стойност актове €': x.actValue,
  }))
}

function buildContractRows() {
  return filteredContracts.map(c => {
    const cont = contractors.find(x => x.id === c.contractorId)
    const h = htus.find(x => x.id === c.htuId)
    const crop = crops.find(x => x.id === c.cropId)
    return {
      'Дата': c.date, '№ Договор': c.number, 'Контрагент': cont?.name ?? '', 'ХТУ': h?.htuName ?? '',
      'Култура': crop?.name ?? '', 'Площ дка': c.area, 'Вода м3': c.waterCubic, 'Стойност €': c.value, 'Месец': c.month,
    }
  })
}

function buildActRows() {
  return filteredActs.map(a => {
    const cont = contractors.find(x => x.id === a.contractorId)
    const h = htus.find(x => x.id === a.htuId)
    const crop = crops.find(x => x.id === a.cropId)
    return {
      'Дата': a.date, 'Номер': a.number, 'Контрагент': cont?.name ?? '', 'ХТУ': h?.htuName ?? '',
      'Култура': crop?.name ?? '', 'Площ дка': a.area, 'Вода м3': a.waterCubic, 'Стойност €': a.value, 'Месец': a.month,
    }
  })
}

function reportFilenameFilters() {
  return [
    filterContractor ? contractors.find(c => c.id === filterContractor)?.name ?? null : null,
    filterHTU ? htus.find(h => h.id === filterHTU)?.htuName ?? null : null,
    filterMonth || null,
  ]
}

async function exportExcel() {
  // Ако сме в таб "Отчетност", експортираме само тази таблица
  if (activeTab === 'reporting') {
    const reportingRows = reportingData.map(row => ({
      'Месец': row.month,
      'ПО ДОГОВОР площи дка': num(row.contractArea, 2),
      'ПО ДОГОВОР вод. маси х.м³': num(row.contractWater, 2),
      'І поливка площ дка': num(row.totalFirstArea, 2),
      'І поливка вода х.м³': num(row.totalFirstWater, 2),
      'Поливодекари площ дка': num(row.totalPolivodecares, 2),
      'Поливодекари вода х.м³': num(row.totalPolivodecaresWater, 2),
      'Царевица І площ дка': num(row.corn1Area, 2),
      'Царевица І вода х.м³': num(row.corn1Water, 2),
      'Царевица ІІ площ дка': num(row.corn2Area, 2),
      'Царевица ІІ вода х.м³': num(row.corn2Water, 2),
      'Тютюн І площ дка': num(row.tobacco1Area, 2),
      'Тютюн І вода х.м³': num(row.tobacco1Water, 2),
      'Тютюн ІІ площ дка': num(row.tobacco2Area, 2),
      'Тютюн ІІ вода х.м³': num(row.tobacco2Water, 2),
      'Зеленчуци І площ дка': num(row.vegetables1Area, 2),
      'Зеленчуци І вода х.м³': num(row.vegetables1Water, 2),
      'Зеленчуци ІІ площ дка': num(row.vegetables2Area, 2),
      'Зеленчуци ІІ вода х.м³': num(row.vegetables2Water, 2),
      'Трайни насаждения І площ дка': num(row.perennial1Area, 2),
      'Трайни насаждения І вода х.м³': num(row.perennial1Water, 2),
      'Трайни насаждения ІІ площ дка': num(row.perennial2Area, 2),
      'Трайни насаждения ІІ вода х.м³': num(row.perennial2Water, 2),
      'Други култури І площ дка': num(row.other1Area, 2),
      'Други култури І вода х.м³': num(row.other1Water, 2),
      'Други култури ІІ площ дка': num(row.other2Area, 2),
      'Други култури ІІ вода х.м³': num(row.other2Water, 2),
    }))

    await exportStyledWorkbook([
      {
        sheetName: 'Отчетност',
        headers: Object.keys(reportingRows[0] || {}),
        rows: reportingRows,
        headerColor: '10B981',
        totalColor: 'D1FAE5',
        numericColumns: Object.keys(reportingRows[0] || {}).filter(h => h !== 'Месец'),
      }
    ], exportFilename('Напояване_ХТР_Ямбол_Отчетност', reportFilenameFilters()))
    return
  }

  // За останалите табове експортираме всички анализи
  const contractRows = buildContractRows()
  const actRows = buildActRows()

  const contractorComparisonRows = analysisByContractor.map(x => ({
    'Контрагент': x.name,
    'ХТУ': x.htuName,
    'Договорена площ дка': num(x.contractedArea, 2),
    'Актувана площ физ.дка': num(x.actualArea, 2),
    'Разлика дка': num(x.areaDifference, 2),
    'Договорен обем м³': num(x.contractedVolume, 0),
    'Реализиран обем м³': num(x.actualVolume, 0),
    'Разлика м³': num(x.volumeDifference, 0),
    'Договорени бр. поливки': num(x.contractedIrrigations, 2),
    'Реализирани бр. поливки': num(x.actualIrrigations, 2),
    'Разлика бр.': num(x.irrigationsDifference, 2),
  }))

  await exportStyledWorkbook([
    {
      sheetName: 'Договори', headers: ['Дата', '№ Договор', 'Контрагент', 'ХТУ', 'Култура', 'Площ дка', 'Вода м3', 'Стойност €', 'Месец'], rows: contractRows,
      headerColor: '10B981', totalColor: 'D1FAE5', numericColumns: ['Площ дка', 'Вода м3', 'Стойност €'],
    },
    {
      sheetName: 'Актове', headers: ['Дата', 'Номер', 'Контрагент', 'ХТУ', 'Култура', 'Площ дка', 'Вода м3', 'Стойност €', 'Месец'], rows: actRows,
      headerColor: '3B82F6', totalColor: 'DBEAFE', numericColumns: ['Площ дка', 'Вода м3', 'Стойност €'],
    },
    {
      sheetName: 'Анализ контрагенти',
      headers: ['Контрагент', 'ХТУ', 'Договорена площ дка', 'Актувана площ физ.дка', 'Разлика дка', 'Договорен обем м³', 'Реализиран обем м³', 'Разлика м³', 'Договорени бр. поливки', 'Реализирани бр. поливки', 'Разлика бр.'],
      rows: contractorComparisonRows,
      headerColor: '10B981', totalColor: 'D1FAE5',
      numericColumns: ['Договорена площ дка', 'Актувана площ физ.дка', 'Разлика дка', 'Договорен обем м³', 'Реализиран обем м³', 'Разлика м³', 'Договорени бр. поливки', 'Реализирани бр. поливки', 'Разлика бр.'],
      textColumns: ['Контрагент', 'ХТУ'],
    },
    {
      sheetName: 'Анализ месеци', headers: ANALYSIS_HEADERS, rows: analysisRows(analysisByMonth),
      headerColor: '14B8A6', totalColor: 'CCFBF1', numericColumns: ANALYSIS_NUMERIC_COLS,
    },
    {
      sheetName: 'Анализ култури', headers: ANALYSIS_HEADERS, rows: analysisRows(analysisByCrop),
      headerColor: '3B82F6', totalColor: 'DBEAFE', numericColumns: ANALYSIS_NUMERIC_COLS,
    },
    {
      sheetName: 'Анализ култури по месеци', headers: ANALYSIS_HEADERS, rows: analysisRows(analysisByCropMonth),
      headerColor: 'F59E0B', totalColor: 'FEF3C7', numericColumns: ANALYSIS_NUMERIC_COLS,
    },
    {
      sheetName: 'Анализ ХТУ и култури', headers: ANALYSIS_HEADERS, rows: analysisRows(analysisByHtuCropMonth),
      headerColor: '10B981', totalColor: 'D1FAE5', numericColumns: ANALYSIS_NUMERIC_COLS,
    },
    {
      sheetName: 'Анализ ХТУ', headers: ANALYSIS_HEADERS, rows: analysisRows(analysisByHTU),
      headerColor: '14B8A6', totalColor: 'CCFBF1', numericColumns: ANALYSIS_NUMERIC_COLS,
    },
  ], exportFilename('Напояване_ХТР_Ямбол_Справка', reportFilenameFilters()))
}





// ==========================
// EXPORT PDF
// ==========================

function exportPDF() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  // jsPDF's built-in fonts (Helvetica etc.) only cover Latin/WinAnsi text — Cyrillic renders as
  // garbage without an embedded font that actually has Cyrillic glyphs.
  doc.addFileToVFS('Arial.ttf', ARIAL_FONT_BASE64)
  doc.addFont('Arial.ttf', 'Arial', 'normal')
  doc.addFileToVFS('Arial-Bold.ttf', ARIAL_BOLD_FONT_BASE64)
  doc.addFont('Arial-Bold.ttf', 'Arial', 'bold')
  doc.setFont('Arial')

  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  const title = activeTab === 'reporting' ? 'Напояване ХТР Ямбол - Отчетност' : 'Напояване ХТР Ямбол - Справка'
  doc.text(title, 14, y)
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(new Intl.DateTimeFormat('bg-BG', { dateStyle: 'long' }).format(new Date()), 14, y)
  doc.setTextColor(0)
  y += 8

  function addTable(title: string, head: string[], body: (string | number)[][], color: [number, number, number]) {
    if (y > pageHeight - 40) { doc.addPage(); y = 15 }
    doc.setFontSize(11)
    doc.setFont('Arial', 'bold')
    doc.text(title, 14, y)
    doc.setFont('Arial', 'normal')
    autoTable(doc, {
      startY: y + 3,
      head: [head],
      body,
      margin: { left: 14, right: 14 },
      styles: { font: 'Arial', fontSize: 8, cellPadding: 2 },
      headStyles: { font: 'Arial', fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      tableWidth: pageWidth - 28,
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  const EMERALD: [number, number, number] = [16, 185, 129]
  const BLUE: [number, number, number] = [59, 130, 246]
  const TEAL: [number, number, number] = [20, 184, 166]
  const AMBER: [number, number, number] = [245, 158, 11]

  // Ако сме в таб "Отчетност", експортираме само тази таблица
  if (activeTab === 'reporting') {
    const reportingHeaders = ['Месец', 'ПО ДОГОВОР дка', 'ПО ДОГОВОР х.м³', 'І поливка дка', 'І поливка х.м³', 'Поливодекари дка', 'Поливодекари х.м³']
    const reportingBody = reportingData.map(row => [
      row.month,
      num(row.contractArea, 2),
      num(row.contractWater, 2),
      num(row.totalFirstArea, 2),
      num(row.totalFirstWater, 2),
      num(row.totalPolivodecares, 2),
      num(row.totalPolivodecaresWater, 2),
    ])

    addTable('Отчетност по месеци', reportingHeaders, reportingBody, EMERALD)

    const pdfOutput = doc.output('arraybuffer')
    const blob = new Blob([pdfOutput], { type: 'application/pdf' })
    downloadBlob(blob, exportFilename('Напояване_ХТР_Ямбол_Отчетност', reportFilenameFilters(), 'pdf'))
    return
  }

  // За останалите табове експортираме всички анализи
  addTable('Обобщение', ['Показател', 'Стойност'], [
    ['Договори', String(countContracts(filteredContracts))],
    ['Актове', String(countActs(filteredActs))],
    ['Вода договори', `${num(totalWaterContracts, 0)} м³`],
    ['Вода актове', `${num(totalWaterActs, 0)} м³`],
    ['Стойност договори', `${num(totalValueContracts, 2)} €`],
    ['Стойност актове', `${num(totalValueActs, 2)} €`],
  ], TEAL)

  const contractHead = ['Дата', '№ Договор', 'Контрагент', 'ХТУ', 'Култура', 'Площ дка', 'Вода м3', 'Стойност €', 'Месец']
  addTable('Договори', contractHead, buildContractRows().map(r => contractHead.map(h => (r as Record<string, unknown>)[h] as string | number)), EMERALD)

  const actHead = ['Дата', 'Номер', 'Контрагент', 'ХТУ', 'Култура', 'Площ дка', 'Вода м3', 'Стойност €', 'Месец']
  addTable('Актове', actHead, buildActRows().map(r => actHead.map(h => (r as Record<string, unknown>)[h] as string | number)), BLUE)

  const toBody = (rows: ReturnType<typeof analysisRows>) => rows.map(r => ANALYSIS_HEADERS.map(h => (r as Record<string, unknown>)[h] as string | number))

  const CONTRACTOR_HEADERS = ['Контрагент', 'ХТУ', 'Договорена площ дка', 'Актувана площ физ.дка', 'Разлика дка', 'Договорен обем м³', 'Реализиран обем м³', 'Разлика м³', 'Договорени бр. поливки', 'Реализирани бр. поливки', 'Разлика бр.']
  const contractorBody = analysisByContractor.map(x => [
    x.name,
    x.htuName,
    num(x.contractedArea, 2),
    num(x.actualArea, 2),
    num(x.areaDifference, 2),
    num(x.contractedVolume, 0),
    num(x.actualVolume, 0),
    num(x.volumeDifference, 0),
    num(x.contractedIrrigations, 2),
    num(x.actualIrrigations, 2),
    num(x.irrigationsDifference, 2),
  ])

  addTable('Анализ по контрагенти', CONTRACTOR_HEADERS, contractorBody, EMERALD)
  addTable('Анализ по месеци', ANALYSIS_HEADERS, toBody(analysisRows(analysisByMonth)), TEAL)
  addTable('Анализ по култури', ANALYSIS_HEADERS, toBody(analysisRows(analysisByCrop)), BLUE)
  addTable('Анализ по култури по месеци', ANALYSIS_HEADERS, toBody(analysisRows(analysisByCropMonth)), AMBER)
  addTable('Анализ по ХТУ и култури по месеци', ANALYSIS_HEADERS, toBody(analysisRows(analysisByHtuCropMonth)), EMERALD)
  addTable('Анализ по ХТУ', ANALYSIS_HEADERS, toBody(analysisRows(analysisByHTU)), TEAL)

  const pdfOutput = doc.output('arraybuffer')
  const blob = new Blob([pdfOutput], { type: 'application/pdf' })
  downloadBlob(blob, exportFilename('Напояване_ХТР_Ямбол', reportFilenameFilters(), 'pdf'))
}




const tabs = [

{
id:'overview',
label:'Обзор'
},

{
id:'analysis',
label:'Анализи'
},

{
id:'reporting',
label:'Отчетност'
},

{
id:'seasons',
label:'Сравнителен анализ'
}

] as const
return (

<div>

<PageHeader

title="Справки"

actions={

<>

<Btn
variant="secondary"
onClick={exportPDF}
>
<ExportIcon /> PDF
</Btn>


<Btn
variant="secondary"
onClick={exportExcel}
>
<ExportIcon /> Excel
</Btn>

</>

}

/>



<Card className="p-4 mb-6">

<div className="flex gap-4 items-end flex-wrap">


<div className="flex flex-col gap-1">

<label className="text-xs text-gray-500">
Контрагент
</label>

<div className="w-52">
<Combobox
value={filterContractor}
onChange={setFilterContractor}
options={contractors.map(c => ({ id: c.id, label: c.name }))}
placeholder="Търсене по контрагент..."
/>
</div>

</div>




<div className="flex flex-col gap-1">

<label className="text-xs text-gray-500">
ХТУ
</label>


<Select
value={filterHTU}
onChange={e=>setFilterHTU(e.target.value)}
className="w-48"
>

<option value="">
Всички
</option>


{[...new Set(htus.map(h=>h.htuName))].map(name=>(

<option
key={name}
value={name}
>
{name}
</option>

))}

</Select>

</div>




<div className="flex flex-col gap-1">

<label className="text-xs text-gray-500">
Месец
</label>


<Select
value={filterMonth}
onChange={e=>setFilterMonth(e.target.value)}
className="w-36"
>

<option value="">
Всички
</option>


{MONTHS.map(m=>(

<option
key={m}
value={m}
>
{m}
</option>

))}


</Select>


</div>



</div>

</Card>





<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">


<StatCard
label="Договори"
value={countContracts(filteredContracts)}
sub={`Площ ${num(totalArea,2)} дка`}
color="teal"
/>


<StatCard
label="Договорирана вода"
value={`${num(totalWaterContracts,0)} м³`}
sub="Количество по договори"
color="blue"
/>


<StatCard
label="Стойност договори"
value={`${num(totalValueContracts,2)} €`}
color="emerald"
/>


<StatCard
label="Актувана стойност"
value={`${num(totalValueActs,2)} €`}
sub={`${countActs(filteredActs)} акта`}
color="amber"
/>


</div>





<div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">


{tabs.map(t=>(

<button

key={t.id}

onClick={()=>setActiveTab(t.id)}

className={

`px-5 py-2 rounded-lg text-sm font-medium ${
activeTab===t.id
?
'bg-white text-teal-700 shadow'
:
'text-gray-600'
}`

}

>

{t.label}

</button>

))}



</div>





{activeTab==='analysis' && (

<div className="space-y-6">



<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по месеци
</h3>


<AnalysisTable
data={analysisByMonth}
color="teal"
sumCounts={true}
/>


</Card>





<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по култури
</h3>


<AnalysisTable
data={analysisByCrop}
color="blue"
/>


</Card>




<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по култури по месеци
</h3>


<CropMonthAnalysisTable
data={analysisByCropMonth}
color="amber"
/>


</Card>




<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по ХТУ и култури по месеци
</h3>


<AnalysisTable
data={analysisByHtuCropMonth}
color="emerald"
showTotals={true}
sumCounts={false}
showHtuMonth={true}
/>


</Card>





<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по ХТУ
</h3>


<AnalysisTable
data={analysisByHTU}
color="teal"
sumCounts={true}
/>


</Card>



<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по контрагенти (Договорено срещу Реализирано)
</h3>


<ContractorComparisonTable
data={analysisByContractor}
color="emerald"
/>


</Card>



</div>

)}



{activeTab==='reporting' && (

<div className="space-y-6">


<Card className="p-5">

<h3 className="font-semibold mb-4">
Отчетност по месеци
</h3>

<ReportingTable
data={reportingData}
/>


</Card>


</div>

)}



{activeTab==='overview' && (

<Card className="p-5">

<h3 className="font-semibold mb-4">
Обобщение
{filterContractor && (() => {
  const contractor = contractors.find(c => c.id === filterContractor)
  return contractor ? <span className="text-sm font-normal text-gray-600 ml-2">— {contractor.name}</span> : null
})()}
</h3>

<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
  <button
    onClick={() => {
      if (!filterContractor) {
        alert('Моля, изберете контрагент от полето за търсене за да филтрирате')
        return
      }
      onNavigate?.('contracts', filterContractor)
    }}
    className="rounded-xl p-4 bg-gradient-to-br from-amber-400 to-amber-500 text-white text-left transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer"
  >
    <p className="text-xs text-amber-50">Договори{filterContractor && ' →'}</p>
    <p className="mt-1 text-xl font-semibold">{countContracts(filteredContracts)}</p>
    {filterContractor && <p className="text-xs text-amber-100 mt-1">Кликни за филтриране</p>}
  </button>
  <div className="rounded-xl p-4 bg-gradient-to-br from-teal-500 to-teal-600 text-white">
    <p className="text-xs text-teal-50">Площ договори</p>
    <p className="mt-1 text-xl font-semibold">{num(totalArea, 2)} дка</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-teal-500 to-teal-600 text-white">
    <p className="text-xs text-teal-50">Договорирана вода</p>
    <p className="mt-1 text-xl font-semibold">{num(totalWaterContracts, 0)} м³</p>
  </div>
  <button
    onClick={() => {
      if (!filterContractor) {
        alert('Моля, изберете контрагент от полето за търсене за да филтрирате')
        return
      }
      onNavigate?.('acts', filterContractor)
    }}
    className="rounded-xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-left transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer"
  >
    <p className="text-xs text-emerald-50">Актове{filterContractor && ' →'}</p>
    <p className="mt-1 text-xl font-semibold">{countActs(filteredActs)}</p>
    {filterContractor && <p className="text-xs text-emerald-100 mt-1">Кликни за филтриране</p>}
  </button>
  <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
    <p className="text-xs text-blue-50">Площ актове</p>
    <p className="mt-1 text-base font-semibold">Поливодекари</p>
    <p className="text-xl font-semibold">{num(totalActArea, 2)} дка</p>
    <p className="mt-1 text-base font-semibold">физ. дка</p>
    <p className="text-xl font-semibold">{num(totalActAreaFirstIrrigation, 2)} дка</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
    <p className="text-xs text-blue-50">Актувана вода</p>
    <p className="mt-1 text-xl font-semibold">{num(totalWaterActs, 0)} м³</p>
  </div>
</div>

</Card>

)}

{activeTab==='seasons' && (

<div className="space-y-6">

{seasonArchives.length === 0 ? (
  <Card className="p-12">
    <div className="text-center text-gray-500">
      <p className="text-lg font-medium mb-2">Няма архивирани сезони</p>
      <p className="text-sm">Отидете в Настройки за да архивирате текущия сезон след приключване на декември месец.</p>
    </div>
  </Card>
) : (
  <>
    <Card className="p-5">
      <h3 className="font-semibold mb-4">Сравнителен анализ по сезони</h3>
      <p className="text-sm text-gray-600 mb-4">
        Сравнение между текущия сезон и архивирани сезони по основни показатели.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left p-3 font-semibold text-gray-700">Показател</th>
              <th className="text-right p-3 font-semibold text-emerald-700">Текущ сезон</th>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <th key={archive.id} className="text-right p-3 font-semibold text-gray-700">
                  Сезон {archive.seasonYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="p-3 text-gray-700">Брой договори</td>
              <td className="p-3 text-right font-medium text-emerald-600">{contracts.length}</td>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <td key={archive.id} className="p-3 text-right text-gray-600">{archive.contracts.length}</td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-3 text-gray-700">Брой актове</td>
              <td className="p-3 text-right font-medium text-emerald-600">{acts.length}</td>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <td key={archive.id} className="p-3 text-right text-gray-600">{archive.acts.length}</td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-3 text-gray-700">Обща площ (дка)</td>
              <td className="p-3 text-right font-medium text-emerald-600">
                {num(contracts.reduce((sum, c) => sum + c.area, 0), 2)}
              </td>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <td key={archive.id} className="p-3 text-right text-gray-600">
                  {num(archive.contracts.reduce((sum: number, c) => sum + c.area, 0), 2)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-3 text-gray-700">Обем вода (х.м³)</td>
              <td className="p-3 text-right font-medium text-emerald-600">
                {num(contracts.reduce((sum, c) => sum + c.waterCubic, 0) / 1000, 2)}
              </td>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <td key={archive.id} className="p-3 text-right text-gray-600">
                  {num(archive.contracts.reduce((sum: number, c) => sum + c.waterCubic, 0) / 1000, 2)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-3 text-gray-700">Обща стойност (€)</td>
              <td className="p-3 text-right font-medium text-emerald-600">
                {num(contracts.reduce((sum, c) => sum + c.value, 0), 2)}
              </td>
              {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                <td key={archive.id} className="p-3 text-right text-gray-600">
                  {num(archive.contracts.reduce((sum: number, c) => sum + c.value, 0), 2)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="p-5">
      <h3 className="font-semibold mb-4">Детайлна информация за архивирани сезони</h3>
      <div className="space-y-4">
        {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
          <div key={archive.id} className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">Сезон {archive.seasonYear}</h4>
              <span className="text-xs text-gray-500">
                Архивиран на {new Date(archive.archivedDate).toLocaleDateString('bg-BG')}
              </span>
            </div>
            {archive.notes && (
              <p className="text-sm text-gray-600 mb-3">{archive.notes}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Договори:</span>
                <span className="ml-2 font-medium">{archive.contracts.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Актове:</span>
                <span className="ml-2 font-medium">{archive.acts.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Заявки:</span>
                <span className="ml-2 font-medium">{archive.requests.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Плащания:</span>
                <span className="ml-2 font-medium">{archive.payments.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </>
)}

</div>

)}








</div>

)

}