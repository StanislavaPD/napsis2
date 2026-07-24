import { useState } from 'react'
import { StoreProvider } from './store'
import { AuthProvider, useAuth } from './auth'
import type { Module } from './types'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Contractors from './components/Contractors'
import HTUModule from './components/HTU'
import Methods from './components/Methods'
import Contracts from './components/Contracts'
import Acts from './components/Acts'
import Requests from './components/Requests'
import Payments from './components/Payments'
import Reports from './components/Reports'
import Generators from './components/Generators'
import Dashboard from './components/Dashboard'

function AppContent() {
  const { logout } = useAuth()
  const [active, setActive] = useState<Module>('dashboard')

  function renderModule() {
    switch (active) {
      case 'dashboard': return <Dashboard onNavigate={setActive} />
      case 'contractors': return <Contractors />
      case 'htu': return <HTUModule />
      case 'methods': return <Methods />
      case 'contracts': return <Contracts />
      case 'acts': return <Acts />
      case 'requests': return <Requests />
      case 'payments': return <Payments />
      case 'reports': return <Reports />
      case 'gen-contract': return <Generators defaultTab="contract" />
      case 'gen-act': return <Generators defaultTab="act" />
      case 'gen-request': return <Generators defaultTab="request" />
    }
  }

  return (
    <div className="flex h-screen flex-col md:flex-row bg-[#dae7f4] font-sans overflow-hidden">
      <Sidebar active={active} onNavigate={setActive} onLogout={logout} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-full">
          {renderModule()}
        </div>
      </main>
    </div>
  )
}

function Gate() {
  const { ready, hasBackend, username, token } = useAuth()

  if (hasBackend && !ready) return null
  if (hasBackend && !username) return <Login />

  return (
    <StoreProvider token={hasBackend ? token : undefined}>
      <AppContent />
    </StoreProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
