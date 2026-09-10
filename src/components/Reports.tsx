import React, { useState, useMemo } from 'react'
import { useStore } from '../store'
import { PageHeader, StatCard, Card, Select, Input, Btn, num, ExportIcon } from './ui'
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

function AnalysisTable({ data, color = 'teal' }: { data: any[]; color?: keyof typeof ANALYSIS_COLORS }) {

  return (
    <div className="overflow-x-auto">

      <table className="w-full text-sm">

        <thead>
          <tr className={`bg-gradient-to-br ${ANALYSIS_COLORS[color]}`}>

            {([
              ['Наименование', 'Наименование'],
              [<>Договори<br/>бр.</>, 'Договори бр.'],
              [<>Вода<br/>договори<br/>м³</>, 'Вода договори м³'],
              [<>Стойност<br/>договори €</>, 'Стойност договори €'],
              [<>Актове<br/>бр.</>, 'Актове бр.'],
              [<>Актувана<br/>вода м³</>, 'Актувана вода м³'],
              [<>Актувана<br/>площ дка</>, 'Актувана площ дка'],
              [<>Стойност<br/>актове €</>, 'Стойност актове €'],
            ] as [React.ReactNode, string][]).map(([label, key], idx) => (

              <th
                key={key}
                className={`${idx === 0 ? 'text-left' : 'text-center'} px-3 py-3 text-xs font-semibold text-white leading-tight`}
              >
                {label}
              </th>

            ))}

          </tr>
        </thead>


        <tbody>

          {data.map((x, i) => (

            <tr
              key={x.name}
              className={`border-b border-gray-50 ${
                i % 2 === 0 ? '' : 'bg-gray-50/40'
              }`}
            >

              <td className="px-3 py-2 font-medium text-left">
                {x.name}
              </td>

              <td className="px-3 py-2 text-center">
                {x.contractCount}
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
                {num(x.actWater, 0)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.actArea, 2)}
              </td>

              <td className="px-3 py-2 text-center">
                {num(x.actValue, 2)}
              </td>

            </tr>

          ))}


        </tbody>

      </table>

    </div>
  )
}



export default function Reports() {


const {
  contracts,
  acts,
  contractors,
  htus,
  crops
} = useStore()



const [filterContractor,setFilterContractor] = useState('')
const [filterHTU,setFilterHTU] = useState('')
const [filterMonth,setFilterMonth] = useState('')

const [activeTab,setActiveTab] =
useState<
'overview' |
'analysis'
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

const contractorName = contractors.find(x=>x.id===a.contractorId)?.name.toLowerCase() ?? ''
const htuName = htus.find(h=>h.id===a.htuId)?.htuName ?? ''

return (
(!contractorQuery ||
contractorName.includes(contractorQuery))

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
contractors,
htus,
contractorQuery,
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
name: `${cropName} — ${month || 'без месец'}`,
sortCrop: cropName,
sortMonth: MONTHS.indexOf(month),
contractCount: countContracts(c),
contractWater: c.reduce((s,x)=>s+x.waterCubic,0),
contractValue: c.reduce((s,x)=>s+x.value,0),
actCount: a.length,
actWater: a.reduce((s,x)=>s+x.waterCubic,0),
actArea: a.reduce((s,x)=>s+x.area,0),
actValue: a.reduce((s,x)=>s+x.value,0),
}

}).filter(x=>x.contractCount || x.actCount)

rows.sort((x,y)=> x.sortCrop.localeCompare(y.sortCrop,'bg') || x.sortMonth - y.sortMonth)

const total = {
name: 'Общо за всички месеци',
contractCount: rows.reduce((s,x)=>s+x.contractCount,0),
contractWater: rows.reduce((s,x)=>s+x.contractWater,0),
contractValue: rows.reduce((s,x)=>s+x.contractValue,0),
actCount: rows.reduce((s,x)=>s+x.actCount,0),
actWater: rows.reduce((s,x)=>s+x.actWater,0),
actArea: rows.reduce((s,x)=>s+x.actArea,0),
actValue: rows.reduce((s,x)=>s+x.actValue,0),
}

return [...rows, total]

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
name: `${htuName} / ${cropName} — ${month || 'без месец'}`,
sortKey: `${htuName} / ${cropName}`,
sortMonth: MONTHS.indexOf(month),
contractCount: countContracts(c),
contractWater: c.reduce((s,x)=>s+x.waterCubic,0),
contractValue: c.reduce((s,x)=>s+x.value,0),
actCount: a.length,
actWater: a.reduce((s,x)=>s+x.waterCubic,0),
actArea: a.reduce((s,x)=>s+x.area,0),
actValue: a.reduce((s,x)=>s+x.value,0),
}

}).filter(x=>x.contractCount || x.actCount)

rows.sort((x,y)=> x.sortKey.localeCompare(y.sortKey,'bg') || x.sortMonth - y.sortMonth)

const total = {
name: 'Общо за всички месеци',
contractCount: rows.reduce((s,x)=>s+x.contractCount,0),
contractWater: rows.reduce((s,x)=>s+x.contractWater,0),
contractValue: rows.reduce((s,x)=>s+x.contractValue,0),
actCount: rows.reduce((s,x)=>s+x.actCount,0),
actWater: rows.reduce((s,x)=>s+x.actWater,0),
actArea: rows.reduce((s,x)=>s+x.actArea,0),
actValue: rows.reduce((s,x)=>s+x.actValue,0),
}

return [...rows, total]

},[
htus,
crops,
filteredContracts,
filteredActs
])




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

const ANALYSIS_HEADERS = ['Наименование', 'Договори бр.', 'Вода договори м³', 'Стойност договори €', 'Актове бр.', 'Актувана вода м³', 'Актувана площ дка', 'Стойност актове €']
const ANALYSIS_NUMERIC_COLS = ANALYSIS_HEADERS.slice(1)

function analysisRows(data: { name: string; contractCount: number; contractWater: number; contractValue: number; actCount: number; actWater: number; actArea: number; actValue: number }[]) {
  return data.map(x => ({
    'Наименование': x.name, 'Договори бр.': x.contractCount, 'Вода договори м³': x.contractWater,
    'Стойност договори €': x.contractValue, 'Актове бр.': x.actCount, 'Актувана вода м³': x.actWater,
    'Актувана площ дка': x.actArea, 'Стойност актове €': x.actValue,
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
  const contractRows = buildContractRows()
  const actRows = buildActRows()

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
  doc.text('Напояване ХТР Ямбол - Справка', 14, y)
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


<Input
value={filterContractor}
onChange={e=>setFilterContractor(e.target.value)}
placeholder="Търсене по контрагент..."
className="w-52"
/>

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


<AnalysisTable
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
/>


</Card>





<Card className="p-5">

<h3 className="font-semibold mb-4">
Анализ по ХТУ
</h3>


<AnalysisTable
data={analysisByHTU}
color="teal"
/>


</Card>



</div>

)}





{activeTab==='overview' && (

<Card className="p-5">

<h3 className="font-semibold mb-4">
Обобщение
</h3>

<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
  <div className="rounded-xl p-4 bg-gradient-to-br from-teal-500 to-teal-600 text-white">
    <p className="text-xs text-teal-50">Договорирана вода</p>
    <p className="mt-1 text-xl font-semibold">{num(totalWaterContracts, 0)} м³</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
    <p className="text-xs text-blue-50">Актувана вода</p>
    <p className="mt-1 text-xl font-semibold">{num(totalWaterActs, 0)} м³</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-amber-400 to-amber-500 text-white">
    <p className="text-xs text-amber-50">Договори</p>
    <p className="mt-1 text-xl font-semibold">{countContracts(filteredContracts)}</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
    <p className="text-xs text-emerald-50">Актове</p>
    <p className="mt-1 text-xl font-semibold">{countActs(filteredActs)}</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-teal-500 to-teal-600 text-white">
    <p className="text-xs text-teal-50">Площ договори</p>
    <p className="mt-1 text-xl font-semibold">{num(totalArea, 2)} дка</p>
  </div>
  <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
    <p className="text-xs text-blue-50">Площ актове</p>
    <p className="mt-1 text-xl font-semibold">{num(totalActArea, 2)} дка</p>
  </div>
</div>

</Card>

)}










</div>

)

}