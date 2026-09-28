import { useState } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Contractor } from '../types'
import { Modal, Btn, FormRow, Input, Select, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, ImportButton, ImportResultModal, EditIcon, TrashIcon } from './ui'
import { parseSpreadsheetFile, findByField, rowGet } from '../lib/spreadsheet'

const EMPTY: Omit<Contractor, 'id'> = {
  name: '', bulstat: '', address: '', contact: '', phone: '', iban: '',
  entityType: 'legal', vatRegistered: false, vatNumber: '', egn: '', idCardNumber: '', idCardIssuedDate: '',
  hasProxy: false, proxyName: '', proxyEgn: '', notaryDeedNumber: '', notaryName: '', notaryJurisdiction: '',
}

type SortField = 'name' | 'bulstat' | 'address' | 'contact' | 'phone' | 'iban'

export default function Contractors() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const { contractors, setContractors, contracts, setContracts, acts, setActs, requests, setRequests, payments, setPayments } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Contractor | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = contractors
    .filter(c => {
      const q = search.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        c.bulstat.includes(search) ||
        c.contact.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.phone.includes(search) ||
        c.iban.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (!sortField) return 0
      const cmp = a[sortField].localeCompare(b[sortField], 'bg', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })

  function openAdd() { setForm(EMPTY); setFormError(null); setAdding(true) }
  function openEdit(c: Contractor) { const { id, ...rest } = c; void id; setForm(rest); setFormError(null); setEditing(c) }

  /** Legal/farmer entities are identified by БУЛСТАТ, individuals by ЕГН — matches the import's duplicate check. */
  function findDuplicate(): Contractor | undefined {
    const others = contractors.filter(c => c.id !== editing?.id)
    if (form.entityType === 'individual') return findByField(others, 'egn', form.egn)
    return findByField(others, 'bulstat', form.bulstat)
  }

  function save() {
    if (!form.name.trim()) return
    const dup = findDuplicate()
    if (dup) { setFormError(`Вече съществува контрагент "${dup.name}" с този ${form.entityType === 'individual' ? 'ЕГН' : 'БУЛСТАТ'}.`); return }
    setFormError(null)
    if (adding) {
      setContractors([...contractors, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setContractors(contractors.map(c => c.id === editing.id ? { ...c, ...form } : c))
      setEditing(null)
    }
  }

  function confirmDelete() {
    if (deleteId) {
      // Remove contractor
      setContractors(contractors.filter(c => c.id !== deleteId))
      // Remove all related records
      setContracts(contracts.filter(c => c.contractorId !== deleteId))
      setActs(acts.filter(a => a.contractorId !== deleteId))
      setRequests(requests.filter(r => r.contractorId !== deleteId))
      setPayments(payments.filter(p => p.contractorId !== deleteId))
      setDeleteId(null)
    }
  }

  function confirmDeleteAll() {
    // Save current contractors to localStorage before deleting (for reconnection later)
    localStorage.setItem('deletedContractors', JSON.stringify(contractors))
    setContractors([])
    // Don't clear related records - they will be reconnected when new contractors are imported
    setDeleteAllConfirm(false)
  }

  async function handleImport(file: File) {
    const rows = await parseSpreadsheetFile(file)
    const errors: string[] = []
    const added: Contractor[] = []

    rows.forEach((row, i) => {
      const rowNum = i + 2
      const name = String(rowGet(row, 'Наименование') ?? '').trim()
      if (!name) { errors.push(`Ред ${rowNum}: липсва наименование`); return }
      const bulstat = String(rowGet(row, 'БУЛСТАТ') ?? '').trim()

      // Проверка за дубликат по БУЛСТАТ (ако е попълнен)
      if (bulstat) {
        const duplicateBulstat = findByField(contractors, 'bulstat', bulstat) || findByField(added, 'bulstat', bulstat)
        if (duplicateBulstat) {
          errors.push(`Ред ${rowNum}: контрагент с БУЛСТАТ "${bulstat}" вече съществува, пропуснат`)
          return
        }
      }

      // Проверка за дубликат по Наименование (case-insensitive)
      const nameLower = name.toLowerCase()
      const duplicateName = contractors.find(c => c.name.toLowerCase() === nameLower) || added.find(c => c.name.toLowerCase() === nameLower)
      if (duplicateName) {
        errors.push(`Ред ${rowNum}: контрагент с наименование "${name}" вече съществува, пропуснат`)
        return
      }

      added.push({
        id: `${Date.now()}-${i}`,
        name,
        bulstat,
        address: String(rowGet(row, 'Адрес') ?? '').trim(),
        contact: String(rowGet(row, 'МОЛ / Контакт', 'Контакт') ?? '').trim(),
        phone: String(rowGet(row, 'Телефон') ?? '').trim(),
        iban: String(rowGet(row, 'IBAN', 'ИБАН') ?? '').trim(),
        entityType: 'legal',
        vatRegistered: false, vatNumber: '', egn: '', idCardNumber: '', idCardIssuedDate: '',
        hasProxy: false, proxyName: '', proxyEgn: '', notaryDeedNumber: '', notaryName: '', notaryJurisdiction: '',
      })
    })

    if (added.length) {
      const newContractors = [...contractors, ...added]
      setContractors(newContractors)

      // Reconnect orphaned records by matching BULSTAT or name
      reconnectOrphanedRecords(newContractors, added)
    }
    setImportResult({ added: added.length, errors })
  }

  function reconnectOrphanedRecords(allContractors: Contractor[], newlyAdded: Contractor[]) {
    // Load deleted contractors from localStorage
    const deletedRaw = localStorage.getItem('deletedContractors')
    if (!deletedRaw) return // No deleted contractors to reconnect

    const deletedContractors: Contractor[] = JSON.parse(deletedRaw)

    // Build mapping: old contractor ID -> BULSTAT/name
    const oldIdToBulstat = new Map<string, string>()
    const oldIdToName = new Map<string, string>()
    deletedContractors.forEach(c => {
      if (c.bulstat) oldIdToBulstat.set(c.id, c.bulstat)
      oldIdToName.set(c.id, c.name.toLowerCase().trim())
    })

    // Build mapping: BULSTAT/name -> new contractor ID
    const bulstatToNewId = new Map<string, string>()
    const nameToNewId = new Map<string, string>()
    newlyAdded.forEach(c => {
      if (c.bulstat) bulstatToNewId.set(c.bulstat, c.id)
      nameToNewId.set(c.name.toLowerCase().trim(), c.id)
    })

    // Helper function to find new ID for an old contractor ID
    const findNewId = (oldId: string): string | null => {
      // Check if contractor still exists (not orphaned)
      if (allContractors.find(c => c.id === oldId)) return null

      // Try to match by BULSTAT first
      const bulstat = oldIdToBulstat.get(oldId)
      if (bulstat) {
        const newId = bulstatToNewId.get(bulstat)
        if (newId) return newId
      }

      // Fall back to matching by name
      const name = oldIdToName.get(oldId)
      if (name) {
        const newId = nameToNewId.get(name)
        if (newId) return newId
      }

      return null // No match found
    }

    // Reconnect contracts
    setContracts(contracts.map(contract => {
      const newId = findNewId(contract.contractorId)
      return newId ? { ...contract, contractorId: newId } : contract
    }))

    // Reconnect acts
    setActs(acts.map(act => {
      const newId = findNewId(act.contractorId)
      return newId ? { ...act, contractorId: newId } : act
    }))

    // Reconnect requests
    setRequests(requests.map(request => {
      const newId = findNewId(request.contractorId)
      return newId ? { ...request, contractorId: newId } : request
    }))

    // Reconnect payments
    setPayments(payments.map(payment => {
      const newId = findNewId(payment.contractorId)
      return newId ? { ...payment, contractorId: newId } : payment
    }))

    // Clear saved deleted contractors after reconnection
    localStorage.removeItem('deletedContractors')
  }

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Регистър Контрагенти"
        subtitle={`${contractors.length} записа`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по наименование, БУЛСТАТ..." />
            <ImportButton onFile={handleImport} />
            <Btn variant="danger" onClick={() => setDeleteAllConfirm(true)} disabled={contractors.length === 0}>
              <TrashIcon /> Изтрий всичко
            </Btn>
            <Btn onClick={openAdd}>+ Добави</Btn>
          </>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-br from-teal-500 to-teal-600">
                {([
                  ['name', 'Наименование'],
                  ['bulstat', 'БУЛСТАТ'],
                  ['address', 'Адрес'],
                  ...(isAdmin ? [
                    ['contact', 'МОЛ / Контакт'],
                    ['phone', 'Телефон'],
                    ['iban', 'IBAN'],
                  ] : [])
                ] as [SortField, string][]).map(([field, label]) => (
                  <th
                    key={field}
                    onClick={() => toggleSort(field)}
                    className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-white/10 transition-colors"
                  >
                    {label} {sortField === field && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 4}><EmptyState message="Няма намерени контрагенти" /></td></tr>
              ) : (
                filtered.map((c, i) => (
                  <tr key={c.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.bulstat}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs whitespace-normal break-words">{c.address}</td>
                    {isAdmin && <td className="px-4 py-3 text-gray-600">{c.contact}</td>}
                    {isAdmin && <td className="px-4 py-3 text-gray-600">{c.phone}</td>}
                    {isAdmin && <td className="px-4 py-3 text-gray-600 text-xs">{c.iban}</td>}
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(c)}><EditIcon /></Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setDeleteId(c.id)}><TrashIcon /></Btn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isOpen && (
        <Modal
          title={adding ? 'Нов Контрагент' : 'Редактирай Контрагент'}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSave={save}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FormRow label="Вид лице" required>
                <Select value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value as 'legal' | 'individual' | 'farmer' })}>
                  <option value="legal">Юридическо лице</option>
                  <option value="farmer">Земеделски производител</option>
                  <option value="individual">Физическо лице</option>
                </Select>
              </FormRow>
            </div>
            <div className="col-span-2">
              <FormRow label="Наименование" required>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Агро Фарм ЕООД" />
              </FormRow>
            </div>

            {form.entityType === 'legal' ? (
              <>
                <FormRow label="ЕИК / БУЛСТАТ" required>
                  <Input value={form.bulstat} onChange={e => setForm({ ...form, bulstat: e.target.value })} placeholder="123456789" />
                </FormRow>
                <FormRow label="ИН по ДДС">
                  <Input
                    value={form.vatRegistered ? `BG${form.bulstat}` : form.vatNumber}
                    onChange={e => setForm({ ...form, vatNumber: e.target.value })}
                    placeholder="BG123456789"
                    disabled={form.vatRegistered}
                  />
                </FormRow>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="vatRegistered"
                    checked={form.vatRegistered}
                    onChange={e => setForm({ ...form, vatRegistered: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="vatRegistered" className="text-sm text-gray-700">Регистриран по ДДС</label>
                </div>
                {isAdmin && (
                  <div className="col-span-2">
                    <FormRow label="МОЛ / Управител">
                      <Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Иван Петров" />
                    </FormRow>
                  </div>
                )}
              </>
            ) : (
              <>
                {form.entityType === 'farmer' && (
                  <FormRow label="ЕИК" required>
                    <Input value={form.bulstat} onChange={e => setForm({ ...form, bulstat: e.target.value })} placeholder="123456789" />
                  </FormRow>
                )}
                <FormRow label="ЕГН" required>
                  <Input value={form.egn} onChange={e => setForm({ ...form, egn: e.target.value })} placeholder="8001011234" />
                </FormRow>
                <FormRow label="№ лична карта">
                  <Input value={form.idCardNumber} onChange={e => setForm({ ...form, idCardNumber: e.target.value })} placeholder="123456789" />
                </FormRow>
                <FormRow label="Издадена на">
                  <Input type="date" value={form.idCardIssuedDate} onChange={e => setForm({ ...form, idCardIssuedDate: e.target.value })} />
                </FormRow>
              </>
            )}

            {isAdmin && (
              <FormRow label="Телефон">
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0888 123 456" />
              </FormRow>
            )}
            <div className="col-span-2">
              <FormRow label="Адрес">
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="с. Горно Езерово, ул. Главна 5" />
              </FormRow>
            </div>
            {isAdmin && (
              <div className="col-span-2">
                <FormRow label="IBAN">
                  <Input value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} placeholder="BG00XXXX00000000000000" />
                </FormRow>
              </div>
            )}

            <div className="col-span-2 flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="hasProxy"
                checked={form.hasProxy}
                onChange={e => setForm({ ...form, hasProxy: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="hasProxy" className="text-sm text-gray-700">Договорът се подписва с пълномощник</label>
            </div>

            {form.hasProxy && (
              <>
                <div className="col-span-2">
                  <FormRow label="Пълномощник (име)">
                    <Input value={form.proxyName} onChange={e => setForm({ ...form, proxyName: e.target.value })} placeholder="Петър Петров" />
                  </FormRow>
                </div>
                <FormRow label="ЕГН на пълномощника">
                  <Input value={form.proxyEgn} onChange={e => setForm({ ...form, proxyEgn: e.target.value })} />
                </FormRow>
                <FormRow label="№ нот. заверено пълномощно">
                  <Input value={form.notaryDeedNumber} onChange={e => setForm({ ...form, notaryDeedNumber: e.target.value })} />
                </FormRow>
                <FormRow label="Издадено от нотариус">
                  <Input value={form.notaryName} onChange={e => setForm({ ...form, notaryName: e.target.value })} />
                </FormRow>
                <FormRow label="Район на действие">
                  <Input value={form.notaryJurisdiction} onChange={e => setForm({ ...form, notaryJurisdiction: e.target.value })} />
                </FormRow>
              </>
            )}
          </div>
          {formError && <p className="text-sm text-red-500 mt-4">{formError}</p>}
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            <Btn onClick={save} disabled={!form.name.trim()}>Запази</Btn>
          </div>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Сигурни ли сте, че искате да изтриете този контрагент?"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {deleteAllConfirm && (
        <ConfirmDialog
          message={`Сигурни ли сте, че искате да изтриете ВСИЧКИ контрагенти (${contractors.length})? Това действие е необратимо.`}
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
