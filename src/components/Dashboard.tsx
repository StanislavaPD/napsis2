import { useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Module } from '../types'
import { PageHeader, StatCard, Card, num } from './ui'
import { namesMatch } from '../lib/spreadsheet'
import { countContracts, countActs } from '../lib/acts'

function fmtNumber(n: number) {
  return n.toLocaleString('bg-BG')
}

function currentMonthLabel() {
  const now = new Date()
  return new Intl.DateTimeFormat('bg-BG', { month: 'long', year: 'numeric' }).format(now)
}

export default function Dashboard({ onNavigate }: { onNavigate: (m: Module) => void }) {
  const { contracts, acts, contractors, crops, htus, payments } = useStore()
  const { username } = useAuth()

  const stats = useMemo(() => {
    const contractedWater = contracts.reduce((sum, c) => sum + (c.waterCubic || 0), 0)
    const deliveredWater = acts.reduce((sum, a) => sum + (a.waterCubic || 0), 0)
    const monthNames = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
    const currentMonth = monthNames[new Date().getMonth()]
    const monthCost = contracts
      .filter(c => c.month === currentMonth)
      .reduce((sum, c) => sum + (c.value || 0), 0)
    const unpaid = payments.filter(p => !p.paid)

    return {
      activeContracts: countContracts(contracts),
      contractedWater,
      deliveredWater,
      pendingActs: countActs(acts),
      monthCost,
      unpaidCount: unpaid.length,
      unpaidValue: unpaid.reduce((sum, p) => sum + (p.amount || 0), 0),
    }
  }, [contracts, acts, payments])

  // Per contract, how much of the contracted area still has no matching act (same contractor +
  // crop + ХТУ) — summed per contractor+crop, so "Иван Стоянов — Царевица: 10 дка нямат първа
  // поливка все още" shows up as one line per contractor+crop with outstanding area.
  //
  // Matched by ХТУ *name*, not by the raw htuId: one ХТУ can have several съоражения (rows sharing
  // the same htuName but a different id), and an act is often logged against a different съоражение
  // row than the contract it fulfills. Matching on the exact id made those acts invisible to this
  // calculation, so contracts that already had acts recorded against them still showed up as fully
  // un-acted.
  //
  // Crop match is exact id OR name-similar (e.g. an act logged under "Други зеленчуци" still covers
  // a contract for "Зеленчуци") — operators don't always log the act under the exact same crop entry
  // as the contract, and that shouldn't make an already-acted contract look un-acted.
  const unactedByContractor = useMemo(() => {
    const htuName = (id: string) => htus.find(h => h.id === id)?.htuName ?? id
    const cropName = (id: string) => crops.find(c => c.id === id)?.name ?? id
    const remaining = new Map<string, { contractorId: string; cropId: string; area: number }>()
    contracts.forEach(c => {
      const acted = acts
        .filter(a => a.contractorId === c.contractorId && htuName(a.htuId) === htuName(c.htuId) &&
          (a.cropId === c.cropId || namesMatch(cropName(a.cropId), cropName(c.cropId))))
        .reduce((sum, a) => sum + (a.area || 0), 0)
      const left = Math.max(0, (c.area || 0) - acted)
      if (left > 0) {
        const key = `${c.contractorId}|${c.cropId}`
        const existing = remaining.get(key)
        remaining.set(key, { contractorId: c.contractorId, cropId: c.cropId, area: (existing?.area ?? 0) + left })
      }
    })
    return [...remaining.values()]
      .map(({ contractorId, cropId, area }) => ({
        key: `${contractorId}|${cropId}`,
        name: contractors.find(c => c.id === contractorId)?.name ?? '—',
        cropName: crops.find(c => c.id === cropId)?.name ?? '—',
        area,
      }))
      .sort((a, b) => b.area - a.area)
  }, [contracts, acts, contractors, crops, htus])

  const contractsByHtu = useMemo(() =>
    htus
      .map(h => ({ name: h.htuName, count: countContracts(contracts.filter(c => c.htuId === h.id)) }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count),
    [htus, contracts]
  )

  const latestContracts = [...contracts].slice(-3).reverse()

  return (
    <div>
      <PageHeader
        title={`Добър ден, ${username ?? 'оператор'}!`}
        subtitle={`Обобщение на поливния сезон · ${currentMonthLabel()}`}
      />

      {unactedByContractor.length > 0 && (
        <Card className="p-4 mb-6 border-l-4 border-l-amber-400 bg-amber-50/50">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">⚠ Договорирана площ без актуване</h2>
          <ul className="space-y-1">
            {unactedByContractor.map(item => (
              <li key={item.key} className="text-sm text-amber-900">
                <span className="font-medium">{item.name}</span> — {item.cropName}: {num(item.area, 2)} дка все още нямат актувана поливка
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard label="Активни договори" value={fmtNumber(stats.activeContracts)} color="teal" />
        <StatCard label="Договорирана вода" value={`${fmtNumber(stats.contractedWater)} м³`} color="blue" />
        <StatCard label="Подадена вода" value={`${fmtNumber(stats.deliveredWater)} м³`} color="emerald" />
        <StatCard label="Актове бр." value={fmtNumber(stats.pendingActs)} color="amber" />
        <StatCard label="Неплатени фактури" value={fmtNumber(stats.unpaidCount)} sub={`${num(stats.unpaidValue, 2)} € дължими`} color="amber" />
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
            <h2 className="text-base font-semibold text-gray-900">Активни договори</h2>
            <button
              onClick={() => onNavigate('contracts')}
              className="rounded-lg bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 whitespace-nowrap"
            >
              Виж всички
            </button>
          </div>

          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Договор', 'Контрагент', 'Култура', 'Стойност'].map(h => (
                    <th key={h} className="text-left px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestContracts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 sm:px-4 py-6 sm:py-8 text-center text-sm sm:text-base text-gray-400">Все още няма договори.</td>
                  </tr>
                ) : (
                  latestContracts.map((item, idx) => {
                    const contractor = contractors.find(c => c.id === item.contractorId)
                    const crop = crops.find(c => c.id === item.cropId)
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-gray-900 text-xs sm:text-sm">{item.number}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm">{contractor?.name ?? '—'}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 text-xs sm:text-sm">{crop?.name ?? '—'}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-teal-700 text-xs sm:text-sm">{fmtNumber(Math.round(item.value))} €</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {contractsByHtu.length > 0 && (
          <Card className="p-3 sm:p-4">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Договори по ХТУ</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 gap-2 sm:gap-3">
              {contractsByHtu.map(h => (
                <div key={h.name} className="rounded-xl bg-gray-50 px-3 sm:px-4 py-2 sm:py-3">
                  <p className="text-xs text-gray-500 truncate">{h.name}</p>
                  <p className="mt-1 text-lg sm:text-xl font-semibold text-gray-800">{h.count}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
