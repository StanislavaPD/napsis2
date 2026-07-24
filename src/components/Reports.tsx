import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { PageHeader, StatCard, Card, Select, Btn, num, ExportIcon } from './ui'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'

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

      <table className="w-full text-sm whitespace-nowrap">

        <thead>
          <tr className={`bg-gradient-to-br ${ANALYSIS_COLORS[color]}`}>

            {[
              'Наименование',
              'Договори бр.',
              'Вода договори м³',
              'Стойност договори €',
              'Актове бр.',
              'Актувана вода м³',
              'Актувана площ дка',
              'Стойност актове €'
            ].map(h => (

              <th
                key={h}
                className="text-left px-3 py-3 text-xs font-semibold text-white"
              >
                {h}
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

              <td className="px-3 py-2 font-medium">
                {x.name}
              </td>

              <td className="px-3 py-2">
                {x.contractCount}
              </td>

              <td className="px-3 py-2">
                {num(x.contractWater, 0)}
              </td>

              <td className="px-3 py-2">
                {num(x.contractValue, 2)}
              </td>

              <td className="px-3 py-2">
                {x.actCount}
              </td>

              <td className="px-3 py-2">
                {num(x.actWater, 0)}
              </td>

              <td className="px-3 py-2">
                {num(x.actArea, 2)}
              </td>

              <td className="px-3 py-2">
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



const filteredContracts = useMemo(()=>{

return contracts.filter(c =>

(!filterContractor ||
c.contractorId === filterContractor)

&&

(!filterHTU ||
c.htuId === filterHTU)

&&

(!filterMonth ||
c.month === filterMonth)

)

},[
contracts,
filterContractor,
filterHTU,
filterMonth
])



const filteredActs = useMemo(()=>{

return acts.filter(a =>

(!filterContractor ||
a.contractorId === filterContractor)

&&

(!filterHTU ||
a.htuId === filterHTU)

&&

(!filterMonth ||
a.month === filterMonth)

)

},[
acts,
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


contractCount:c.length,

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


actCount:a.length,

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


contractCount:
c.length,


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
contractCount: c.length,
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

const keys = new Set<string>()

filteredContracts.forEach(c=>keys.add(`${c.htuId}|${c.cropId}|${c.month}`))
filteredActs.forEach(a=>keys.add(`${a.htuId}|${a.cropId}|${a.month}`))

const rows = [...keys].map(key=>{

const [htuId,cropId,month] = key.split('|')
const htuName = htus.find(x=>x.id===htuId)?.htuName ?? '—'
const cropName = crops.find(x=>x.id===cropId)?.name ?? '—'

const c = filteredContracts.filter(x=>x.htuId===htuId && x.cropId===cropId && x.month===month)
const a = filteredActs.filter(x=>x.htuId===htuId && x.cropId===cropId && x.month===month)

return {
name: `${htuName} / ${cropName} — ${month || 'без месец'}`,
sortKey: `${htuName} / ${cropName}`,
sortMonth: MONTHS.indexOf(month),
contractCount: c.length,
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

return htus.map(htu=>{


const c =
filteredContracts.filter(
x=>x.htuId===htu.id
)


const a =
filteredActs.filter(
x=>x.htuId===htu.id
)



return {

name:htu.htuName,


contractCount:
c.length,


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
htus,
filteredContracts,
filteredActs
])





// ==========================
// EXPORT EXCEL
// ==========================

function exportExcel(){


const wb =
XLSX.utils.book_new()



const contractRows =
filteredContracts.map(c=>{

const cont =
contractors.find(
x=>x.id===c.contractorId
)

const h =
htus.find(
x=>x.id===c.htuId
)

const crop =
crops.find(
x=>x.id===c.cropId
)


return {

'Дата':c.date,

'№ Договор':
c.number,

'Контрагент':
cont?.name ?? '',

'ХТУ':
h?.htuName ?? '',

'Култура':
crop?.name ?? '',

'Площ дка':
c.area,

'Вода м3':
c.waterCubic,

'Стойност €':
c.value,

'Месец':
c.month

}

})



XLSX.utils.book_append_sheet(
wb,
XLSX.utils.json_to_sheet(contractRows),
'Договори'
)




const actRows =
filteredActs.map(a=>{


const cont =
contractors.find(
x=>x.id===a.contractorId
)

const h =
htus.find(
x=>x.id===a.htuId
)

const crop =
crops.find(
x=>x.id===a.cropId
)



return {

'Дата':
a.date,

'Номер':
a.number,

'Контрагент':
cont?.name ?? '',

'ХТУ':
h?.htuName ?? '',

'Култура':
crop?.name ?? '',

'Площ дка':
a.area,

'Вода м3':
a.waterCubic,

'Стойност €':
a.value,

'Месец':
a.month

}

})



XLSX.utils.book_append_sheet(
wb,
XLSX.utils.json_to_sheet(actRows),
'Актове'
)



// Анализи

XLSX.utils.book_append_sheet(
wb,
XLSX.utils.json_to_sheet(analysisByMonth),
'Анализ месеци'
)


XLSX.utils.book_append_sheet(
wb,
XLSX.utils.json_to_sheet(analysisByCrop),
'Анализ култури'
)


XLSX.utils.book_append_sheet(
wb,
XLSX.utils.json_to_sheet(analysisByHTU),
'Анализ ХТУ'
)



XLSX.writeFile(
wb,
`Напояване_ХТР_Ямбол_Справка_${new Date().toISOString().slice(0,10)}.xlsx`
)


}





// ==========================
// EXPORT PDF
// ==========================

function exportPDF(){


const doc =
new jsPDF({
orientation:'landscape',
unit:'mm',
format:'a4'
})


doc.setFontSize(16)

doc.text(
'Напояване ХТР Ямбол - Справка',
14,
15
)


doc.setFontSize(10)


doc.text(
`Договори: ${filteredContracts.length}`,
14,
25
)


doc.text(
`Актове: ${filteredActs.length}`,
14,
32
)


doc.text(
`Вода договори: ${num(totalWaterContracts,0)} м3`,
14,
39
)


doc.text(
`Вода актове: ${num(totalWaterActs,0)} м3`,
14,
46
)


doc.text(
`Стойност договори: ${num(totalValueContracts,2)} €`,
14,
53
)


doc.text(
`Стойност актове: ${num(totalValueActs,2)} €`,
14,
60
)


doc.save(
`Напояване_ХТР_Ямбол_${new Date().toISOString().slice(0,10)}.pdf`
)


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


<Select
value={filterContractor}
onChange={e=>setFilterContractor(e.target.value)}
className="w-52"
>

<option value="">
Всички
</option>


{contractors.map(c=>(

<option
key={c.id}
value={c.id}
>
{c.name}
</option>

))}

</Select>

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


{htus.map(h=>(

<option
key={h.id}
value={h.id}
>
{h.htuName}
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
value={filteredContracts.length}
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
sub={`${filteredActs.length} акта`}
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


<div className="grid grid-cols-2 gap-4">


<div>
Договорирана вода:
<b>
{num(totalWaterContracts,0)} м³
</b>
</div>


<div>
Актувана вода:
<b>
{num(totalWaterActs,0)} м³
</b>
</div>


<div>
Договори:
<b>
{filteredContracts.length}
</b>
</div>


<div>
Актове:
<b>
{filteredActs.length}
</b>
</div>


<div>
Площ договори:
<b>
{num(totalArea,2)} дка
</b>
</div>


<div>
Площ актове:
<b>
{num(totalActArea,2)} дка
</b>
</div>


</div>


</Card>

)}










</div>

)

}