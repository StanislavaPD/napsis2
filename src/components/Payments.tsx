import { useState } from 'react'
import { useStore } from '../store'
import type { Payment } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, Badge } from './ui'
import { parseSpreadsheetFile, exportStyledRowsToSpreadsheet, cellToNum, cellToDateStr, findByField, rowGet } from '../lib/spreadsheet'

const EMPTY: Omit<Payment, 'id'> = { invoiceNumber: '', invoiceDate: '', contractorId: '', items: [], amount: 0, paid: false }

export default function Payments() {
  const { payments, setPayments, contractors, crops } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Payment | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [paidFilter, setPaidFilter] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = payments.filter(p => {
    const cont = contractors.find(c => c.id === p.contractorId)
    const q = search.toLowerCase()
    return (
      (paidFilter === null || p.paid === paidFilter) &&
      (
        p.invoiceNumber.toLowerCase().includes(q) ||
        (cont?.name.toLowerCase().includes(q) ?? false)
      )
    )
  })

  function defaultForm(): Omit<Payment, 'id'> {
    return { ...EMPTY, contractorId: contractors[0]?.id ?? '', invoiceDate: new Date().toISOString().slice(0, 10) }
  }

  function toggleSelect(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSelected(s)
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)))
  }
  function markSelected(paid: boolean) {
    setPayments(payments.map(p => selected.has(p.id) ? { ...p, paid } : p))
    setSelected(new Set())
  }
  function openAdd() { setForm(defaultForm()); setAdding(true) }
  function openEdit(p: Payment) { const { id, ...rest } = p; void id; setForm(rest); setEditing(p) }
  function addCropItem(cropId: string) {
    if (!cropId || form.items.some(i => i.cropId === cropId)) return
    setForm(f => ({ ...f, items: [...f.items, { cropId, area: 0 }] }))
  }
  function removeCropItem(cropId: string) {
    setForm(f => ({ ...f, items: f.items.filter(i => i.cropId !== cropId) }))
  }
  function updateCropArea(cropId: string, area: number) {
    setForm(f => ({ ...f, items: f.items.map(i => i.cropId === cropId ? { ...i, area } : i) }))
  }

  function save() {
    if (!form.invoiceNumber.trim() || !form.contractorId) return
    if (adding) {
      setPayments([...payments, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setPayments(payments.map(p => p.id === editing.id ? { ...p, ...form } : p))
      setEditing(null)
    }
  }

  function saveAndNew() {
    if (!form.invoiceNumber.trim() || !form.contractorId || !adding) return
    setPayments([...payments, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setPayments(payments.filter(p => p.id !== deleteId)); setDeleteId(null) }
  }

  async function handleImport(file: File) {
    const rows = await parseSpreadsheetFile(file)
    const errors: string[] = []
    const added: Payment[] = []
    rows.forEach((row, i) => {
      const rowNum = i + 2
      const invoiceNumber = String(rowGet(row, '№ Фактура', 'Номер') ?? '').trim()
      const contractorName = String(rowGet(row, 'Контрагент') ?? '').trim()
      if (!invoiceNumber || !contractorName) { errors.push(`Ред ${rowNum}: липсва номер или контрагент`); return }
      const contractor = findByField(contractors, 'name', contractorName)
      if (!contractor) { errors.push(`Ред ${rowNum}: контрагент "${contractorName}" не е намерен`); return }
      const cropNames = String(rowGet(row, 'Култури', 'Култура') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const items: { cropId: string; area: number }[] = []
      cropNames.forEach(cropName => {
        const crop = findByField(crops, 'name', cropName)
        if (crop) items.push({ cropId: crop.id, area: 0 })
        else errors.push(`Ред ${rowNum}: култура "${cropName}" не е намерена, пропусната`)
      })
      const paidRaw = String(rowGet(row, 'Платена') ?? '').trim().toLowerCase()
      added.push({
        id: `${Date.now()}-${i}`,
        invoiceNumber,
        invoiceDate: cellToDateStr(rowGet(row, 'Дата на фактура')),
        contractorId: contractor.id,
        items,
        amount: cellToNum(rowGet(row, 'Сума €', 'Сума')),
        paid: paidRaw === 'да' || paidRaw === 'платена' || paidRaw === 'true' || paidRaw === '1',
      })
    })
    if (added.length) setPayments([...payments, ...added])
    setImportResult({ added: added.length, errors })
  }

  function exportPayments() {
    const headers = ['№ Фактура', 'Дата на фактура', 'Контрагент', 'Култури', 'Дка', 'Сума €', 'Статус']
    const rows = filtered.map(p => {
      const cont = contractors.find(c => c.id === p.contractorId)
      const cropNames = p.items.map(i => crops.find(c => c.id === i.cropId)?.name).filter(Boolean).join(', ')
      const totalArea = p.items.reduce((sum, i) => sum + (i.area || 0), 0)
      return {
        '№ Фактура': p.invoiceNumber, 'Дата на фактура': p.invoiceDate, 'Контрагент': cont?.name ?? '', 'Култури': cropNames, 'Дка': totalArea,
        'Сума €': p.amount, 'Статус': p.paid ? 'Платена' : 'Неплатена',
      }
    })
    exportStyledRowsToSpreadsheet(headers, rows, 'Плащания', `Плащания_${new Date().toISOString().slice(0, 10)}.xlsx`, {
      headerColor: 'F59E0B', totalColor: 'FEF3C7',
      numericColumns: ['Дка', 'Сума €'],
    })
  }

  const totalAmount = filtered.reduce((sum, p) => sum + (p.amount || 0), 0)
  const paidAmount = filtered.filter(p => p.paid).reduce((sum, p) => sum + (p.amount || 0), 0)
  const unpaidAmount = totalAmount - paidAmount

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Плащания"
        subtitle={`${payments.length} записа · ${num(unpaidAmount, 2)} € неплатени`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по номер, контрагент..." />
            <ImportButton onFile={handleImport} />
            <Btn variant="secondary" onClick={exportPayments}><ExportIcon /> Експорт</Btn>
            <Btn onClick={openAdd}>+ Нова фактура</Btn>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={() => setPaidFilter(null)} className="text-left">
          <Card className={`p-4 bg-gradient-to-br from-teal-500 to-teal-600 text-white transition-shadow ${paidFilter === null ? 'ring-2 ring-teal-300' : ''}`}>
            <p className="text-xs text-teal-50">Общо фактурирано</p>
            <p className="mt-1 text-2xl font-semibold">{num(totalAmount, 2)} €</p>
          </Card>
        </button>
        <button onClick={() => setPaidFilter(v => v === true ? null : true)} className="text-left">
          <Card className={`p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white transition-shadow ${paidFilter === true ? 'ring-2 ring-emerald-300' : ''}`}>
            <p className="text-xs text-emerald-50">Платено</p>
            <p className="mt-1 text-2xl font-semibold">{num(paidAmount, 2)} €</p>
          </Card>
        </button>
        <button onClick={() => setPaidFilter(v => v === false ? null : false)} className="text-left">
          <Card className={`p-4 bg-gradient-to-br from-amber-400 to-amber-500 text-white transition-shadow ${paidFilter === false ? 'ring-2 ring-amber-300' : ''}`}>
            <p className="text-xs text-amber-50">Неплатено</p>
            <p className="mt-1 text-2xl font-semibold">{num(unpaidAmount, 2)} €</p>
          </Card>
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-teal-50 border border-teal-100 rounded-xl">
          <span className="text-sm text-teal-800 font-medium">Избрани: {selected.size}</span>
          <Btn size="sm" onClick={() => markSelected(true)}>Маркирай като платени</Btn>
          <Btn size="sm" variant="secondary" onClick={() => markSelected(false)}>Маркирай като неплатени</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Изчисти избора</Btn>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-br from-amber-400 to-amber-500">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                {['№ Фактура', 'Дата на фактура', 'Контрагент', 'Култури', 'Дка', 'Сума €', 'Статус', 'Действия'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9}><EmptyState message="Няма намерени фактури" /></td></tr>
              ) : (
                filtered.map((p, i) => {
                  const cont = contractors.find(c => c.id === p.contractorId)
                  const cropNames = p.items.map(item => crops.find(c => c.id === item.cropId)?.name).filter(Boolean).join(', ')
                  const totalArea = p.items.reduce((sum, item) => sum + (item.area || 0), 0)
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'} ${selected.has(p.id) ? 'bg-teal-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{p.invoiceDate || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{cropNames || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{num(totalArea, 2)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{num(p.amount, 2)}</td>
                      <td className="px-4 py-3">
                        <Badge color={p.paid ? 'teal' : 'red'}>{p.paid ? 'Платена' : 'Неплатена'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Btn size="sm" variant="ghost" onClick={() => openEdit(p)}><EditIcon /></Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}><TrashIcon /></Btn>
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
        <Modal
          title={adding ? 'Нова фактура' : 'Редактирай фактура'}
          onClose={() => { setAdding(false); setEditing(null) }}
        >
          <div className="flex flex-col gap-4">
            <FormRow label="№ Фактура" required>
              <Input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Ф-001/2026" />
            </FormRow>
            <FormRow label="Дата на фактура">
              <Input type="date" value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} />
            </FormRow>
            <FormRow label="Контрагент" required>
              <Select value={form.contractorId} onChange={e => setForm({ ...form, contractorId: e.target.value })}>
                <option value="">— Избери —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Култури и дка">
              <div className="flex flex-col gap-2">
                {form.items.map(item => {
                  const crop = crops.find(c => c.id === item.cropId)
                  return (
                    <div key={item.cropId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-700">{crop?.name ?? '—'}</span>
                      <div className="w-28">
                        <NumberInput value={item.area} onChange={n => updateCropArea(item.cropId, n)} placeholder="дка" />
                      </div>
                      <Btn size="sm" variant="ghost" onClick={() => removeCropItem(item.cropId)}>✕</Btn>
                    </div>
                  )
                })}
                <Select value="" onChange={e => addCropItem(e.target.value)}>
                  <option value="">+ Добави култура —</option>
                  {crops.filter(c => !form.items.some(i => i.cropId === c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
            </FormRow>
            <FormRow label="Сума (€)" required>
              <NumberInput value={form.amount} onChange={n => setForm({ ...form, amount: n })} placeholder="100.00" />
            </FormRow>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="paid"
                checked={form.paid}
                onChange={e => setForm({ ...form, paid: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="paid" className="text-sm text-gray-700">Платена</label>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            {adding && <Btn variant="secondary" onClick={saveAndNew} disabled={!form.invoiceNumber.trim() || !form.contractorId}>Запис и нов</Btn>}
            <Btn onClick={save} disabled={!form.invoiceNumber.trim() || !form.contractorId}>Запази</Btn>
          </div>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Сигурни ли сте, че искате да изтриете тази фактура?"
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
