import { useState, useMemo } from 'react'
import { useStore } from '../store'
import type { IrrigRequest } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Select, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, Badge, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, num } from './ui'
import { parseSpreadsheetFile, exportRowsToSpreadsheet, cellToNum, cellToDateStr, findByField, rowGet } from '../lib/spreadsheet'

type ReqForm = Omit<IrrigRequest, 'id'>

const EMPTY: ReqForm = {
  contractorId: '',
  irrigationNumber: '',
  startDate: '',
  endDate: '',
  items: [],
}

const APPROACHING_WINDOW_DAYS = 7

type ReqStatus = 'completed' | 'overdue' | 'approaching' | 'active' | 'noDeadline'

function computeStatus(r: IrrigRequest, isCompleted: boolean, today: string): ReqStatus {
  if (isCompleted) return 'completed'
  if (!r.endDate) return 'noDeadline'
  if (r.endDate < today) return 'overdue'
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + APPROACHING_WINDOW_DAYS)
  const windowEndStr = windowEnd.toISOString().slice(0, 10)
  if (r.endDate <= windowEndStr) return 'approaching'
  return 'active'
}

export default function Requests() {
  const { requests, setRequests, contractors, crops, acts, contracts } = useStore()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<IrrigRequest | null>(null)
  const [form, setForm] = useState<ReqForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReqStatus | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const isRequestCompleted = (r: IrrigRequest) =>
    r.items.some(item => acts.some(a => a.contractorId === r.contractorId && a.cropId === item.cropId))

  const statusById = useMemo(() => {
    const map = new Map<string, ReqStatus>()
    requests.forEach(r => map.set(r.id, computeStatus(r, isRequestCompleted(r), today)))
    return map
  }, [requests, acts, today])

  const approachingCount = [...statusById.values()].filter(s => s === 'approaching').length
  const overdueCount = [...statusById.values()].filter(s => s === 'overdue').length
  const completedCount = [...statusById.values()].filter(s => s === 'completed').length
  const noDeadlineCount = [...statusById.values()].filter(s => s === 'noDeadline').length

  const filtered = requests.filter(r => {
    const cont = contractors.find(x => x.id === r.contractorId)
    const q = search.toLowerCase()
    return (
      (!statusFilter || statusById.get(r.id) === statusFilter) &&
      (
        (cont?.name.toLowerCase().includes(q) ?? false) ||
        r.irrigationNumber.toLowerCase().includes(q)
      )
    )
  })

  function itemsFromContractor(contractorId: string): { cropId: string; area: number }[] {
    return contracts.filter(c => c.contractorId === contractorId).map(c => ({ cropId: c.cropId, area: c.area }))
  }

  function defaultForm(): ReqForm {
    const contractorId = contractors[0]?.id ?? ''
    return { ...EMPTY, contractorId, items: itemsFromContractor(contractorId) }
  }

  function openAdd() {
    setForm(defaultForm())
    setAdding(true)
  }

  function setContractor(contractorId: string) {
    setForm(f => ({ ...f, contractorId, items: itemsFromContractor(contractorId) }))
  }

  function toggleItem(cropId: string, defaultArea: number) {
    setForm(f => {
      const exists = f.items.some(i => i.cropId === cropId)
      return {
        ...f,
        items: exists ? f.items.filter(i => i.cropId !== cropId) : [...f.items, { cropId, area: defaultArea }],
      }
    })
  }

  function updateItemArea(cropId: string, area: number) {
    setForm(f => ({ ...f, items: f.items.map(i => i.cropId === cropId ? { ...i, area } : i) }))
  }

  function openEdit(r: IrrigRequest) {
    const { id, ...rest } = r
    void id
    setForm(rest)
    setEditing(r)
  }

  function save() {
    if (!form.contractorId) return
    if (adding) {
      setRequests([...requests, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setRequests(requests.map(r => r.id === editing.id ? { ...r, ...form } : r))
      setEditing(null)
    }
  }

  function saveAndNew() {
    if (!form.contractorId || !adding) return
    setRequests([...requests, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setRequests(requests.filter(r => r.id !== deleteId)); setDeleteId(null) }
  }

  async function handleImport(file: File) {
    const rows = await parseSpreadsheetFile(file)
    const errors: string[] = []
    const added: IrrigRequest[] = []
    rows.forEach((row, i) => {
      const rowNum = i + 2
      const contractorName = String(rowGet(row, 'Контрагент') ?? '').trim()
      if (!contractorName) { errors.push(`Ред ${rowNum}: липсва контрагент`); return }
      const contractor = findByField(contractors, 'name', contractorName)
      if (!contractor) { errors.push(`Ред ${rowNum}: контрагент "${contractorName}" не е намерен`); return }
      const cropName = String(rowGet(row, 'Култура') ?? '').trim()
      const crop = cropName ? findByField(crops, 'name', cropName) : undefined
      if (cropName && !crop) errors.push(`Ред ${rowNum}: култура "${cropName}" не е намерена, оставена празна`)
      added.push({
        id: `${Date.now()}-${i}`,
        contractorId: contractor.id,
        irrigationNumber: String(rowGet(row, '№ поливка') ?? '').trim(),
        startDate: cellToDateStr(rowGet(row, 'Начална дата')),
        endDate: cellToDateStr(rowGet(row, 'Крайна дата')),
        items: crop ? [{ cropId: crop.id, area: cellToNum(rowGet(row, 'Дка')) }] : [],
      })
    })
    if (added.length) setRequests([...requests, ...added])
    setImportResult({ added: added.length, errors })
  }

  function exportRequests() {
    const headers = ['Контрагент', 'Култури', 'Дка', '№ поливка', 'Начална дата', 'Крайна дата', 'Статус']
    const statusLabel: Record<ReqStatus, string> = { completed: 'Приключена', overdue: 'Просрочена', approaching: 'Наближава', active: 'Активна', noDeadline: 'Без крайна дата' }
    const rows = filtered.map(r => {
      const cont = contractors.find(x => x.id === r.contractorId)
      const cropNames = r.items.map(i => crops.find(c => c.id === i.cropId)?.name).filter(Boolean).join(', ')
      const totalArea = r.items.reduce((sum, i) => sum + (i.area || 0), 0)
      return {
        'Контрагент': cont?.name ?? '', 'Култури': cropNames, 'Дка': totalArea, '№ поливка': r.irrigationNumber,
        'Начална дата': r.startDate, 'Крайна дата': r.endDate,
        'Статус': statusLabel[statusById.get(r.id) ?? 'active'],
      }
    })
    exportRowsToSpreadsheet(headers, rows, 'Заявки', `Заявки_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Заявки"
        subtitle={`${requests.length} записа`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по контрагент, № поливка..." />
            <ImportButton onFile={handleImport} />
            <Btn variant="secondary" onClick={exportRequests}><ExportIcon /> Експорт</Btn>
            <Btn onClick={openAdd}>+ Нова заявка</Btn>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setStatusFilter(v => v === 'approaching' ? null : 'approaching')}
          className="text-left"
        >
          <Card className={`p-4 border-l-4 border-l-amber-400 transition-shadow ${statusFilter === 'approaching' ? 'ring-2 ring-amber-400' : ''}`}>
            <p className="text-xs text-gray-500">Наближаващи (до {APPROACHING_WINDOW_DAYS} дни)</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600">{approachingCount}</p>
          </Card>
        </button>
        <button
          onClick={() => setStatusFilter(v => v === 'overdue' ? null : 'overdue')}
          className="text-left"
        >
          <Card className={`p-4 border-l-4 border-l-red-400 transition-shadow ${statusFilter === 'overdue' ? 'ring-2 ring-red-400' : ''}`}>
            <p className="text-xs text-gray-500">Просрочени</p>
            <p className="mt-1 text-2xl font-semibold text-red-500">{overdueCount}</p>
          </Card>
        </button>
        <button
          onClick={() => setStatusFilter(v => v === 'completed' ? null : 'completed')}
          className="text-left"
        >
          <Card className={`p-4 border-l-4 border-l-teal-400 transition-shadow ${statusFilter === 'completed' ? 'ring-2 ring-teal-400' : ''}`}>
            <p className="text-xs text-gray-500">Приключени (с изготвен акт)</p>
            <p className="mt-1 text-2xl font-semibold text-teal-600">{completedCount}</p>
          </Card>
        </button>
        <button
          onClick={() => setStatusFilter(v => v === 'noDeadline' ? null : 'noDeadline')}
          className="text-left"
        >
          <Card className={`p-4 border-l-4 border-l-gray-400 transition-shadow ${statusFilter === 'noDeadline' ? 'ring-2 ring-gray-400' : ''}`}>
            <p className="text-xs text-gray-500">Без крайна дата</p>
            <p className="mt-1 text-2xl font-semibold text-gray-600">{noDeadlineCount}</p>
          </Card>
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-br from-teal-500 to-teal-600">
                {['Контрагент', 'Култури', 'Дка', '№ поливка', 'Начална дата', 'Крайна дата', 'Статус', 'Действия'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><EmptyState message="Няма намерени заявки" /></td></tr>
              ) : (
                filtered.map((r, i) => {
                  const cont = contractors.find(x => x.id === r.contractorId)
                  const cropNames = r.items.map(item => crops.find(c => c.id === item.cropId)?.name).filter(Boolean).join(', ')
                  const totalArea = r.items.reduce((sum, item) => sum + (item.area || 0), 0)
                  const status = statusById.get(r.id) ?? 'active'
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{cont?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{cropNames || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{num(totalArea, 2)}</td>
                      <td className="px-4 py-3 text-gray-600">{r.irrigationNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{r.startDate}</td>
                      <td className="px-4 py-3 text-gray-600">{r.endDate}</td>
                      <td className="px-4 py-3">
                        {status === 'completed' && <Badge color="teal">Приключена</Badge>}
                        {status === 'overdue' && <Badge color="red">Просрочена</Badge>}
                        {status === 'approaching' && <Badge color="amber">Наближава</Badge>}
                        {status === 'active' && <Badge color="gray">Активна</Badge>}
                        {status === 'noDeadline' && <Badge color="gray">Без крайна дата</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}><EditIcon /></Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><TrashIcon /></Btn>
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
        <Modal title={adding ? 'Нова Заявка' : 'Редактирай Заявка'} onClose={() => { setAdding(false); setEditing(null) }}>
          <div className="flex flex-col gap-4">
            <FormRow label="Контрагент" required>
              <Select value={form.contractorId} onChange={e => setContractor(e.target.value)}>
                <option value="">— Избери —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
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
                              <NumberInput value={item.area} onChange={n => updateItemArea(c.cropId, n)} placeholder="дка" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </FormRow>
            <FormRow label="№ поливка">
              <Input value={form.irrigationNumber} onChange={e => setForm({ ...form, irrigationNumber: e.target.value })} placeholder="1" />
            </FormRow>
            <FormRow label="Начална дата на поливка">
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </FormRow>
            <FormRow label="Крайна дата на поливка">
              <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </FormRow>
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            {adding && <Btn variant="secondary" onClick={saveAndNew} disabled={!form.contractorId}>Запис и нов</Btn>}
            <Btn onClick={save} disabled={!form.contractorId}>Запази</Btn>
          </div>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Сигурни ли сте, че искате да изтриете тази заявка?"
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
