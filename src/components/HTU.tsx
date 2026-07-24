import { useState } from 'react'
import { useStore } from '../store'
import type { HTU } from '../types'
import { Modal, Btn, FormRow, Input, SearchBar, ConfirmDialog, PageHeader, EmptyState, Card, EditIcon, TrashIcon } from './ui'

const EMPTY: Omit<HTU, 'id'> = { htuName: '', equipment: '', village: '' }

export default function HTUModule() {
  const { htus, setHtus } = useStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<HTU | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = htus.filter(h =>
    h.htuName.toLowerCase().includes(search.toLowerCase()) ||
    h.equipment.toLowerCase().includes(search.toLowerCase()) ||
    h.village.toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setForm(EMPTY); setAdding(true) }
  function openEdit(h: HTU) { setForm({ htuName: h.htuName, equipment: h.equipment, village: h.village }); setEditing(h) }

  function save() {
    if (!form.htuName.trim()) return
    if (adding) {
      setHtus([...htus, { ...form, id: Date.now().toString() }])
      setAdding(false)
    } else if (editing) {
      setHtus(htus.map(h => h.id === editing.id ? { ...h, ...form } : h))
      setEditing(null)
    }
  }

  function confirmDelete() {
    if (deleteId) { setHtus(htus.filter(h => h.id !== deleteId)); setDeleteId(null) }
  }

  const isOpen = adding || editing !== null

  return (
    <div>
      <PageHeader
        title="Регистър ХТУ и Съоражения"
        subtitle={`${htus.length} записа`}
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Търсене по ХТУ, съоражение, землище..." />
            <Btn onClick={openAdd}>+ Добави</Btn>
          </>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-br from-blue-500 to-blue-600">
                {['ХТУ', 'Съоражение', 'Землище', 'Действия'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4}><EmptyState message="Няма намерени ХТУ и съоражения" /></td></tr>
              ) : (
                filtered.map((h, i) => (
                  <tr key={h.id} className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{h.htuName}</td>
                    <td className="px-4 py-3 text-gray-600">{h.equipment}</td>
                    <td className="px-4 py-3 text-gray-600">{h.village}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(h)}><EditIcon /></Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setDeleteId(h.id)}><TrashIcon /></Btn>
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
          title={adding ? 'Ново ХТУ / Съоражение' : 'Редактирай ХТУ / Съоражение'}
          onClose={() => { setAdding(false); setEditing(null) }}
        >
          <div className="flex flex-col gap-4">
            <FormRow label="ХТУ" required>
              <Input value={form.htuName} onChange={e => setForm({ ...form, htuName: e.target.value })} placeholder="ХТУ Пловдив" />
            </FormRow>
            <FormRow label="Съоражение" required>
              <Input value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="Помпена станция П-1" />
            </FormRow>
            <FormRow label="Землище">
              <Input value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} placeholder="Горно Езерово" />
            </FormRow>
          </div>
          <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => { setAdding(false); setEditing(null) }}>Откажи</Btn>
            <Btn onClick={save} disabled={!form.htuName.trim()}>Запази</Btn>
          </div>
        </Modal>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Сигурни ли сте, че искате да изтриете това ХТУ / съоражение?"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
