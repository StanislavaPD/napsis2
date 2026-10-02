import React, { useState } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Act, Contract } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, Combobox, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon } from './ui'
import { parseSpreadsheetFile, exportStyledRowsToSpreadsheet, exportFilename, cellToDateStr, cellToNum, findByField, findSimilarByField, rowGet } from '../lib/spreadsheet'
import { countActs, findDuplicateAct } from '../lib/acts'

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

type SortField = 'date' | 'number' | 'contractorName' | 'htuName' | 'equipment' | 'village' | 'methodName' | 'cropName' | 'irrigationNumber' | 'area'

/** Formats an "yyyy-mm-dd" date string as "dd.mm.yy" (e.g. "2026-10-23" -> "23.10.26"). */
function formatActDate(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y.slice(2)}`
}

type ActForm = Omit<Act, 'id'>

const EMPTY: ActForm = {
  docType: 'Акт',
  date: new Date().toISOString().slice(0, 10),
  number: '',
  contractorId: '',
  htuId: '',
  village: '',
  irrigationMethodId: '',
  cropId: '',
  irrigationNumber: '',
  area: 0,
  cubicPerDka: 0,
  waterCubic: 0,
  unitPrice: 0.0128,
  value: 0,
  month: '',
}

function calcAct(f: ActForm): ActForm {
  const value = Number(f.waterCubic) * Number(f.unitPrice)
  const monthIndex = Number(f.date.slice(5, 7)) - 1
  const month = MONTHS[monthIndex] ?? f.month
  return { ...f, value, month }
}

export default function Acts({ initialContractorId, onClearFilter }: { initialContractorId?: string; onClearFilter?: () => void } = {}) {
  const { acts, setActs, contractors, htus, irrigationMethods, crops, contracts, findOrCreateContractor, isArchiveMode } = useStore()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const initialContractor = initialContractorId ? contractors.find(c => c.id === initialContractorId) : undefined
  const [search, setSearch] = useState(initialContractor?.name ?? '')
  const [editing, setEditing] = useState<Act | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ActForm>(EMPTY)
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

  function sortValue(a: Act, field: SortField): string | number {
    switch (field) {
      case 'date': return a.date
      case 'number': return a.number
      case 'contractorName': return contractors.find(x => x.id === a.contractorId)?.name ?? ''
      case 'htuName': return htus.find(x => x.id === a.htuId)?.htuName ?? ''
      case 'equipment': return htus.find(x => x.id === a.htuId)?.equipment ?? ''
      case 'village': return a.village
      case 'methodName': return irrigationMethods.find(x => x.id === a.irrigationMethodId)?.name ?? ''
      case 'cropName': return crops.find(x => x.id === a.cropId)?.name ?? ''
      case 'irrigationNumber': return a.irrigationNumber
      case 'area': return a.area
    }
  }

  const htuNames = [...new Set(htus.map(h => h.htuName))]
  const htuCounts = htuNames.map(name => ({
    name,
    count: countActs(acts.filter(a => htus.find(h => h.id === a.htuId)?.htuName === name)),
  }))

  const filtered = acts.filter(a => {
    const cont = contractors.find(x => x.id === a.contractorId)
    const crop = crops.find(x => x.id === a.cropId)
    const method = irrigationMethods.find(x => x.id === a.irrigationMethodId)
    const q = search.toLowerCase().trim()

    // Ако search е празен, показваме всичко
    if (!q) {
      return !htuFilter || htus.find(h => h.id === a.htuId)?.htuName === htuFilter
    }

    return (
      (!htuFilter || htus.find(h => h.id === a.htuId)?.htuName === htuFilter) &&
      (
        a.number.toLowerCase().includes(q) ||
        a.docType.toLowerCase().includes(q) ||
        (cont?.name.toLowerCase().includes(q) ?? false) ||
        a.village.toLowerCase().includes(q) ||
        a.month.toLowerCase().includes(q) ||
        a.irrigationNumber.toLowerCase().includes(q) ||
        (crop?.name.toLowerCase().includes(q) ?? false) ||
        String(a.area).toLowerCase().includes(q) ||
        (method?.name.toLowerCase().includes(q) ?? false)
      )
    )
  }).sort((a, b) => {
    if (!sortField) return 0
    const va = sortValue(a, sortField), vb = sortValue(b, sortField)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'bg', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  /** Contracts signed with the given contractor — used to auto-suggest a crop's contracted area, ХТУ, начин на поливане, норма and цена when filling in an act. */
  function contractsForContractor(contractorId: string) {
    return contracts.filter(c => c.contractorId === contractorId)
  }

  /** Pulls the fields tied to a specific contract (area, ХТУ, землище, начин на поливане, норма, цена) onto a form patch — the operator can still edit any of them afterward. */
  function withContractDefaults(patch: Partial<ActForm>, match: Contract | undefined): Partial<ActForm> {
    if (!match) return patch
    return {
      ...patch,
      area: match.area,
      htuId: match.htuId,
      village: match.village,
      irrigationMethodId: match.irrigationMethodId,
      cubicPerDka: match.cubicPerDka,
      unitPrice: match.unitPrice,
    }
  }

  function defaultForm(): ActForm {
    const contractorId = contractors[0]?.id ?? ''
    const match = contractsForContractor(contractorId)[0]
    const base: ActForm = { ...EMPTY, contractorId, htuId: htus[0]?.id ?? '', village: htus[0]?.village ?? '', irrigationMethodId: irrigationMethods[0]?.id ?? '', cropId: crops[0]?.id ?? '' }
    return { ...base, ...withContractDefaults({ cropId: match?.cropId ?? base.cropId }, match) }
  }

  /** Selecting a contractor auto-fills crop, площ, ХТУ etc. from their first signed contract (if any) — corrigible afterward. */
  function setContractor(contractorId: string) {
    const match = contractsForContractor(contractorId)[0]
    setF(withContractDefaults({ contractorId, cropId: match?.cropId ?? form.cropId }, match))
  }

  /** Switching culture (when a contractor has several contracted crops) re-applies that crop's own contract data. */
  function setCrop(cropId: string) {
    const match = contractsForContractor(form.contractorId).find(c => c.cropId === cropId)
    setF(withContractDefaults({ cropId }, match))
  }

  function openAdd() {
    setForm(defaultForm())
    setFormError(null)
    setAdding(true)
  }

  function openEdit(a: Act) {
    const { id, ...rest } = a
    void id
    setForm(rest)
    setFormError(null)
    setEditing(a)
  }

  function useAsTemplate(a: Act) {
    setForm({
      ...EMPTY,
      htuId: a.htuId,
      village: a.village,
      irrigationMethodId: a.irrigationMethodId,
      cropId: a.cropId,
      docType: a.docType,
      contractorId: a.contractorId,
      cubicPerDka: a.cubicPerDka,
      unitPrice: a.unitPrice,
      date: new Date().toISOString().slice(0, 10),
    })
    setFormError(null)
    setAdding(true)
  }

  function setF(patch: Partial<ActForm>) {
    setForm(prev => calcAct({ ...prev, ...patch }))
  }

  function save() {
    if (!form.number.trim() || !form.contractorId) return
    const dup = findDuplicateAct(acts, form, editing?.id)
    if (dup) { setFormError(`Вече съществува акт с номер "${form.number}" от ${form.date} за тази култура.`); return }
    setFormError(null)
    if (adding) {
      setActs([...acts, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setActs(acts.map(a => a.id === editing.id ? { ...a, ...form } : a))
      setEditing(null)
    }
  }

  function saveAndNew() {
    if (!form.number.trim() || !form.contractorId || !adding) return
    if (findDuplicateAct(acts, form)) { setFormError(`Вече съществува акт с номер "${form.number}" от ${form.date} за тази култура.`); return }
    setFormError(null)
    setActs([...acts, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setActs(acts.filter(a => a.id !== deleteId)); setDeleteId(null) }
  }

  function confirmDeleteAll() {
    setActs([])
    setDeleteAllConfirm(false)
  }

  function toggleSelect(id: string) {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(a => a.id)))
  }

  function applyBulk() {
    const activeFields = BULK_FIELDS.filter(f => bulkEnabled[f] && bulkValues[f] !== '')
    if (activeFields.length === 0) return
    setActs(acts.map(a => {
      if (!selected.has(a.id)) return a
      const patch: Partial<Act> = {}
      activeFields.forEach(f => {
        if (BULK_REF_FIELDS.includes(f)) (patch as Record<string, string>)[f] = bulkValues[f]
        else (patch as Record<string, number>)[f] = parseFloat(bulkValues[f])
      })
      if (activeFields.includes('htuId')) {
        const htu = htus.find(h => h.id === bulkValues.htuId)
        if (htu) patch.village = htu.village
      }
      const updated = { ...a, ...patch }
      return { ...updated, ...calcAct(updated) }
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
    const added: Act[] = []
    rows.forEach((row, i) => {
      const rowNum = i + 2
      const number = String(rowGet(row, 'Номер', '№') ?? '').trim()
      const contractorName = String(rowGet(row, 'Контрагент') ?? '').trim()
      if (!number || !contractorName) { errors.push(`Ред ${rowNum}: липсва номер или контрагент`); return }
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
      const docType = String(rowGet(row, 'Вид документ', 'Вид') ?? '').trim() || 'Акт'
      const base: ActForm = {
        docType,
        date: cellToDateStr(rowGet(row, 'Дата')) || new Date().toISOString().slice(0, 10),
        number,
        contractorId: contractor.id,
        htuId: htu?.id ?? '',
        village: String(rowGet(row, 'Землище') ?? htu?.village ?? '').trim(),
        irrigationMethodId: method?.id ?? '',
        cropId: crop?.id ?? '',
        irrigationNumber: String(rowGet(row, '№ поливка') ?? '').trim(),
        area: cellToNum(rowGet(row, 'Площ', 'Площ дка')),
        cubicPerDka: cellToNum(rowGet(row, 'куб.м./дка')),
        waterCubic: cellToNum(rowGet(row, 'Вода куб.м.')),
        unitPrice: cellToNum(rowGet(row, 'Ед. цена', 'Ед. цена (€)', 'Единична цена', 'Цена')),
        value: cellToNum(rowGet(row, 'Стойност', 'Стойност (€)', 'Сума')),
        month: String(rowGet(row, 'Месец') ?? '').trim(),
      }

      // Всички редове се импортират - няма проверка за дубликати
      // Актове с един номер + дата се групират автоматично като 1 документ чрез actKey()

      const calculated = calcAct(base)
      added.push({ ...calculated, value: base.value || calculated.value, id: `${Date.now()}-${i}` })
    })
    if (added.length) setActs([...acts, ...added])
    setImportResult({ added: added.length, errors })
  }

  function exportActs() {
    const headers = ['Дата', 'Номер', 'Контрагент', 'ХТУ', 'Съоражение', 'Землище', 'Начин на поливане', 'Култура', '№ поливка', 'Площ', 'куб.м./дка', 'Вода куб.м.', 'Ед. цена', 'Стойност', 'Месец']
    const rows = filtered.map(a => {
      const cont = contractors.find(x => x.id === a.contractorId)
      const h = htus.find(x => x.id === a.htuId)
      const method = irrigationMethods.find(x => x.id === a.irrigationMethodId)
      const crop = crops.find(x => x.id === a.cropId)
      return {
        'Дата': formatActDate(a.date), 'Номер': a.number, 'Контрагент': cont?.name ?? '',
        'ХТУ': h?.htuName ?? '', 'Съоражение': h?.equipment ?? '', 'Землище': a.village,
        'Начин на поливане': method?.name ?? '', 'Култура': crop?.name ?? '', '№ поливка': a.irrigationNumber,
        'Площ': a.area, 'куб.м./дка': a.cubicPerDka, 'Вода куб.м.': a.waterCubic,
        'Ед. цена': a.unitPrice, 'Стойност': a.value, 'Месец': a.month,
      }
    })
    const filename = exportFilename('Актове', [htuFilter])
    exportStyledRowsToSpreadsheet(headers, rows, 'Актове', filename, {
      headerColor: '3B82F6', totalColor: 'DBEAFE',
      numericColumns: ['Площ', 'Вода куб.м.', 'Стойност'],
    })
  }

  const htu = htus.find(h => h.id === form.htuId)
  const contractor = contractors.find(c => c.id === form.contractorId)
  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Актове"
        subtitle={`${countActs(acts)} акта (${acts.length} записа)`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по номер, контрагент..." />
            {initialContractorId && onClearFilter && (
              <Btn variant="secondary" onClick={() => { setSearch(''); onClearFilter(); }}>
                Изчисти филтър
              </Btn>
            )}
            {!isArchiveMode && selected.size > 0 && (
              <Btn variant="secondary" onClick={() => setBulkModal(true)}>
                <EditIcon /> Масово редактиране ({selected.size})
              </Btn>
            )}
            {!isArchiveMode && <ImportButton onFile={handleImport} />}
            <Btn variant="secondary" onClick={exportActs}><ExportIcon /> Експорт</Btn>
            {!isArchiveMode && (
              <Btn variant="danger" onClick={() => setDeleteAllConfirm(true)} disabled={acts.length === 0}>
                <TrashIcon /> Изтрий всичко
              </Btn>
            )}
            {!isArchiveMode && <Btn onClick={openAdd}>+ Нов акт</Btn>}
          </>
        }
      />

      {isAdmin && (
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
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gradient-to-br from-blue-500 to-blue-600">
                {!isArchiveMode && (
                  <th className="px-2 py-2.5 w-10">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                  </th>
                )}
                {([
                  ['Дата', 'date'], ['Номер', 'number'], ['Контрагент', 'contractorName'], [<span className="block text-center">ХТУ</span>, 'htuName', 'ХТУ'],
                  [<span className="block text-center">Съоражение</span>, 'equipment', 'Съоражение'], ['Землище', 'village'], ['Начин на поливане', 'methodName'], ['Култура', 'cropName'],
                  [<span className="block text-center leading-tight">№<br/>поливка</span>, 'irrigationNumber', '№ поливка'], ['Площ', 'area'], [<span className="block text-center leading-tight">куб.м./дка</span>, null, 'куб.м./дка'], [<span className="block text-center leading-tight">Вода куб.м.</span>, null, 'Вода куб.м.'],
                  ['Ед. цена', null], ['Стойност', null], ['Месец', null], ['Действия', null],
                ] as [React.ReactNode, SortField | null, string?][]).map(([h, field, key]) => (
                  <th
                    key={key ?? String(h)}
                    onClick={field ? () => toggleSort(field) : undefined}
                    className={`text-center px-2 py-2.5 text-xs font-semibold text-white uppercase tracking-wide ${field ? 'cursor-pointer select-none hover:bg-white/10 transition-colors' : ''}`}
                  >
                    {h}{field && sortField === field && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={17}><EmptyState message="Няма намерени актове" /></td></tr>
              ) : (
                filtered.map((a, i) => {
                  const cont = contractors.find(x => x.id === a.contractorId)
                  const h = htus.find(x => x.id === a.htuId)
                  const method = irrigationMethods.find(x => x.id === a.irrigationMethodId)
                  const crop = crops.find(x => x.id === a.cropId)
                  return (
                    <tr key={a.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'} ${selected.has(a.id) ? 'bg-teal-50' : ''}`}>
                      {!isArchiveMode && (
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="rounded" />
                        </td>
                      )}
                      <td className="px-2 py-2 text-gray-600">{formatActDate(a.date)}</td>
                      <td className="px-2 py-2 font-medium text-gray-900">{a.number}</td>
                      <td className="px-2 py-2 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600 text-center">{h?.htuName ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600 text-center">{h?.equipment ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600">{a.village}</td>
                      <td className="px-2 py-2 text-gray-600">{method?.name ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600">{crop?.name ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600 text-center">{a.irrigationNumber}</td>
                      <td className="px-2 py-2 text-left text-xs">{num(a.area, 2)}</td>
                      <td className="px-2 py-2 text-left text-xs">{num(a.cubicPerDka, 0)}</td>
                      <td className="px-2 py-2 text-left text-xs">{num(a.waterCubic, 0)}</td>
                      <td className="px-2 py-2 text-left text-xs">{num(a.unitPrice, 4)}</td>
                      <td className="px-2 py-2 text-left text-xs font-semibold text-teal-700">{num(a.value, 2)}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{a.month}</td>
                      {!isArchiveMode && (
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Btn size="sm" variant="ghost" onClick={() => useAsTemplate(a)}>📋</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => openEdit(a)}><EditIcon /></Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setDeleteId(a.id)}><TrashIcon /></Btn>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {acts.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            📋 Натиснете иконата за шаблон, за да създадете нов акт с копирани данни за съоражение, ХТУ и начин на поливане.
          </div>
        )}
      </Card>

      {isOpen && (
        <Modal title={adding ? 'Нов Акт' : 'Редактирай Акт'} onClose={() => { setAdding(false); setEditing(null) }} onSave={save} wide>
          <div className="grid grid-cols-3 gap-4">
            <FormRow label="Дата" required>
              <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
            </FormRow>
            <FormRow label="Номер" required>
              <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="А-001/2024" />
            </FormRow>

            <div className="col-span-2">
              <FormRow label="Контрагент" required>
                <Combobox
                  value={form.contractorId}
                  onChange={setContractor}
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
            <div className="col-span-3">
              <FormRow label="Култура">
                <Select value={form.cropId} onChange={e => setCrop(e.target.value)}>
                  <option value="">— Избери —</option>
                  {crops.map(c => {
                    const match = contractsForContractor(form.contractorId).find(x => x.cropId === c.id)
                    return <option key={c.id} value={c.id}>{c.name}{match ? ` — по договор: ${num(match.area, 2)} дка` : ''}</option>
                  })}
                </Select>
                {form.contractorId && contractsForContractor(form.contractorId).length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    По договор с този контрагент: {contractsForContractor(form.contractorId).map(c => `${crops.find(x => x.id === c.cropId)?.name ?? '—'} (${num(c.area, 2)} дка)`).join(', ')}. Площта, ХТУ, начинът на поливане, куб.м./дка и ед. цената се попълват автоматично при избор — може да ги коригирате при нужда.
                  </p>
                )}
              </FormRow>
            </div>
            <FormRow label="№ поливка">
              <Input value={form.irrigationNumber} onChange={e => setF({ irrigationNumber: e.target.value })} placeholder="1" />
            </FormRow>

            <FormRow label="Площ (дка)">
              <Input type="number" value={form.area || ''} onChange={e => setF({ area: parseFloat(e.target.value) || 0 })} placeholder="50" />
            </FormRow>
            <FormRow label="куб.м./дка">
              <Input type="number" value={form.cubicPerDka || ''} onChange={e => setF({ cubicPerDka: parseFloat(e.target.value) || 0 })} placeholder="380" />
            </FormRow>

            <FormRow label="Вода куб.м." required>
              <Input type="number" value={form.waterCubic || ''} onChange={e => setF({ waterCubic: parseFloat(e.target.value) || 0 })} placeholder="76000" />
            </FormRow>
            <FormRow label="Ед. цена (€)">
              <NumberInput value={form.unitPrice} onChange={n => setF({ unitPrice: n })} placeholder="0.0800" />
            </FormRow>
            <FormRow label="Стойност (автом.)">
              <div className="px-3 py-2 bg-teal-50 rounded-lg border border-teal-100 text-teal-800 font-semibold text-sm">
                {num(form.value, 2)} €
              </div>
            </FormRow>
          </div>
          {formError && <p className="text-sm text-red-500 mt-4">{formError}</p>}
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            {adding && <Btn variant="secondary" onClick={saveAndNew} disabled={!form.number.trim() || !form.contractorId}>Запис и нов</Btn>}
            <Btn onClick={save} disabled={!form.number.trim() || !form.contractorId}>Запази</Btn>
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
          message="Сигурни ли сте, че искате да изтриете този акт?"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {deleteAllConfirm && (
        <ConfirmDialog
          message={`Сигурни ли сте, че искате да изтриете ВСИЧКИ актове (${acts.length})? Това действие е необратимо.`}
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
