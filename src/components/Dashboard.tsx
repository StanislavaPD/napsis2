import { useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Module } from '../types'
import { PageHeader, StatCard, Card } from './ui'

function fmtNumber(n: number) {
  return n.toLocaleString('bg-BG')
}

function currentMonthLabel() {
  const now = new Date()
  return new Intl.DateTimeFormat('bg-BG', { month: 'long', year: 'numeric' }).format(now)
}

export default function Dashboard({ onNavigate }: { onNavigate: (m: Module) => void }) {
  const { contracts, acts, contractors, crops } = useStore()
  const { username } = useAuth()

  const stats = useMemo(() => {
    const water = contracts.reduce((sum, c) => sum + (c.waterCubic || 0), 0)
    const monthNames = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
    const currentMonth = monthNames[new Date().getMonth()]
    const monthCost = contracts
      .filter(c => c.month === currentMonth)
      .reduce((sum, c) => sum + (c.value || 0), 0)

    return {
      activeContracts: contracts.length,
      water,
      pendingActs: acts.length,
      monthCost,
    }
  }, [contracts, acts])

  const latestContracts = [...contracts].slice(-3).reverse()

  return (
    <div>
      <PageHeader
        title={`Добър ден, ${username ?? 'оператор'}!`}
        subtitle={`Обобщение на поливния сезон · ${currentMonthLabel()}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Активни договори" value={fmtNumber(stats.activeContracts)} color="teal" />
        <StatCard label="Подадена вода" value={`${fmtNumber(stats.water)} м³`} color="blue" />
        <StatCard label="Актове бр." value={fmtNumber(stats.pendingActs)} color="amber" />
        <StatCard label="Договорирана стойност за месеца" value={`${fmtNumber(Math.round(stats.monthCost))} €`} color="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Активни договори</h2>
            <button
              onClick={() => onNavigate('contracts')}
              className="rounded-lg bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
            >
              Виж всички
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Договор', 'Контрагент', 'Култура', 'Стойност'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestContracts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">Все още няма договори.</td>
                  </tr>
                ) : (
                  latestContracts.map((item, idx) => {
                    const contractor = contractors.find(c => c.id === item.contractorId)
                    const crop = crops.find(c => c.id === item.cropId)
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.number}</td>
                        <td className="px-4 py-3 text-gray-700">{contractor?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{crop?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-teal-700">{fmtNumber(Math.round(item.value))} €</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <aside className="rounded-2xl bg-teal-900 p-4 text-white">
          <h3 className="text-base font-semibold">Генератори на документи</h3>
          <p className="mt-2 text-sm text-teal-100/80">
            Изберете контрагент и система. Данните се попълват автоматично от регистрите.
          </p>

          <div className="mt-5 space-y-3">
            <button
              onClick={() => onNavigate('gen-contract')}
              className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-50"
            >
              Генерирай договор
            </button>
            <button
              onClick={() => onNavigate('gen-act')}
              className="w-full rounded-xl border border-teal-600 bg-teal-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              Генерирай акт / заявка
            </button>
          </div>

        </aside>
      </div>
    </div>
  )
}
