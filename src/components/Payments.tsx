import { useState } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Payment } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Combobox, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, num, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, Badge } from './ui'
import { parseSpreadsheetFile, exportStyledRowsToSpreadsheet, exportFilename, cellToNum, cellToDateStr, findByField, findSimilarByField, rowGet } from '../lib/spreadsheet'

const EMPTY: Omit<Payment, 'id'> = { invoiceNumber: '', invoiceDate: '', contractorId: '', items: [], amount: 0, paid: false }

/** Formats an "yyyy-mm-dd" date string as "dd.mm.yy" (e.g. "2026-07-29" -> "29.07.26"). */
function formatPaymentDate(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y.slice(2)}`
}

type SortField = 'invoiceNumber' | 'invoiceDate' | 'contractorName' | 'crops' | 'area' | 'amount' | 'status'

export default function Payments() {
  const { payments, setPayments, contractors, crops, contracts, htus, findOrCreateContractor, isArchiveMode } = useStore()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Payment | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [paidFilter, setPaidFilter] = useState<boolean | null>(null)
  const [htuFilter, setHtuFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  /** A payment has no ХТУ field of its own — derived from the ХТУ(та) of its contractor's contracts. */
  function paymentHtuIds(p: Payment): string[] {
    return [...new Set(contracts.filter(c => c.contractorId === p.contractorId).map(c => c.htuId).filter(Boolean))]
  }

  /** Tabs aggregate by ХТУ name across all its съоражения, not per individual съоражение row. */
  function htuIdsForName(name: string): string[] {
    return htus.filter(h => h.htuName === name).map(h => h.id)
  }

  function sortValue(p: Payment, field: SortField): string | number {
    switch (field) {
      case 'invoiceNumber': return p.invoiceNumber
      case 'invoiceDate': return p.invoiceDate
      case 'contractorName': return contractors.find(c => c.id === p.contractorId)?.name ?? ''
      case 'crops': return p.items.map(i => crops.find(c => c.id === i.cropId)?.name).filter(Boolean).join(', ')
      case 'area': return p.items.reduce((sum, i) => sum + (i.area || 0), 0)
      case 'amount': return p.amount
      case 'status': return p.paid ? 1 : 0
    }
  }

  const htuNames = [...new Set(htus.map(h => h.htuName))]
  const htuCounts = htuNames.map(name => ({
    name,
    count: payments.filter(p => paymentHtuIds(p).some(id => htuIdsForName(name).includes(id))).length,
  }))

  const filtered = payments.filter(p => {
    const cont = contractors.find(c => c.id === p.contractorId)
    const q = search.toLowerCase()

    // Check if search matches any crop name or area in items
    const matchesItems = p.items.some(item => {
      const crop = crops.find(c => c.id === item.cropId)
      return (
        (crop?.name.toLowerCase().includes(q) ?? false) ||
        String(item.area).includes(q)
      )
    })

    return (
      (paidFilter === null || p.paid === paidFilter) &&
      (!htuFilter || paymentHtuIds(p).some(id => htuIdsForName(htuFilter).includes(id))) &&
      (
        p.invoiceNumber.toLowerCase().includes(q) ||
        (cont?.name.toLowerCase().includes(q) ?? false) ||
        matchesItems
      )
    )
  }).sort((a, b) => {
    if (!sortField) return 0
    const va = sortValue(a, sortField), vb = sortValue(b, sortField)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'bg', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  /** A contractor's contracted crops+areas, offered as pre-fillable items — same pattern as Заявки. */
  function itemsFromContractor(contractorId: string): { cropId: string; area: number }[] {
    return contracts.filter(c => c.contractorId === contractorId).map(c => ({ cropId: c.cropId, area: c.area }))
  }

  function defaultForm(): Omit<Payment, 'id'> {
    const contractorId = contractors[0]?.id ?? ''
    return { ...EMPTY, contractorId, items: itemsFromContractor(contractorId), invoiceDate: new Date().toISOString().slice(0, 10) }
  }

  function setContractor(contractorId: string) {
    setForm(f => ({ ...f, contractorId, items: itemsFromContractor(contractorId) }))
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
  function openAdd() { setForm(defaultForm()); setFormError(null); setAdding(true) }
  function openEdit(p: Payment) { const { id, ...rest } = p; void id; setForm(rest); setFormError(null); setEditing(p) }
  function toggleItem(cropId: string, defaultArea: number) {
    setForm(f => {
      const exists = f.items.some(i => i.cropId === cropId)
      return {
        ...f,
        items: exists ? f.items.filter(i => i.cropId !== cropId) : [...f.items, { cropId, area: defaultArea }],
      }
    })
  }
  function updateCropArea(cropId: string, area: number) {
    setForm(f => ({ ...f, items: f.items.map(i => i.cropId === cropId ? { ...i, area } : i) }))
  }

  function save() {
    if (!form.invoiceNumber.trim() || !form.contractorId) return
    const dup = findByField(payments.filter(p => p.id !== editing?.id), 'invoiceNumber', form.invoiceNumber)
    if (dup) { setFormError(`Вече съществува фактура с номер "${form.invoiceNumber}".`); return }
    setFormError(null)
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
    if (findByField(payments, 'invoiceNumber', form.invoiceNumber)) { setFormError(`Вече съществува фактура с номер "${form.invoiceNumber}".`); return }
    setFormError(null)
    setPayments([...payments, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setPayments(payments.filter(p => p.id !== deleteId)); setDeleteId(null) }
  }

  function confirmDeleteAll() {
    setPayments([])
    setDeleteAllConfirm(false)
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

      // Всички редове се импортират - няма проверка за дубликати
      // Плащания с един номер на фактура могат да имат няколко реда

      const contractor = findByField(contractors, 'name', contractorName)
      if (!contractor) { errors.push(`Ред ${rowNum}: контрагент "${contractorName}" не е намерен`); return }
      const cropNames = String(rowGet(row, 'Култури', 'Култура') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const items: { cropId: string; area: number }[] = []
      cropNames.forEach(cropName => {
        const crop = findSimilarByField(crops, 'name', cropName)
        if (crop) items.push({ cropId: crop.id, area: 0 })
        else errors.push(`Ред ${rowNum}: култура "${cropName}" не е намерена, пропусната`)
      })
      const paidRaw = String(rowGet(row, 'Платена') ?? '').trim().toLowerCase()
      added.push({
        id: `${Date.now()}-${i}`,
        invoiceNumber,
        invoiceDate: cellToDateStr(rowGet(row, 'Дата на фактура', 'Дата')),
        contractorId: contractor.id,
        items,
        amount: cellToNum(rowGet(row, 'Сума €', 'Сума (€)', 'Сума', 'Стойност')),
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
        '№ Фактура': p.invoiceNumber, 'Дата на фактура': p.invoiceDate ? formatPaymentDate(p.invoiceDate) : '', 'Контрагент': cont?.name ?? '', 'Култури': cropNames, 'Дка': totalArea,
        'Сума €': p.amount, 'Статус': p.paid ? 'Платена' : 'Неплатена',
      }
    })
    const paidLabel = paidFilter === true ? 'Платени' : paidFilter === false ? 'Неплатени' : null
    const filename = exportFilename('Плащания', [htuFilter, paidLabel])
    exportStyledRowsToSpreadsheet(headers, rows, 'Плащания', filename, {
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
            {!isArchiveMode && <ImportButton onFile={handleImport} />}
            <Btn variant="secondary" onClick={exportPayments}><ExportIcon /> Експорт</Btn>
            {!isArchiveMode && (
              <Btn variant="danger" onClick={() => setDeleteAllConfirm(true)} disabled={payments.length === 0}>
                <TrashIcon /> Изтрий всичко
              </Btn>
            )}
            {!isArchiveMode && <Btn onClick={openAdd}>+ Нова фактура</Btn>}
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
                {!isArchiveMode && (
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                  </th>
                )}
                {([
                  ['№ Фактура', 'invoiceNumber'], ['Дата на фактура', 'invoiceDate'], ['Контрагент', 'contractorName'], ['Култури', 'crops'],
                  ['Дка', 'area'], ['Сума €', 'amount'], ['Статус', 'status'], ['Действия', null],
                ] as [string, SortField | null][]).map(([h, field]) => (
                  <th
                    key={h}
                    onClick={field ? () => toggleSort(field) : undefined}
                    className={`text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap ${field ? 'cursor-pointer select-none hover:bg-white/10 transition-colors' : ''}`}
                  >
                    {h}{field && sortField === field && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
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
                      {!isArchiveMode && (
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900">{p.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{p.invoiceDate ? formatPaymentDate(p.invoiceDate) : '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{cont?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{cropNames || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{num(totalArea, 2)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{num(p.amount, 2)}</td>
                      <td className="px-4 py-3">
                        <Badge color={p.paid ? 'teal' : 'red'}>{p.paid ? 'Платена' : 'Неплатена'}</Badge>
                      </td>
                      {!isArchiveMode && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Btn size="sm" variant="ghost" onClick={() => openEdit(p)}><EditIcon /></Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}><TrashIcon /></Btn>
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
      </Card>

      {isOpen && (
        <Modal
          title={adding ? 'Нова фактура' : 'Редактирай фактура'}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSave={save}
        >
          <div className="flex flex-col gap-4">
            <FormRow label="№ Фактура" required>
              <Input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Ф-001/2026" />
            </FormRow>
            <FormRow label="Дата на фактура">
              <Input type="date" value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} />
            </FormRow>
            <FormRow label="Контрагент" required>
              <Combobox
                value={form.contractorId}
                onChange={setContractor}
                options={contractors.map(c => ({ id: c.id, label: c.name }))}
                onCreate={name => findOrCreateContractor(name)}
                placeholder="Избери или въведи контрагент..."
              />
            </FormRow>
            <FormRow label="Култури и площи по договор">
              {(() => {
                const contractorContracts = contracts.filter(c => c.contractorId === form.contractorId)
                if (!form.contractorId) return <p className="text-xs text-gray-400">Първо избери контрагент.</p>
                if (contractorContracts.length === 0) return <p className="text-xs text-gray-400">Няма договори за този контрагент.</p>
                return (
                  <div className="flex flex-col gap-2 border border-gray-200 rounded-lg p-3">
                    {contractorContracts.map(c => {
                      const crop = crops.find(x => x.id === c.cropId)
                      const item = form.items.find(i => i.cropId === c.cropId)
                      const checked = !!item
                      return (
                        <div key={c.id} className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(c.cropId, c.area)}
                            className="rounded"
                          />
                          <span className="flex-1 text-sm text-gray-700">{crop?.name ?? '—'} <span className="text-gray-400">(по договор: {num(c.area, 2)} дка)</span></span>
                          {checked && (
                            <div className="w-28">
                              <NumberInput value={item.area} onChange={n => updateCropArea(c.cropId, n)} placeholder="дка" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
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
          {formError && <p className="text-sm text-red-500 mt-4">{formError}</p>}
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

      {deleteAllConfirm && (
        <ConfirmDialog
          message={`Сигурни ли сте, че искате да изтриете ВСИЧКИ фактури (${payments.length})? Това действие е необратимо.`}
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
