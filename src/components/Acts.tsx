import { useState } from 'react'
import { useStore } from '../store'
import type { Act } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon } from './ui'
import { parseSpreadsheetFile, exportRowsToSpreadsheet, cellToDateStr, cellToNum, findByField, rowGet } from '../lib/spreadsheet'

const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
const DOC_TYPES = ['Акт', 'Фактура', 'Протокол', 'Разписка', 'Друго']

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
  unitPrice: 0,
  value: 0,
  month: '',
}

function calcAct(f: ActForm): ActForm {
  const value = Number(f.waterCubic) * Number(f.unitPrice)
  const monthIndex = Number(f.date.slice(5, 7)) - 1
  const month = MONTHS[monthIndex] ?? f.month
  return { ...f, value, month }
}

export default function Acts() {
  const { acts, setActs, contractors, htus, irrigationMethods, crops } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Act | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ActForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkField, setBulkField] = useState<'unitPrice' | 'area' | 'cubicPerDka'>('unitPrice')
  const [bulkValue, setBulkValue] = useState('')
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [htuFilter, setHtuFilter] = useState<string | null>(null)

  const htuCounts = htus.map(h => ({ htu: h, count: acts.filter(a => a.htuId === h.id).length }))

  const filtered = acts.filter(a => {
    const cont = contractors.find(x => x.id === a.contractorId)
    const q = search.toLowerCase()
    return (
      (!htuFilter || a.htuId === htuFilter) &&
      (
        a.number.toLowerCase().includes(q) ||
        a.docType.toLowerCase().includes(q) ||
        (cont?.name.toLowerCase().includes(q) ?? false) ||
        a.village.toLowerCase().includes(q) ||
        a.month.toLowerCase().includes(q) ||
        a.irrigationNumber.toLowerCase().includes(q)
      )
    )
  })

  function defaultForm(): ActForm {
    return { ...EMPTY, contractorId: contractors[0]?.id ?? '', htuId: htus[0]?.id ?? '', village: htus[0]?.village ?? '', irrigationMethodId: irrigationMethods[0]?.id ?? '', cropId: crops[0]?.id ?? '' }
  }

  function openAdd() {
    setForm(defaultForm())
    setAdding(true)
  }

  function openEdit(a: Act) {
    const { id, ...rest } = a
    void id
    setForm(rest)
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
    setAdding(true)
  }

  function setF(patch: Partial<ActForm>) {
    setForm(prev => calcAct({ ...prev, ...patch }))
  }

  function save() {
    if (!form.number.trim() || !form.contractorId) return
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
    setActs([...acts, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setActs(acts.filter(a => a.id !== deleteId)); setDeleteId(null) }
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
    const val = parseFloat(bulkValue)
    if (isNaN(val)) return
    setActs(acts.map(a => {
      if (!selected.has(a.id)) return a
      const updated = { ...a, [bulkField]: val }
      return { ...updated, ...calcAct(updated) }
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
    const added: Act[] = []
    rows.forEach((row, i) => {
      const rowNum = i + 2
      const number = String(rowGet(row, 'Номер', '№') ?? '').trim()
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
        unitPrice: cellToNum(rowGet(row, 'Ед. цена')),
        value: 0,
        month: String(rowGet(row, 'Месец') ?? '').trim(),
      }
      added.push({ ...calcAct(base), id: `${Date.now()}-${i}` })
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
        'Дата': a.date, 'Номер': a.number, 'Контрагент': cont?.name ?? '',
        'ХТУ': h?.htuName ?? '', 'Съоражение': h?.equipment ?? '', 'Землище': a.village,
        'Начин на поливане': method?.name ?? '', 'Култура': crop?.name ?? '', '№ поливка': a.irrigationNumber,
        'Площ': a.area, 'куб.м./дка': a.cubicPerDka, 'Вода куб.м.': a.waterCubic,
        'Ед. цена': a.unitPrice, 'Стойност': a.value, 'Месец': a.month,
      }
    })
    exportRowsToSpreadsheet(headers, rows, 'Актове', `Актове_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const htu = htus.find(h => h.id === form.htuId)
  const contractor = contractors.find(c => c.id === form.contractorId)
  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Актове"
        subtitle={`${acts.length} записа`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по номер, контрагент..." />
            {selected.size > 0 && (
              <Btn variant="secondary" onClick={() => setBulkModal(true)}>
                <EditIcon /> Масово редактиране ({selected.size})
              </Btn>
            )}
            <ImportButton onFile={handleImport} />
            <Btn variant="secondary" onClick={exportActs}><ExportIcon /> Експорт</Btn>
            <Btn onClick={openAdd}>+ Нов акт</Btn>
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
              <tr className="bg-gradient-to-br from-blue-500 to-blue-600">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                {['Дата', 'Номер', 'Контрагент', 'ХТУ', 'Съоражение', 'Землище', 'Начин на поливане', 'Култура', '№ поливка', 'Площ', 'куб.м./дка', 'Вода куб.м.', 'Ед. цена', 'Стойност', 'Месец', 'Действия'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-white uppercase tracking-wide">{h}</th>
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
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{a.date}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{a.number}</td>
                      <td className="px-3 py-2.5 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{h?.htuName ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{h?.equipment ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{a.village}</td>
                      <td className="px-3 py-2.5 text-gray-600">{method?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{crop?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{a.irrigationNumber}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(a.area, 2)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(a.cubicPerDka, 0)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(a.waterCubic, 0)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{num(a.unitPrice, 4)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-teal-700">{num(a.value, 2)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{a.month}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Btn size="sm" variant="ghost" onClick={() => useAsTemplate(a)}>📋</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => openEdit(a)}><EditIcon /></Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setDeleteId(a.id)}><TrashIcon /></Btn>
                        </div>
                      </td>
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
        <Modal title={adding ? 'Нов Акт' : 'Редактирай Акт'} onClose={() => { setAdding(false); setEditing(null) }} wide>
          <div className="grid grid-cols-3 gap-4">
            <FormRow label="Вид документ">
              <Select value={form.docType} onChange={e => setF({ docType: e.target.value })}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Дата" required>
              <Input type="date" value={form.date} onChange={e => setF({ date: e.target.value })} />
            </FormRow>
            <FormRow label="Номер" required>
              <Input value={form.number} onChange={e => setF({ number: e.target.value })} placeholder="А-001/2024" />
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
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            {adding && <Btn variant="secondary" onClick={saveAndNew} disabled={!form.number.trim() || !form.contractorId}>Запис и нов</Btn>}
            <Btn onClick={save} disabled={!form.number.trim() || !form.contractorId}>Запази</Btn>
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
          message="Сигурни ли сте, че искате да изтриете този акт?"
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
