import { useEffect, useState } from 'react'
import { StoreProvider } from './store'
import { AuthProvider, useAuth } from './auth'
import type { Module } from './types'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import SetupWizard from './setup/SetupWizard'
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
import Settings from './components/Settings'

function AppContent() {
  const { logout, role } = useAuth()
  const isAdmin = role === 'admin'
  const [active, setActive] = useState<Module>(isAdmin ? 'dashboard' : 'contractors')
  const [contractorFilter, setContractorFilter] = useState<string | undefined>(undefined)
  const visibleActive = !isAdmin && (active === 'dashboard' || active === 'reports') ? 'contractors' : active

  function handleReportsNavigate(module: 'contracts' | 'acts', contractorId?: string) {
    setContractorFilter(contractorId)
    setActive(module)
  }

  function renderModule() {
    switch (visibleActive) {
      case 'dashboard': return isAdmin ? <Dashboard onNavigate={setActive} /> : <Contractors />
      case 'contractors': return <Contractors />
      case 'htu': return <HTUModule />
      case 'methods': return <Methods />
      case 'contracts': return <Contracts initialContractorId={contractorFilter} onClearFilter={() => setContractorFilter(undefined)} />
      case 'acts': return <Acts initialContractorId={contractorFilter} onClearFilter={() => setContractorFilter(undefined)} />
      case 'requests': return <Requests />
      case 'payments': return <Payments />
      case 'reports': return isAdmin ? <Reports onNavigate={handleReportsNavigate} /> : <Contractors />
      case 'generators': return isAdmin ? <Generators /> : <Contractors />
      case 'gen-contract': return <Generators defaultTab="contract" />
      case 'gen-act': return <Generators defaultTab="act" />
      case 'gen-request': return <Generators defaultTab="request" />
      case 'settings': return <Settings />
    }
  }

  return (
    <div className="flex h-screen flex-col md:flex-row bg-[#dae7f4] font-sans overflow-hidden">
      <Sidebar active={visibleActive} onNavigate={setActive} onLogout={logout} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-full">
          {renderModule()}
        </div>
      </main>
    </div>
  )
}

function Gate() {
  const { ready, hasBackend, username, role, token, setSession } = useAuth()
  const [setupChecked, setSetupChecked] = useState(!hasBackend)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    if (!hasBackend) return
    window.api!.setupStatus().then(res => {
      setNeedsSetup(!res.provisioned || !res.hasAdmin)
      setSetupChecked(true)
    })
  }, [hasBackend])

  if (hasBackend && !setupChecked) return null
  if (hasBackend && needsSetup) {
    return (
      <SetupWizard
        onComplete={(t, u, r) => { setSession(t, u, r); setNeedsSetup(false) }}
        onSkipToLogin={() => setNeedsSetup(false)}
      />
    )
  }
  if (hasBackend && !ready) return null
  if (hasBackend && !username) return <Login />

  return (
      <StoreProvider token={hasBackend ? token : undefined} isAdmin={role === 'admin'}>
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
