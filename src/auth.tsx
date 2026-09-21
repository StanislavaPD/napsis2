import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const TOKEN_KEY = 'agrovoda_token'

export type UserRole = 'admin' | 'operator'

interface AuthState {
  ready: boolean
  hasBackend: boolean
  username: string | null
  role: UserRole | null
  token: string | null
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
  setSession: (token: string, username: string, role: UserRole) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasBackend = typeof window !== 'undefined' && !!window.api
  const [ready, setReady] = useState(!hasBackend)
  const [username, setUsername] = useState<string | null>(hasBackend ? null : 'Стаси')
  const [role, setRole] = useState<UserRole | null>(hasBackend ? null : 'admin')
  const [token, setToken] = useState<string | null>(hasBackend ? null : 'dev-token')

  useEffect(() => {
    if (!hasBackend) return
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) { setReady(true); return }
    window.api!.verify(stored).then(res => {
      if (res) { setToken(stored); setUsername(res.username); setRole(res.role) }
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
    setRole(res.role)
    return null
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsername(null)
    setRole(null)
  }

  function setSession(t: string, u: string, r: UserRole) {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setUsername(u)
    setRole(r)
  }

  return (
    <AuthContext.Provider value={{ ready, hasBackend, username, role, token, login, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
