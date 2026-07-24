import { useState } from 'react'
import { useAuth } from '../auth'
import { Btn, Input, FormRow, Card } from './ui'

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    setBusy(true)
    const fn = mode === 'login' ? login : register
    const err = await fn(username, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#dae7f4] px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <p className="text-xl font-semibold text-gray-900">Напояване ХТР Ямбол</p>
          <p className="mt-1 text-sm text-gray-500">{mode === 'login' ? 'Вход в акаунта' : 'Създаване на акаунт'}</p>
        </div>

        <div className="flex flex-col gap-4">
          <FormRow label="Потребителско име" required>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="потребител"
              autoFocus
            />
          </FormRow>
          <FormRow label="Парола" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="••••••••"
            />
          </FormRow>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Btn onClick={submit} disabled={busy || !username.trim() || !password}>
            {busy ? 'Моля, изчакайте…' : mode === 'login' ? 'Вход' : 'Регистрация'}
          </Btn>

          <button
            type="button"
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null) }}
            className="text-center text-xs text-teal-700 hover:underline"
          >
            {mode === 'login' ? 'Нямаш акаунт? Регистрирай се' : 'Вече имаш акаунт? Влез'}
          </button>
        </div>
      </Card>
    </div>
  )
}
