import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const TOKEN_KEY = 'agrovoda_token'

interface AuthState {
  ready: boolean
  hasBackend: boolean
  username: string | null
  token: string | null
  login: (username: string, password: string) => Promise<string | null>
  register: (username: string, password: string) => Promise<string | null>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasBackend = typeof window !== 'undefined' && !!window.api
  const [ready, setReady] = useState(!hasBackend)
  const [username, setUsername] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (!hasBackend) return
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) { setReady(true); return }
    window.api!.verify(stored).then(res => {
      if (res) { setToken(stored); setUsername(res.username) }
      else localStorage.removeItem(TOKEN_KEY)
      setReady(true)
    })
  }, [hasBackend])

  async function login(u: string, p: string) {
    if (!hasBackend) return 'Няма връзка с базата данни.'
    const res = await window.api!.login(u, p)
    if ('error' in res) return res.error
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUsername(res.username)
    return null
  }

  async function register(u: string, p: string) {
    if (!hasBackend) return 'Няма връзка с базата данни.'
    const res = await window.api!.register(u, p)
    if ('error' in res) return res.error
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUsername(res.username)
    return null
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ ready, hasBackend, username, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
