import { useState } from 'react'
import { useStore } from '../store'
import type { Contract } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, Combobox, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, SaveIcon } from './ui'
import { parseSpreadsheetFile, exportStyledRowsToSpreadsheet, exportFilename, cellToDateStr, cellToNum, findByField, findSimilarByField, rowGet } from '../lib/spreadsheet'
import { countContracts } from '../lib/acts'

const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']

type BulkField = 'unitPrice' | 'area' | 'cubicPerDka' | 'htuId' | 'irrigationMethodId' | 'cropId'
const BULK_FIELDS: BulkField[] = ['unitPrice', 'area', 'cubicPerDka', 'htuId', 'irrigationMethodId', 'cropId']
const BULK_REF_FIELDS: BulkField[] = ['htuId', 'irrigationMethodId', 'cropId']
const BULK_LABELS: Record<BulkField, string> = {
  unitPrice: 'Ед. цена', area: 'Площ (дка)', cubicPerDka: 'куб.м./дка',
  htuId: 'ХТУ', irrigationMethodId: 'Начин на поливане', cropId: 'Култура',
}
const EMPTY_BULK_ENABLED: Record<BulkField, boolean> = { unitPrice: false, area: false, cubicPerDka: false, htuId: false, irrigationMethodId: false, cropId: false }
const EMPTY_BULK_VALUES: Record<BulkField, string> = { unitPrice: '', area: '', cubicPerDka: '', htuId: '', irrigationMethodId: '', cropId: '' }

type SortField = 'date' | 'number' | 'contractorName' | 'contractorBulstat' | 'htuName' | 'equipment' | 'village' | 'methodName' | 'cropName' | 'area'

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
  unitPrice: 0.0128,
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

export default function Contracts({ initialContractorId, onClearFilter }: { initialContractorId?: string; onClearFilter?: () => void } = {}) {
  const { contracts, setContracts, contractors, htus, irrigationMethods, crops, findOrCreateContractor } = useStore()
  const initialContractor = initialContractorId ? contractors.find(c => c.id === initialContractorId) : undefined
  const [search, setSearch] = useState(initialContractor?.name ?? '')
  const [editing, setEditing] = useState<Contract | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ContractForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkEnabled, setBulkEnabled] = useState<Record<BulkField, boolean>>(EMPTY_BULK_ENABLED)
  const [bulkValues, setBulkValues] = useState<Record<BulkField, string>>(EMPTY_BULK_VALUES)

  function toggleBulkField(field: BulkField) {
    setBulkEnabled(e => ({ ...e, [field]: !e[field] }))
  }
  function setBulkValue(field: BulkField, value: string) {
    setBulkValues(v => ({ ...v, [field]: value }))
  }
  const bulkHasSelection = BULK_FIELDS.some(f => bulkEnabled[f] && bulkValues[f] !== '')
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [htuFilter, setHtuFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function sortValue(c: Contract, field: SortField): string | number {
    switch (field) {
      case 'date': return c.date
      case 'number': return c.number
      case 'contractorName': return contractors.find(x => x.id === c.contractorId)?.name ?? ''
      case 'contractorBulstat': return contractors.find(x => x.id === c.contractorId)?.bulstat ?? ''
      case 'htuName': return htus.find(x => x.id === c.htuId)?.htuName ?? ''
      case 'equipment': return htus.find(x => x.id === c.htuId)?.equipment ?? ''
      case 'village': return c.village
      case 'methodName': return irrigationMethods.find(x => x.id === c.irrigationMethodId)?.name ?? ''
      case 'cropName': return crops.find(x => x.id === c.cropId)?.name ?? ''
      case 'area': return c.area
    }
  }

  const htuNames = [...new Set(htus.map(h => h.htuName))]
  const htuCounts = htuNames.map(name => ({
    name,
    count: countContracts(contracts.filter(c => htus.find(h => h.id === c.htuId)?.htuName === name)),
  }))

  const filtered = contracts.filter(c => {
    const contractor = contractors.find(x => x.id === c.contractorId)
    const htu = htus.find(x => x.id === c.htuId)
    const crop = crops.find(x => x.id === c.cropId)
    const method = irrigationMethods.find(x => x.id === c.irrigationMethodId)
    const q = search.toLowerCase().trim()

    // Ако search е празен, показваме всичко
    if (!q) {
      return !htuFilter || htu?.htuName === htuFilter
    }

    return (
      (!htuFilter || htu?.htuName === htuFilter) &&
      (
        c.number.toLowerCase().includes(q) ||
        (contractor?.name.toLowerCase().includes(q) ?? false) ||
        (htu?.htuName.toLowerCase().includes(q) ?? false) ||
        c.village.toLowerCase().includes(q) ||
        c.month.toLowerCase().includes(q) ||
        (crop?.name.toLowerCase().includes(q) ?? false) ||
        String(c.area).toLowerCase().includes(q) ||
        (method?.name.toLowerCase().includes(q) ?? false)
      )
    )
  }).sort((a, b) => {
    if (!sortField) return 0
    const va = sortValue(a, sortField), vb = sortValue(b, sortField)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'bg', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  function openAdd() {
    const defaultHtu = htus[0]
    setForm({ ...EMPTY, contractorId: contractors[0]?.id ?? '', htuId: defaultHtu?.id ?? '', village: defaultHtu?.village ?? '', irrigationMethodId: irrigationMethods[0]?.id ?? '', cropId: crops[0]?.id ?? '' })
    setFormError(null)
    setAdding(true)
  }

  function openEdit(c: Contract) {
    const { id, ...rest } = c
    void id
    setForm(rest)
    setFormError(null)
    setEditing(c)
  }

  function setF(patch: Partial<ContractForm>) {
    setForm(prev => calcForm({ ...prev, ...patch }))
  }

  function save() {
    if (!form.number.trim() || !form.contractorId) return
    const dup = findByField(contracts.filter(c => c.id !== editing?.id), 'number', form.number)
    if (dup) { setFormError(`Вече съществува договор с номер "${form.number}".`); return }
    setFormError(null)
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

  function confirmDeleteAll() {
    setContracts([])
    setDeleteAllConfirm(false)
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
    const activeFields = BULK_FIELDS.filter(f => bulkEnabled[f] && bulkValues[f] !== '')
    if (activeFields.length === 0) return
    setContracts(contracts.map(c => {
      if (!selected.has(c.id)) return c
      const patch: Partial<Contract> = {}
      activeFields.forEach(f => {
        if (BULK_REF_FIELDS.includes(f)) (patch as Record<string, string>)[f] = bulkValues[f]
        else (patch as Record<string, number>)[f] = parseFloat(bulkValues[f])
      })
      if (activeFields.includes('htuId')) {
        const htu = htus.find(h => h.id === bulkValues.htuId)
        if (htu) patch.village = htu.village
      }
      const updated = { ...c, ...patch }
      return { ...updated, ...calcForm(updated) }
    }))
    setBulkModal(false)
    setSelected(new Set())
    setBulkEnabled(EMPTY_BULK_ENABLED)
    setBulkValues(EMPTY_BULK_VALUES)
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

      // Всички редове се импортират - няма проверка за дубликати
      // Договори с един номер + дата се групират автоматично като 1 документ чрез contractKey()

      const contractor = findByField(contractors, 'name', contractorName)
      if (!contractor) { errors.push(`Ред ${rowNum}: контрагент "${contractorName}" не е намерен`); return }
      const htuName = String(rowGet(row, 'ХТУ') ?? '').trim()
      const htu = htuName ? findSimilarByField(htus, 'htuName', htuName) : undefined
      if (htuName && !htu) errors.push(`Ред ${rowNum}: ХТУ "${htuName}" не е намерено, оставено празно`)
      const methodName = String(rowGet(row, 'Начин на поливане') ?? '').trim()
      const method = methodName ? findSimilarByField(irrigationMethods, 'name', methodName) : undefined
      if (methodName && !method) errors.push(`Ред ${rowNum}: начин на поливане "${methodName}" не е намерен, оставено празно`)
      const cropName = String(rowGet(row, 'Култура') ?? '').trim()
      const crop = cropName ? findSimilarByField(crops, 'name', cropName) : undefined
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
        irrigationCount: cellToNum(rowGet(row, 'Бр. поливки', 'Брой поливки', 'Поливки')),
        totalDka: 0,
        cubicPerDka: cellToNum(rowGet(row, 'куб.м./дка')),
        waterCubic: 0,
        unitPrice: cellToNum(rowGet(row, 'Ед. цена', 'Ед. цена (€)', 'Единична цена', 'Цена')),
        value: cellToNum(rowGet(row, 'Стойност', 'Стойност (€)', 'Сума')),
        irrigationNumber: '',
        month: String(rowGet(row, 'Месец') ?? '').trim(),
      }
      const calculated = calcForm(base)
      added.push({ ...calculated, value: base.value || calculated.value, id: `${Date.now()}-${i}` })
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
        'Дата': formatContractDate(c.date), '№ Договор': c.number, 'Контрагент': cont?.name ?? '', 'БУЛСТАТ': cont?.bulstat ?? '',
        'ХТУ': h?.htuName ?? '', 'Съоражение': h?.equipment ?? '', 'Землище': c.village,
        'Начин на поливане': method?.name ?? '', 'Култура': crop?.name ?? '',
        'Площ дка': c.area, 'Бр. поливки': c.irrigationCount, 'Поливодекари': c.totalDka,
        'куб.м./дка': c.cubicPerDka, 'Вода куб.м.': c.waterCubic, 'Ед. цена': c.unitPrice,
        'Стойност': c.value, 'Месец': c.month,
      }
    })
    const filename = exportFilename('Договори', [htuFilter])
    exportStyledRowsToSpreadsheet(headers, rows, 'Договори', filename, {
      headerColor: '10B981', totalColor: 'D1FAE5',
      numericColumns: ['Площ дка', 'Бр. поливки', 'Поливодекари', 'Вода куб.м.', 'Стойност'],
    })
  }

  const htu = htus.find(h => h.id === form.htuId)
  const contractor = contractors.find(c => c.id === form.contractorId)

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Договори"
        subtitle={`${countContracts(contracts)} договора (${contracts.length} записа)`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по договор, контрагент..." />
            {initialContractorId && onClearFilter && (
              <Btn variant="secondary" onClick={() => { setSearch(''); onClearFilter(); }}>
                Изчисти филтър
              </Btn>
            )}
            {selected.size > 0 && (
              <Btn variant="secondary" onClick={() => setBulkModal(true)}>
                <EditIcon /> Масово редактиране ({selected.size})
              </Btn>
            )}
            <ImportButton onFile={handleImport} />
            <Btn variant="secondary" onClick={exportContracts}><ExportIcon /> Експорт</Btn>
            <Btn variant="danger" onClick={() => setDeleteAllConfirm(true)} disabled={contracts.length === 0}>
              <TrashIcon /> Изтрий всичко
            </Btn>
            <Btn onClick={openAdd}>+ Нов договор</Btn>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-6">
        {htuCounts.map(({ name, count }, i) => {
          const gradients = ['from-teal-500 to-teal-600', 'from-blue-500 to-blue-600', 'from-amber-400 to-amber-500', 'from-emerald-500 to-emerald-600']
          const isActive = htuFilter === name
          return (
            <button
              key={name}
              onClick={() => setHtuFilter(f => f === name ? null : name)}
              className={`text-left rounded-xl p-4 text-white shadow-sm bg-gradient-to-br ${gradients[i % gradients.length]} transition-all ${isActive ? 'ring-2 ring-offset-2 ring-gray-800' : 'opacity-90 hover:opacity-100'}`}
            >
              <p className="text-xs font-medium opacity-90 truncate">{name}</p>
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
                <th className="px-1.5 py-2.5 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                {([
                  ['Дата', 'date'], ['№ Договор', 'number'], ['Контрагент', 'contractorName'], ['БУЛСТАТ', 'contractorBulstat'],
                  ['ХТУ', 'htuName'], ['Съоражение', 'equipment'], ['Землище', 'village'], ['Начин на поливане', 'methodName'],
                  ['Култура', 'cropName'], ['Площ дка', 'area'], ['Бр. поливки', null], ['Поливодекари', null],
                  ['куб.м./дка', null], ['Вода куб.м.', null], ['Ед. цена', null], ['Стойност', null], ['Месец', null], ['Действия', null],
                ] as [string, SortField | null][]).map(([h, field]) => (
                  <th
                    key={h}
                    onClick={field ? () => toggleSort(field) : undefined}
                    className={`px-1.5 py-2.5 text-xs font-semibold text-white uppercase tracking-wide ${h === 'Бр. поливки' ? 'text-center' : 'text-left'} ${field ? 'cursor-pointer select-none hover:bg-white/10 transition-colors' : ''}`}
                  >
                    {h === 'Бр. поливки' ? <>Бр.<br />поливки</> : h}{field && sortField === field && (sortDir === 'asc' ? ' ▲' : ' ▼')}
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
                      <td className="px-1.5 py-2 text-center">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                      </td>
                      <td className="px-1.5 py-2 text-gray-600">{formatContractDate(c.date)}</td>
                      <td className="px-0.5 py-2 font-medium text-gray-900">{c.number.split('/')[0]}</td>
                      <td className="px-0.5 py-2 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-1.5 py-2 text-xs text-gray-500">{cont?.bulstat ?? '—'}</td>
                      <td className="px-1.5 py-2 text-gray-600">{h?.htuName ?? '—'}</td>
                      <td className="px-1.5 py-2 text-gray-600">{h?.equipment ?? '—'}</td>
                      <td className="px-1.5 py-2 text-gray-600">{c.village}</td>
                      <td className="px-1.5 py-2 text-gray-600">
                        {(() => {
                          const [main, sub] = splitMethodName(method?.name)
                          return sub ? <>{main}<br />{sub}</> : main
                        })()}
                      </td>
                      <td className="px-1.5 py-2 text-gray-600">{crop?.name ?? '—'}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.area, 2)}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.irrigationCount, 2)}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.totalDka, 2)}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.cubicPerDka, 0)}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.waterCubic, 0)}</td>
                      <td className="px-1.5 py-2 text-left text-xs">{num(c.unitPrice, 4)}</td>
                      <td className="px-1.5 py-2 text-left text-xs font-semibold text-teal-700">{num(c.value, 2)}</td>
                      <td className="px-1.5 py-2 text-center text-gray-600">{MONTHS.indexOf(c.month) + 1 || ''}</td>
                      <td className="px-1.5 py-2">
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
        <Modal title={adding ? 'Нов Договор' : 'Редактирай Договор'} onClose={() => { setAdding(false); setEditing(null) }} onSave={save} wide>
          <div className="grid grid-cols-3 gap-4">
            <FormRow label="Дата" required>
              <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
            </FormRow>
            <FormRow label="№ на договор" required>
              <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="Д-001/2024" />
            </FormRow>

            <div className="col-span-2">
              <FormRow label="Контрагент" required>
                <Combobox
                  value={form.contractorId}
                  onChange={contractorId => setF({ contractorId })}
                  options={contractors.map(c => ({ id: c.id, label: c.name }))}
                  onCreate={name => findOrCreateContractor(name)}
                  placeholder="Избери или въведи контрагент..."
                />
              </FormRow>
            </div>
            <FormRow label="БУЛСТАТ">
              <Input value={contractor?.bulstat ?? ''} readOnly className="bg-gray-50 text-gray-500" />
            </FormRow>

            <FormRow label="ХТУ">
              <Select value={form.htuId} onChange={e => handleHtuChange(e.target.value)}>
                <option value="">— Избери —</option>
                {htus.map(h => <option key={h.id} value={h.id}>{h.htuName} — {h.equipment}</option>)}
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
              <NumberInput value={form.irrigationCount} onChange={n => setF({ irrigationCount: n })} placeholder="4" />
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
          {formError && <p className="text-sm text-red-500 mt-4">{formError}</p>}
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            <Btn onClick={save} disabled={!form.number.trim() || !form.contractorId} className="justify-center"><SaveIcon /> Запази</Btn>
          </div>
        </Modal>
      )}

      {bulkModal && (
        <Modal title={`Масово редактиране (${selected.size} записа)`} onClose={() => setBulkModal(false)}>
          <p className="text-xs text-gray-400 mb-3">Отметни полетата, които искаш да зададеш за всички избрани записи — можеш да смениш повече от едно наведнъж.</p>
          <div className="flex flex-col gap-3">
            {BULK_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bulkEnabled[field]}
                  onChange={() => toggleBulkField(field)}
                  className="rounded shrink-0"
                />
                <span className="w-40 shrink-0 text-sm text-gray-700">{BULK_LABELS[field]}</span>
                <div className="flex-1">
                  {field === 'htuId' ? (
                    <Select value={bulkValues.htuId} onChange={e => setBulkValue('htuId', e.target.value)} disabled={!bulkEnabled.htuId}>
                      <option value="">— Избери —</option>
                      {htus.map(h => <option key={h.id} value={h.id}>{h.htuName} — {h.equipment}</option>)}
                    </Select>
                  ) : field === 'irrigationMethodId' ? (
                    <Select value={bulkValues.irrigationMethodId} onChange={e => setBulkValue('irrigationMethodId', e.target.value)} disabled={!bulkEnabled.irrigationMethodId}>
                      <option value="">— Избери —</option>
                      {irrigationMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  ) : field === 'cropId' ? (
                    <Select value={bulkValues.cropId} onChange={e => setBulkValue('cropId', e.target.value)} disabled={!bulkEnabled.cropId}>
                      <option value="">— Избери —</option>
                      {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  ) : (
                    <Input
                      type="number" step="0.0001"
                      value={bulkValues[field]}
                      onChange={e => setBulkValue(field, e.target.value)}
                      disabled={!bulkEnabled[field]}
                      placeholder="Стойност"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => setBulkModal(false)}>Откажи</Btn>
            <Btn onClick={applyBulk} disabled={!bulkHasSelection}>Приложи</Btn>
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

      {deleteAllConfirm && (
        <ConfirmDialog
          message={`Сигурни ли сте, че искате да изтриете ВСИЧКИ договори (${contracts.length})? Това действие е необратимо.`}
          onConfirm={confirmDeleteAll}
          onCancel={() => setDeleteAllConfirm(false)}
        />
      )}

      {importResult && (
        <ImportResultModal added={importResult.added} errors={importResult.errors} onClose={() => setImportResult(null)} />
      )}
    </div>
  )
}
