import { useState } from 'react'
import { useStore } from '../store'
import type { Contract } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, SaveIcon } from './ui'
import { parseSpreadsheetFile, exportRowsToSpreadsheet, cellToDateStr, cellToNum, findByField, rowGet } from '../lib/spreadsheet'

const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']

/** Formats an "yyyy-mm-dd" date string as "dd.mm.yy" (e.g. "2026-10-23" -> "23.10.26"). */
function formatContractDate(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y.slice(2)}`
}

/** Splits an irrigation method name like "Гравитачно напояване - Капково" into ["Гравитачно", "Капково"]. */
function splitMethodName(name?: string): [string, string] {
  if (!name) return ['—', '']
  const [main, sub] = name.split(' - ')
  if (!sub) return [main, '']
  return [main.replace(/\s*напояване\s*/i, '').trim(), sub.trim()]
}

type ContractForm = Omit<Contract, 'id'>

const EMPTY: ContractForm = {
  date: new Date().toISOString().slice(0, 10),
  number: '',
  contractorId: '',
  htuId: '',
  village: '',
  irrigationMethodId: '',
  cropId: '',
  area: 0,
  irrigationCount: 0,
  totalDka: 0,
  cubicPerDka: 0,
  waterCubic: 0,
  unitPrice: 0,
  value: 0,
  irrigationNumber: '',
  month: '',
}

function calcForm(f: ContractForm): ContractForm {
  const totalDka = Number(f.area) * Number(f.irrigationCount)
  const waterCubic = Number(f.area) * Number(f.cubicPerDka)
  const value = waterCubic * Number(f.unitPrice)
  const monthIndex = Number(f.date.slice(5, 7)) - 1
  const month = MONTHS[monthIndex] ?? f.month
  return { ...f, totalDka, waterCubic, value, month }
}

export default function Contracts() {
  const { contracts, setContracts, contractors, htus, irrigationMethods, crops } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Contract | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ContractForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkField, setBulkField] = useState<'unitPrice' | 'area' | 'cubicPerDka'>('unitPrice')
  const [bulkValue, setBulkValue] = useState('')
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [htuFilter, setHtuFilter] = useState<string | null>(null)

  const htuCounts = htus.map(h => ({ htu: h, count: contracts.filter(c => c.htuId === h.id).length }))

  const filtered = contracts.filter(c => {
    const contractor = contractors.find(x => x.id === c.contractorId)
    const htu = htus.find(x => x.id === c.htuId)
    const q = search.toLowerCase()
    return (
      (!htuFilter || c.htuId === htuFilter) &&
      (
        c.number.toLowerCase().includes(q) ||
        (contractor?.name.toLowerCase().includes(q) ?? false) ||
        (htu?.htuName.toLowerCase().includes(q) ?? false) ||
        c.village.toLowerCase().includes(q) ||
        c.month.toLowerCase().includes(q)
      )
    )
  })

  function openAdd() {
    const defaultHtu = htus[0]
    setForm({ ...EMPTY, contractorId: contractors[0]?.id ?? '', htuId: defaultHtu?.id ?? '', village: defaultHtu?.village ?? '', irrigationMethodId: irrigationMethods[0]?.id ?? '', cropId: crops[0]?.id ?? '' })
    setAdding(true)
  }

  function openEdit(c: Contract) {
    const { id, ...rest } = c
    void id
    setForm(rest)
    setEditing(c)
  }

  function setF(patch: Partial<ContractForm>) {
    setForm(prev => calcForm({ ...prev, ...patch }))
  }

  function save() {
    if (!form.number.trim() || !form.contractorId) return
    if (adding) {
      setContracts([...contracts, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setContracts(contracts.map(c => c.id === editing.id ? { ...c, ...form } : c))
      setEditing(null)
    }
  }

  function confirmDelete() {
    if (deleteId) { setContracts(contracts.filter(c => c.id !== deleteId)); setDeleteId(null) }
  }

  function toggleSelect(id: string) {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }

  function applyBulk() {
    const val = parseFloat(bulkValue)
    if (isNaN(val)) return
    setContracts(contracts.map(c => {
      if (!selected.has(c.id)) return c
      const updated = { ...c, [bulkField]: val }
      return { ...updated, ...calcForm(updated) }
    }))
    setBulkModal(false)
    setSelected(new Set())
    setBulkValue('')
  }

  function handleHtuChange(htuId: string) {
    const htu = htus.find(h => h.id === htuId)
    setF({ htuId, village: htu?.village ?? form.village })
  }

  async function handleImport(file: File) {
    const rows = await parseSpreadsheetFile(file)
    const errors: string[] = []
    const added: Contract[] = []
    rows.forEach((row, i) => {
      const rowNum = i + 2
      const number = String(rowGet(row, '№ Договор', 'Номер') ?? '').trim()
      const contractorName = String(rowGet(row, 'Контрагент') ?? '').trim()
      if (!number || !contractorName) { errors.push(`Ред ${rowNum}: липсва номер или контрагент`); return }
      const contractor = findByField(contractors, 'name', contractorName)
      if (!contractor) { errors.push(`Ред ${rowNum}: контрагент "${contractorName}" не е намерен`); return }
      const htuName = String(rowGet(row, 'ХТУ') ?? '').trim()
      const htu = htuName ? findByField(htus, 'htuName', htuName) : undefined
      if (htuName && !htu) errors.push(`Ред ${rowNum}: ХТУ "${htuName}" не е намерено, оставено празно`)
      const methodName = String(rowGet(row, 'Начин на поливане') ?? '').trim()
      const method = methodName ? findByField(irrigationMethods, 'name', methodName) : undefined
      if (methodName && !method) errors.push(`Ред ${rowNum}: начин на поливане "${methodName}" не е намерен, оставено празно`)
      const cropName = String(rowGet(row, 'Култура') ?? '').trim()
      const crop = cropName ? findByField(crops, 'name', cropName) : undefined
      if (cropName && !crop) errors.push(`Ред ${rowNum}: култура "${cropName}" не е намерена, оставена празна`)
      const base: ContractForm = {
        date: cellToDateStr(rowGet(row, 'Дата')) || new Date().toISOString().slice(0, 10),
        number,
        contractorId: contractor.id,
        htuId: htu?.id ?? '',
        village: String(rowGet(row, 'Землище') ?? htu?.village ?? '').trim(),
        irrigationMethodId: method?.id ?? '',
        cropId: crop?.id ?? '',
        area: cellToNum(rowGet(row, 'Площ дка', 'Площ')),
        irrigationCount: cellToNum(rowGet(row, 'Бр. поливки')),
        totalDka: 0,
        cubicPerDka: cellToNum(rowGet(row, 'куб.м./дка')),
        waterCubic: 0,
        unitPrice: cellToNum(rowGet(row, 'Ед. цена')),
        value: 0,
        irrigationNumber: '',
        month: String(rowGet(row, 'Месец') ?? '').trim(),
      }
      added.push({ ...calcForm(base), id: `${Date.now()}-${i}` })
    })
    if (added.length) setContracts([...contracts, ...added])
    setImportResult({ added: added.length, errors })
  }

  function exportContracts() {
    const headers = ['Дата', '№ Договор', 'Контрагент', 'БУЛСТАТ', 'ХТУ', 'Съоражение', 'Землище', 'Начин на поливане', 'Култура', 'Площ дка', 'Бр. поливки', 'Поливодекари', 'куб.м./дка', 'Вода куб.м.', 'Ед. цена', 'Стойност', 'Месец']
    const rows = filtered.map(c => {
      const cont = contractors.find(x => x.id === c.contractorId)
      const h = htus.find(x => x.id === c.htuId)
      const method = irrigationMethods.find(x => x.id === c.irrigationMethodId)
      const crop = crops.find(x => x.id === c.cropId)
      return {
        'Дата': c.date, '№ Договор': c.number, 'Контрагент': cont?.name ?? '', 'БУЛСТАТ': cont?.bulstat ?? '',
        'ХТУ': h?.htuName ?? '', 'Съоражение': h?.equipment ?? '', 'Землище': c.village,
        'Начин на поливане': method?.name ?? '', 'Култура': crop?.name ?? '',
        'Площ дка': c.area, 'Бр. поливки': c.irrigationCount, 'Поливодекари': c.totalDka,
        'куб.м./дка': c.cubicPerDka, 'Вода куб.м.': c.waterCubic, 'Ед. цена': c.unitPrice,
        'Стойност': c.value, 'Месец': c.month,
      }
    })
    exportRowsToSpreadsheet(headers, rows, 'Договори', `Договори_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const htu = htus.find(h => h.id === form.htuId)
  const contractor = contractors.find(c => c.id === form.contractorId)

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Договори"
        subtitle={`${contracts.length} записа`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по договор, контрагент..." />
            {selected.size > 0 && (
              <Btn variant="secondary" onClick={() => setBulkModal(true)}>
                <EditIcon /> Масово редактиране ({selected.size})
              </Btn>
            )}
            <ImportButton onFile={handleImport} />
            <Btn variant="secondary" onClick={exportContracts}><ExportIcon /> Експорт</Btn>
            <Btn onClick={openAdd}>+ Нов договор</Btn>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-6">
        {htuCounts.map(({ htu, count }, i) => {
          const gradients = ['from-teal-500 to-teal-600', 'from-blue-500 to-blue-600', 'from-amber-400 to-amber-500', 'from-emerald-500 to-emerald-600']
          const isActive = htuFilter === htu.id
          return (
            <button
              key={htu.id}
              onClick={() => setHtuFilter(f => f === htu.id ? null : htu.id)}
              className={`text-left rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${gradients[i % gradients.length]} transition-all ${isActive ? 'ring-2 ring-offset-2 ring-gray-800' : 'opacity-90 hover:opacity-100'}`}
            >
              <p className="text-xs font-medium opacity-90 truncate">{htu.htuName}</p>
              <p className="mt-1 text-2xl font-semibold">{count}</p>
            </button>
          )
        })}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gradient-to-br from-emerald-500 to-emerald-600">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                {['Дата', '№ Договор', 'Контрагент', 'БУЛСТАТ', 'ХТУ', 'Съоражение', 'Землище', 'Начин на поливане', 'Култура', 'Площ дка', 'Бр. поливки', 'Поливодекари', 'куб.м./дка', 'Вода куб.м.', 'Ед. цена', 'Стойност', 'Месец', 'Действия'].map(h => (
                  <th key={h} className={`px-3 py-3 text-xs font-semibold text-white uppercase tracking-wide ${h === 'Бр. поливки' ? 'text-center' : 'text-left'}`}>
                    {h === 'Бр. поливки' ? <>Бр.<br />поливки</> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={19}><EmptyState message="Няма намерени договори" /></td></tr>
              ) : (
                filtered.map((c, i) => {
                  const cont = contractors.find(x => x.id === c.contractorId)
                  const h = htus.find(x => x.id === c.htuId)
                  const method = irrigationMethods.find(x => x.id === c.irrigationMethodId)
                  const crop = crops.find(x => x.id === c.cropId)
                  return (
                    <tr key={c.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'} ${selected.has(c.id) ? 'bg-teal-50' : ''}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{formatContractDate(c.date)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{c.number.split('/')[0]}</td>
                      <td className="px-3 py-2.5 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{cont?.bulstat ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{h?.htuName ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{h?.equipment ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{c.village}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {(() => {
                          const [main, sub] = splitMethodName(method?.name)
                          return sub ? <>{main}<br />{sub}</> : main
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{crop?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(c.area, 2)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{c.irrigationCount}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(c.totalDka, 2)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(c.cubicPerDka, 0)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(c.waterCubic, 0)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(c.unitPrice, 4)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-teal-700">{num(c.value, 2)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{MONTHS.indexOf(c.month) + 1 || ''}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Btn size="sm" variant="ghost" onClick={() => openEdit(c)}><EditIcon /></Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setDeleteId(c.id)}><TrashIcon /></Btn>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isOpen && (
        <Modal title={adding ? 'Нов Договор' : 'Редактирай Договор'} onClose={() => { setAdding(false); setEditing(null) }} wide>
          <div className="grid grid-cols-3 gap-4">
            <FormRow label="Дата" required>
              <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
            </FormRow>
            <FormRow label="№ на договор" required>
              <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="Д-001/2024" />
            </FormRow>

            <div className="col-span-2">
              <FormRow label="Контрагент" required>
                <Select value={form.contractorId} onChange={e => setF({ contractorId: e.target.value })}>
                  <option value="">— Избери —</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormRow>
            </div>
            <FormRow label="БУЛСТАТ">
              <Input value={contractor?.bulstat ?? ''} readOnly className="bg-gray-50 text-gray-500" />
            </FormRow>

            <FormRow label="ХТУ">
              <Select value={form.htuId} onChange={e => handleHtuChange(e.target.value)}>
                <option value="">— Избери —</option>
                {htus.map(h => <option key={h.id} value={h.id}>{h.htuName}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Съоражение">
              <Input value={htu?.equipment ?? ''} readOnly className="bg-gray-50 text-gray-500" />
            </FormRow>
            <FormRow label="Землище">
              <Input value={form.village} onChange={e => setF({ village: e.target.value })} placeholder="Горно Езерово" />
            </FormRow>

            <FormRow label="Начин на поливане">
              <Select value={form.irrigationMethodId} onChange={e => setF({ irrigationMethodId: e.target.value })}>
                <option value="">— Избери —</option>
                {irrigationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Култура">
              <Select value={form.cropId} onChange={e => setF({ cropId: e.target.value })}>
                <option value="">— Избери —</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Площ (дка)">
              <Input type="number" value={form.area || ''} onChange={e => setF({ area: parseFloat(e.target.value) || 0 })} placeholder="50" />
            </FormRow>
            <FormRow label="Бр. поливки">
              <Input type="number" step="0.01" value={form.irrigationCount || ''} onChange={e => setF({ irrigationCount: parseFloat(e.target.value) || 0 })} placeholder="4" />
            </FormRow>
            <FormRow label="Поливодекари">
              <Input value={num(form.totalDka, 2)} readOnly className="bg-gray-50 text-gray-500" />
            </FormRow>

            <FormRow label="Напоителна норма">
              <Input type="number" value={form.cubicPerDka || ''} onChange={e => setF({ cubicPerDka: parseFloat(e.target.value) || 0 })} placeholder="380" />
            </FormRow>
            <FormRow label="Вода куб.м.">
              <Input value={num(form.waterCubic, 0)} readOnly className="bg-gray-50 text-gray-500" />
            </FormRow>
            <FormRow label="Ед. цена">
              <NumberInput value={form.unitPrice} onChange={n => setF({ unitPrice: n })} placeholder="0.0800" />
            </FormRow>

            <div className="col-span-3">
              <div className="bg-teal-50 rounded-xl px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-teal-700">Стойност</span>
                <span className="text-xl font-semibold text-teal-800">{num(form.value, 2)} €</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            <Btn onClick={save} disabled={!form.number.trim() || !form.contractorId} className="justify-center"><SaveIcon /> Запази</Btn>
          </div>
        </Modal>
      )}

      {bulkModal && (
        <Modal title={`Масово редактиране (${selected.size} записа)`} onClose={() => setBulkModal(false)}>
          <div className="flex flex-col gap-4">
            <FormRow label="Поле за редактиране">
              <Select value={bulkField} onChange={e => setBulkField(e.target.value as typeof bulkField)}>
                <option value="unitPrice">Ед. цена</option>
                <option value="area">Площ (дка)</option>
                <option value="cubicPerDka">куб.м./дка</option>
              </Select>
            </FormRow>
            <FormRow label="Нова стойност">
              <Input type="number" step="0.0001" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Въведете стойност" autoFocus />
            </FormRow>
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => setBulkModal(false)}>Откажи</Btn>
            <Btn onClick={applyBulk} disabled={!bulkValue}>Приложи</Btn>
          </div>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Сигурни ли сте, че искате да изтриете този договор?"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {importResult && (
        <ImportResultModal added={importResult.added} errors={importResult.errors} onClose={() => setImportResult(null)} />
      )}
    </div>
  )
}
