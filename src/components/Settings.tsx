import { useRef, useState } from 'react'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { PageHeader, Card, Btn, ConfirmDialog, DownloadIcon, ImportIcon, ExportIcon, ArchiveBoxIcon, ChartBarIcon, ClockIcon, FormRow, Input } from './ui'
import { downloadBlob, blobToBase64 } from '../lib/docx-fill'
import { exportStyledRowsToSpreadsheet } from '../lib/spreadsheet'
import { buildArchive, isValidArchive, type ArchiveFile, BACKUP_FOLDER_KEY, LAST_AUTO_BACKUP_KEY } from '../lib/backup'
import { countContracts, countActs } from '../lib/acts'

export default function Settings() {
  const { token, role } = useAuth()
  const isAdmin = role === 'admin'
  const {
    contractors, htus, irrigationMethods, crops, contracts, acts, requests, payments, seasonArchives,
    setContractors, setHtus, setIrrigationMethods, setCrops, setContracts, setActs, setRequests, setPayments, setSeasonArchives,
  } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<ArchiveFile | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoredAt, setRestoredAt] = useState<string | null>(null)

  const [backupFolder, setBackupFolder] = useState(() => localStorage.getItem(BACKUP_FOLDER_KEY))
  const [backupNowResult, setBackupNowResult] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [accountResult, setAccountResult] = useState<string | null>(null)
  const [accountBusy, setAccountBusy] = useState(false)

  function currentArchive(): ArchiveFile {
    return buildArchive({ contractors, htus, irrigationMethods, crops, contracts, acts, requests, payments })
  }

  async function downloadArchive() {
    const blob = new Blob([JSON.stringify(currentArchive(), null, 2)], { type: 'application/json' })
    await downloadBlob(blob, `napoyavane-arhiv-${new Date().toISOString().slice(0, 10)}.json`)
  }

  function pickFile() {
    fileRef.current?.click()
  }

  async function handleFile(file: File) {
    setRestoreError(null)
    try {
      const parsed = JSON.parse(await file.text())
      if (!isValidArchive(parsed)) {
        setRestoreError('Файлът не изглежда да е валиден архив на "Напояване ХТР Ямбол".')
        return
      }
      setPendingRestore(parsed)
    } catch {
      setRestoreError('Файлът не можа да бъде прочетен като архив (невалиден JSON).')
    }
  }

  function confirmRestore() {
    if (!pendingRestore) return
    setContractors(pendingRestore.contractors as never)
    setHtus(pendingRestore.htus as never)
    setIrrigationMethods(pendingRestore.irrigationMethods as never)
    setCrops(pendingRestore.crops as never)
    setContracts(pendingRestore.contracts as never)
    setActs(pendingRestore.acts as never)
    setRequests(pendingRestore.requests as never)
    setPayments(pendingRestore.payments as never)
    setRestoredAt(new Date().toLocaleString('bg-BG'))
    setPendingRestore(null)
  }

  async function pickBackupFolder() {
    if (!window.api) return
    const res = await window.api.pickBackupFolder()
    if (res.canceled) return
    localStorage.setItem(BACKUP_FOLDER_KEY, res.folderPath)
    setBackupFolder(res.folderPath)
  }

  function clearBackupFolder() {
    localStorage.removeItem(BACKUP_FOLDER_KEY)
    setBackupFolder(null)
  }

  async function backupNow() {
    if (!window.api) return
    setBackupBusy(true)
    setBackupNowResult(null)
    const blob = new Blob([JSON.stringify(currentArchive())], { type: 'application/json' })
    const base64 = await blobToBase64(blob)
    const res = await window.api.writeAutoBackup(backupFolder, base64)
    setBackupBusy(false)
    if ('error' in res) {
      setBackupNowResult(`Грешка: ${res.error}`)
    } else {
      localStorage.setItem(LAST_AUTO_BACKUP_KEY, new Date().toISOString().slice(0, 10))
      setBackupNowResult(`✓ Записано: ${res.filePath}`)
    }
  }

  // Архивиране на сезон - запазва текущите данни като сезон и ги изчиства
  const [archiveYear, setArchiveYear] = useState(() => new Date().getFullYear())
  const [archiveNotes, setArchiveNotes] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiveResult, setArchiveResult] = useState<string | null>(null)

  function createSeasonArchive() {
    const newArchive = {
      id: `season-${archiveYear}-${Date.now()}`,
      seasonYear: archiveYear,
      archivedDate: new Date().toISOString(),
      contracts,
      acts,
      requests,
      payments,
      notes: archiveNotes,
    }

    setSeasonArchives([...seasonArchives, newArchive])

    // Изчистване на текущите данни
    setContracts([])
    setActs([])
    setRequests([])
    setPayments([])

    setArchiveResult(`✓ Сезон ${archiveYear} е архивиран успешно!`)
    setConfirmArchive(false)
    setArchiveNotes('')
    setArchiveYear(archiveYear + 1)
  }

  async function createAccount() {
    if (!window.api || !token || !newUsername.trim() || !newPassword) return
    setAccountBusy(true)
    setAccountResult(null)
    const result = await window.api.createUser(token, newUsername, newPassword)
    setAccountBusy(false)
    if ('error' in result) {
      setAccountResult(`Грешка: ${result.error}`)
      return
    }
    setNewUsername('')
    setNewPassword('')
    setAccountResult(`Акаунтът "${result.username}" е създаден успешно.`)
  }

  async function exportContractorSummary() {
    const headers = [
      'Контрагент', 'Договори бр.', 'Договорирана площ дка', 'Договорирана стойност €',
      'Заявки бр.', 'Заявена площ дка',
      'Актове бр.', 'Актувана площ дка', 'Актувана стойност €',
      'Фактури бр.', 'Фактурирано €', 'Платено €', 'Неплатено €',
      'Остава за актуване дка', 'Разлика актувано−фактурирано €',
    ]
    const rows = contractors.map(cont => {
      const cContracts = contracts.filter(c => c.contractorId === cont.id)
      const cRequests = requests.filter(r => r.contractorId === cont.id)
      const cActs = acts.filter(a => a.contractorId === cont.id)
      const cPayments = payments.filter(p => p.contractorId === cont.id)

      const contractedArea = cContracts.reduce((s, c) => s + (c.area || 0), 0)
      const contractedValue = cContracts.reduce((s, c) => s + (c.value || 0), 0)
      const requestedArea = cRequests.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + (i.area || 0), 0), 0)
      const actedArea = cActs.reduce((s, a) => s + (a.area || 0), 0)
      const actedValue = cActs.reduce((s, a) => s + (a.value || 0), 0)
      const invoiced = cPayments.reduce((s, p) => s + (p.amount || 0), 0)
      const paid = cPayments.filter(p => p.paid).reduce((s, p) => s + (p.amount || 0), 0)

      return {
        'Контрагент': cont.name,
        'Договори бр.': countContracts(cContracts),
        'Договорирана площ дка': contractedArea,
        'Договорирана стойност €': contractedValue,
        'Заявки бр.': cRequests.length,
        'Заявена площ дка': requestedArea,
        'Актове бр.': countActs(cActs),
        'Актувана площ дка': actedArea,
        'Актувана стойност €': actedValue,
        'Фактури бр.': cPayments.length,
        'Фактурирано €': invoiced,
        'Платено €': paid,
        'Неплатено €': invoiced - paid,
        'Остава за актуване дка': Math.max(0, contractedArea - actedArea),
        'Разлика актувано−фактурирано €': actedValue - invoiced,
      }
    }).filter(r => r['Договори бр.'] || r['Заявки бр.'] || r['Актове бр.'] || r['Фактури бр.'])

    await exportStyledRowsToSpreadsheet(headers, rows, 'Обобщение по контрагенти', `Napoyavane_Obobshtenie_${new Date().toISOString().slice(0, 10)}.xlsx`, {
      headerColor: '0F766E', totalColor: 'CCFBF1',
      numericColumns: headers.slice(1),
    })
  }

  const totalRecords = contractors.length + htus.length + irrigationMethods.length + crops.length + contracts.length + acts.length + requests.length + payments.length

  return (
    <div>
      <PageHeader title="Настройки" subtitle="Архив и възстановяване на данните" />

      {isAdmin && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Лява колона - Архиви */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3 bg-gradient-to-br from-teal-500 to-teal-600">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-white/20 flex items-center justify-center text-white"><ArchiveBoxIcon className="w-4.5 h-4.5" /></div>
                <p className="text-sm font-semibold text-white">Архив на данните</p>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-500 mb-5">
                  Изтегля един файл с всички данни в приложението ({totalRecords} записа общо) — контрагенти, ХТУ, начини на
                  напояване, култури, договори, актове, заявки и плащания. Използвай го за резервно копие или за пренасяне на
                  данните на друг компютър.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Btn onClick={downloadArchive}><DownloadIcon /> Изтегли пълен архив</Btn>
                  <Btn variant="secondary" onClick={pickFile}><ImportIcon /> Възстанови от архив</Btn>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                      e.target.value = ''
                    }}
                  />
                </div>

                {restoreError && <p className="text-sm text-red-500 mt-4">{restoreError}</p>}
                {restoredAt && <p className="text-sm text-teal-600 mt-4">✓ Данните бяха възстановени успешно ({restoredAt}).</p>}
              </div>
            </Card>

            {window.api && (
              <Card className="overflow-hidden">
                <div className="px-6 py-4 flex items-center gap-3 bg-gradient-to-br from-blue-500 to-blue-600">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/20 flex items-center justify-center text-white"><ClockIcon className="w-4.5 h-4.5" /></div>
                  <p className="text-sm font-semibold text-white">Ежедневен автоматичен архив</p>
                </div>
                <div className="p-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Веднъж дневно, при отваряне на приложението, се записва същият файл (презаписва предишния) на избраното по-долу
                    място — тих запис без диалог, само като допълнителна застраховка.
                  </p>

                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <span className="text-gray-500">Място:</span>
                    <span className="font-medium text-gray-800">{backupFolder || 'По подразбиране (папка "Документи")'}</span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Btn variant="secondary" onClick={pickBackupFolder}>Избери папка</Btn>
                    {backupFolder && <Btn variant="ghost" onClick={clearBackupFolder}>Върни по подразбиране</Btn>}
                    <Btn variant="secondary" onClick={backupNow} disabled={backupBusy}>{backupBusy ? 'Записване…' : 'Направи архив сега'}</Btn>
                  </div>

                  {backupNowResult && <p className="text-sm text-gray-600 mt-4 break-all">{backupNowResult}</p>}
                </div>
              </Card>
            )}

            {/* Архивиране на сезон */}
            {isAdmin && (
              <Card className="overflow-hidden">
                <div className="px-6 py-4 flex items-center gap-3 bg-gradient-to-br from-purple-500 to-purple-600">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/20 flex items-center justify-center text-white"><ArchiveBoxIcon className="w-4.5 h-4.5" /></div>
                  <p className="text-sm font-semibold text-white">Архивиране на сезон</p>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Архивирай текущия сезон и започни нов. Всички договори, актове, заявки и плащания ще бъдат запазени
                    за сравнение и ще бъдат изчистени от текущите данни.
                  </p>

                  <div className="space-y-3">
                    <FormRow label="Година на сезон">
                      <Input
                        type="number"
                        value={archiveYear}
                        onChange={e => setArchiveYear(Number(e.target.value))}
                        placeholder="2026"
                      />
                    </FormRow>
                    <FormRow label="Бележки (опционално)">
                      <Input
                        value={archiveNotes}
                        onChange={e => setArchiveNotes(e.target.value)}
                        placeholder="Допълнителна информация за сезона..."
                      />
                    </FormRow>
                  </div>

                  <Btn variant="primary" onClick={() => setConfirmArchive(true)}>
                    <ArchiveBoxIcon /> Архивирай сезон {archiveYear}
                  </Btn>

                  {archiveResult && <p className="text-sm text-green-600 mt-4">{archiveResult}</p>}

                  {seasonArchives.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-3">Архивирани сезони ({seasonArchives.length})</p>
                      <div className="space-y-2">
                        {seasonArchives.sort((a, b) => b.seasonYear - a.seasonYear).map(archive => (
                          <div key={archive.id} className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium text-gray-900">Сезон {archive.seasonYear}</span>
                              <span className="text-gray-500 ml-2">
                                ({archive.contracts.length} договори, {archive.acts.length} акта)
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(archive.archivedDate).toLocaleDateString('bg-BG')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Дясна колона - Обобщение и Акаунти */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3 bg-gradient-to-br from-amber-400 to-amber-500">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-white/20 flex items-center justify-center text-white"><ChartBarIcon className="w-4.5 h-4.5" /></div>
                <p className="text-sm font-semibold text-white">Обобщение по контрагенти</p>
              </div>
              <div className="p-6">
                <Btn onClick={exportContractorSummary}><ExportIcon /> Изтегли обобщение по контрагенти</Btn>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-6 py-4 bg-blue-500">
                <p className="text-sm font-semibold text-white">Добавяне на акаунт</p>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-500 mb-5">Създай достъп за друг потребител. Новият акаунт няма да има работно табло и справки.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormRow label="Потребителско име" required>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} autoComplete="off" />
                  </FormRow>
                  <FormRow label="Парола" required>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
                  </FormRow>
                </div>
                <Btn className="mt-5" onClick={createAccount} disabled={accountBusy || !newUsername.trim() || !newPassword}>
                  {accountBusy ? 'Създаване…' : 'Създай акаунт'}
                </Btn>
                {accountResult && <p className="text-sm text-gray-600 mt-4">{accountResult}</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {pendingRestore && (
        <ConfirmDialog
          message={`Възстановяването ще ЗАМЕНИ всички текущи данни в приложението с тези от архива (изтеглен на ${new Date(pendingRestore.exportedAt).toLocaleString('bg-BG')}). Текущите данни, които не запазиш отделно, ще бъдат загубени безвъзвратно. Продължи?`}
          onConfirm={confirmRestore}
          onCancel={() => setPendingRestore(null)}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          message={`Архивирането на сезон ${archiveYear} ще ПРЕМЕСТИ всички договори, актове, заявки и плащания в архив и ще ги ИЗЧИСТИ от текущите данни. Те ще останат достъпни за сравнителен анализ. Контрагентите, ХТУ, методите и културите няма да бъдат изчистени. Продължи?`}
          onConfirm={createSeasonArchive}
          onCancel={() => setConfirmArchive(false)}
        />
      )}
    </div>
  )
}
