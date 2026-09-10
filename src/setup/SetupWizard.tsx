import { useEffect, useState } from 'react'
import { Btn, Input, FormRow, Card } from '../components/ui'

type Step = 'checking' | 'need-password' | 'provisioning' | 'admin' | 'error'

export default function SetupWizard({
  onComplete,
  onSkipToLogin,
}: {
  onComplete: (token: string, username: string) => void
  onSkipToLogin: () => void
}) {
  const [step, setStep] = useState<Step>('checking')
  const [superuserPassword, setSuperuserPassword] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPassword2, setAdminPassword2] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)

  useEffect(() => window.api!.onSetupProgress(message => setLog(l => [...l, message])), [])

  useEffect(() => {
    if (step !== 'checking') return
    window.api!.detectExistingPostgres().then(res => {
      if (res.existing && !res.hasSavedPassword) setStep('need-password')
      else runProvisioning()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function runProvisioning(password?: string) {
    setError(null)
    setLog([])
    setStep('provisioning')
    const res = await window.api!.runProvisioning(password)
    if ('error' in res) {
      setError(res.error)
      setStep('error')
      return
    }
    // The database itself can already have an admin from an earlier run even though this machine's
    // local config was missing (e.g. reinstall, or a previous run that got this far but didn't
    // finish) — in that case there's nothing left to set up, just go straight to the login screen
    // instead of offering to create a second admin (which the backend would reject anyway).
    const status = await window.api!.setupStatus()
    if (status.hasAdmin) {
      onSkipToLogin()
    } else {
      setStep('admin')
    }
  }

  async function submitAdmin() {
    setAdminError(null)
    if (adminPassword !== adminPassword2) {
      setAdminError('Паролите не съвпадат.')
      return
    }
    if (adminPassword.length < 6) {
      setAdminError('Паролата трябва да е поне 6 символа.')
      return
    }
    setAdminBusy(true)
    const res = await window.api!.bootstrapAdmin(adminUsername.trim(), adminPassword)
    setAdminBusy(false)
    if ('error' in res) {
      if (res.alreadyExists) { onSkipToLogin(); return }
      setAdminError(res.error)
      return
    }
    onComplete(res.token, res.username)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#dae7f4] px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <p className="text-xl font-semibold text-gray-900">Напояване ХТР Ямбол</p>
          <p className="mt-1 text-sm text-gray-500">Първоначална настройка</p>
        </div>

        {(step === 'checking' || step === 'provisioning') && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Настройваме базата данни на този компютър. Това може да отнеме няколко минути — може да се появи прозорец на Windows за администраторски права, натиснете „Да“.
            </p>
            {step === 'provisioning' && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 space-y-1 max-h-40 overflow-y-auto">
                {log.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </div>
        )}

        {step === 'need-password' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Открихме вече инсталиран PostgreSQL на този компютър. Въведете паролата на потребителя <span className="font-mono">postgres</span>, за да продължим.
            </p>
            <FormRow label="Парола на postgres" required>
              <Input
                type="password"
                value={superuserPassword}
                onChange={e => setSuperuserPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && superuserPassword && runProvisioning(superuserPassword)}
                autoFocus
              />
            </FormRow>
            <Btn onClick={() => runProvisioning(superuserPassword)} disabled={!superuserPassword}>Продължи</Btn>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-red-500 whitespace-pre-wrap max-h-64 overflow-y-auto">{error}</p>
            <Btn onClick={() => setStep('checking')}>Опитай пак</Btn>
          </div>
        )}

        {step === 'admin' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">Базата данни е готова. Създайте първия администраторски акаунт.</p>
            <FormRow label="Потребителско име" required>
              <Input value={adminUsername} onChange={e => setAdminUsername(e.target.value)} autoFocus />
            </FormRow>
            <FormRow label="Парола" required>
              <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
            </FormRow>
            <FormRow label="Повторете паролата" required>
              <Input
                type="password"
                value={adminPassword2}
                onChange={e => setAdminPassword2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitAdmin()}
              />
            </FormRow>
            {adminError && <p className="text-sm text-red-500">{adminError}</p>}
            <Btn onClick={submitAdmin} disabled={adminBusy || !adminUsername.trim() || !adminPassword}>
              {adminBusy ? 'Моля, изчакайте…' : 'Създай администратор'}
            </Btn>
          </div>
        )}
      </Card>
    </div>
  )
}
