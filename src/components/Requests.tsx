import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { IrrigRequest } from '../types'
import { Modal, Btn, FormRow, Input, NumberInput, Combobox, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, Badge, ImportButton, ImportResultModal, EditIcon, TrashIcon, ExportIcon, num } from './ui'
import { parseSpreadsheetFile, exportStyledRowsToSpreadsheet, exportFilename, cellToNum, cellToDateStr, findByField, findSimilarByField, rowGet } from '../lib/spreadsheet'

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
type SortField = 'contractorName' | 'crops' | 'area' | 'irrigationNumber' | 'startDate' | 'endDate' | 'status'

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
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const { requests, setRequests, contractors, crops, acts, contracts, htus, findOrCreateContractor, isArchiveMode } = useStore()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<IrrigRequest | null>(null)
  const [form, setForm] = useState<ReqForm>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReqStatus | null>(null)
  const [htuFilter, setHtuFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  /** A request has no ХТУ field of its own — derived from the ХТУ(та) of its contractor's contracts. */
  function requestHtuIds(r: IrrigRequest): string[] {
    return [...new Set(contracts.filter(c => c.contractorId === r.contractorId).map(c => c.htuId).filter(Boolean))]
  }

  /** Tabs aggregate by ХТУ name across all its съоражения, not per individual съоражение row. */
  function htuIdsForName(name: string): string[] {
    return htus.filter(h => h.htuName === name).map(h => h.id)
  }

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

  function sortValue(r: IrrigRequest, field: SortField): string | number {
    switch (field) {
      case 'contractorName': return contractors.find(x => x.id === r.contractorId)?.name ?? ''
      case 'crops': return r.items.map(i => crops.find(c => c.id === i.cropId)?.name).filter(Boolean).join(', ')
      case 'area': return r.items.reduce((sum, i) => sum + (i.area || 0), 0)
      case 'irrigationNumber': return r.irrigationNumber
      case 'startDate': return r.startDate
      case 'endDate': return r.endDate
      case 'status': return statusById.get(r.id) ?? ''
    }
  }

  const htuNames = [...new Set(htus.map(h => h.htuName))]
  const htuCounts = htuNames.map(name => ({
    name,
    count: requests.filter(r => requestHtuIds(r).some(id => htuIdsForName(name).includes(id))).length,
  }))

  const filtered = requests.filter(r => {
    const cont = contractors.find(x => x.id === r.contractorId)
    const q = search.toLowerCase()

    // Check if search matches any crop name or area in items
    const matchesItems = r.items.some(item => {
      const crop = crops.find(c => c.id === item.cropId)
      return (
        (crop?.name.toLowerCase().includes(q) ?? false) ||
        String(item.area).includes(q)
      )
    })

    return (
      (!statusFilter || statusById.get(r.id) === statusFilter) &&
      (!htuFilter || requestHtuIds(r).some(id => htuIdsForName(htuFilter).includes(id))) &&
      (
        (cont?.name.toLowerCase().includes(q) ?? false) ||
        r.irrigationNumber.toLowerCase().includes(q) ||
        matchesItems
      )
    )
  }).sort((a, b) => {
    if (!sortField) return 0
    const va = sortValue(a, sortField), vb = sortValue(b, sortField)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'bg', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
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
    setFormError(null)
    setAdding(true)
  }

  /** Same contractor + same № поливка counts as a duplicate request (only when both are filled in). */
  function findDuplicateRequest(): IrrigRequest | undefined {
    const num = form.irrigationNumber.trim().toLowerCase()
    if (!num || !form.contractorId) return undefined
    return requests.find(r =>
      r.id !== editing?.id &&
      r.contractorId === form.contractorId &&
      r.irrigationNumber.trim().toLowerCase() === num
    )
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
    setFormError(null)
    setEditing(r)
  }

  function save() {
    if (!form.contractorId) return
    if (findDuplicateRequest()) { setFormError('Вече има заявка с този контрагент и № поливка.'); return }
    setFormError(null)
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
    if (findDuplicateRequest()) { setFormError('Вече има заявка с този контрагент и № поливка.'); return }
    setFormError(null)
    setRequests([...requests, { ...form, id: Date.now().toString() }])
    setForm(defaultForm())
  }

  function confirmDelete() {
    if (deleteId) { setRequests(requests.filter(r => r.id !== deleteId)); setDeleteId(null) }
  }

  function confirmDeleteAll() {
    setRequests([])
    setDeleteAllConfirm(false)
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

      const irrigationNumber = String(rowGet(row, '№ поливка') ?? '').trim()

      // Всички редове се импортират - няма проверка за дубликати
      // Заявки с един контрагент + № поливка могат да имат няколко реда за различни култури

      const cropName = String(rowGet(row, 'Култура') ?? '').trim()
      const crop = cropName ? findSimilarByField(crops, 'name', cropName) : undefined
      if (cropName && !crop) errors.push(`Ред ${rowNum}: култура "${cropName}" не е намерена, оставена празна`)
      added.push({
        id: `${Date.now()}-${i}`,
        contractorId: contractor.id,
        irrigationNumber,
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
    const filename = exportFilename('Заявки', [htuFilter, statusFilter ? statusLabel[statusFilter] : null])
    exportStyledRowsToSpreadsheet(headers, rows, 'Заявки', filename, {
      headerColor: '14B8A6', totalColor: 'CCFBF1',
      numericColumns: ['Дка'],
    })
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
            {!isArchiveMode && <ImportButton onFile={handleImport} />}
            <Btn variant="secondary" onClick={exportRequests}><ExportIcon /> Експорт</Btn>
            {!isArchiveMode && (
              <Btn variant="danger" onClick={() => setDeleteAllConfirm(true)} disabled={requests.length === 0}>
                <TrashIcon /> Изтрий всичко
              </Btn>
            )}
            {!isArchiveMode && <Btn onClick={openAdd}>+ Нова заявка</Btn>}
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

      {isAdmin && (
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
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-br from-teal-500 to-teal-600">
                {([
                  ['Контрагент', 'contractorName'], ['Култури', 'crops'], ['Дка', 'area'], ['№ поливка', 'irrigationNumber'],
                  ['Начална дата', 'startDate'], ['Крайна дата', 'endDate'], ['Статус', 'status'], ['Действия', null],
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
                      {!isArchiveMode && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}><EditIcon /></Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><TrashIcon /></Btn>
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
        <Modal title={adding ? 'Нова Заявка' : 'Редактирай Заявка'} onClose={() => { setAdding(false); setEditing(null) }} onSave={save}>
          <div className="flex flex-col gap-4">
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
          {formError && <p className="text-sm text-red-500 mt-4">{formError}</p>}
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

      {deleteAllConfirm && (
        <ConfirmDialog
          message={`Сигурни ли сте, че искате да изтриете ВСИЧКИ заявки (${requests.length})? Това действие е необратимо.`}
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
