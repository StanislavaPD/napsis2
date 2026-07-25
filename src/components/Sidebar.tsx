import { useState } from 'react'
import type { Module } from '../types'
import { useStore } from '../store'
import type { SVGProps } from 'react'

function NavIcon({ children, ...props }: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[19px] h-[19px]"
      {...props}
    >
      {children}
    </svg>
  )
}

function DashboardIcon() {
  return (
    <NavIcon>
      <rect x="3.75" y="3.75" width="7" height="7" rx="1.5" />
      <rect x="13.25" y="3.75" width="7" height="7" rx="1.5" />
      <rect x="3.75" y="13.25" width="7" height="7" rx="1.5" />
      <rect x="13.25" y="13.25" width="7" height="7" rx="1.5" />
    </NavIcon>
  )
}

function UserIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" />
    </NavIcon>
  )
}

function FacilityIcon() {
  return (
    <NavIcon>
      <path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 105.5 10c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.25" />
    </NavIcon>
  )
}

function DropIcon() {
  return (
    <NavIcon>
      <path d="M12 3s6 7.2 6 11.5a6 6 0 11-12 0C6 10.2 12 3 12 3z" />
    </NavIcon>
  )
}

function DocumentIcon({ accent }: { accent?: 'check' | 'lines' }) {
  return (
    <NavIcon>
      <path d="M7 3.75h7.5l3.75 3.75V19.5a1 1 0 01-1 1H7a1 1 0 01-1-1V4.75a1 1 0 011-1z" />
      <path d="M14.5 3.75V7.5h3.75" />
      {accent === 'check' && <path d="M9 13.5l1.75 1.75L15.5 10.5" />}
      {accent === 'lines' && <path d="M9 12.5h6M9 15.5h6" />}
    </NavIcon>
  )
}

function InvoiceIcon() {
  return (
    <NavIcon>
      <rect x="3.5" y="6.25" width="17" height="11.5" rx="1.5" />
      <circle cx="12" cy="12" r="2.25" />
    </NavIcon>
  )
}

function ChartLineIcon() {
  return (
    <NavIcon>
      <path d="M4 4v14.5A1.5 1.5 0 005.5 20H20" />
      <path d="M6 15.5l4-4.5 3 3 5-6.5" />
    </NavIcon>
  )
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform ${flipped ? 'rotate-180' : ''}`}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

const NAV = [
  { id: 'dashboard' as Module, label: 'Работно табло', icon: <DashboardIcon /> },
  { id: 'contractors' as Module, label: 'Регистър контрагенти', icon: <UserIcon /> },
  { id: 'htu' as Module, label: 'ХТУ и съоръжения', icon: <FacilityIcon /> },
  { id: 'methods' as Module, label: 'Напояване и култури', icon: <DropIcon /> },
  { id: 'contracts' as Module, label: 'Договори', icon: <DocumentIcon accent="check" /> },
  { id: 'requests' as Module, label: 'Заявки', icon: <DocumentIcon accent="lines" /> },
  { id: 'acts' as Module, label: 'Актове', icon: <DocumentIcon accent="lines" /> },
  { id: 'payments' as Module, label: 'Плащания', icon: <InvoiceIcon /> },
  { id: 'reports' as Module, label: 'Справки и експорт', icon: <ChartLineIcon /> },
]

export default function Sidebar({ active, onNavigate, onLogout }: { active: Module; onNavigate: (m: Module) => void; onLogout?: () => void }) {
  const { contracts, acts, requests, payments } = useStore()
  const [collapsed, setCollapsed] = useState(false)

  const counts: Partial<Record<Module, number>> = {
    contracts: contracts.length,
    acts: acts.length,
    requests: requests.length,
    payments: payments.filter(p => !p.paid).length,
  }

  return (
    <aside
      className={`relative w-full shrink-0 bg-[#173f63] flex flex-col md:h-screen md:sticky top-0 border-r border-[#2f5a80] transition-[width] duration-200 ${
        collapsed ? 'md:w-[76px]' : 'md:w-[252px]'
      }`}
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        title={collapsed ? 'Разгъни менюто' : 'Свий менюто'}
        className="hidden md:flex absolute -right-3 top-9 z-10 w-6 h-6 rounded-full bg-[#1e5f8f] border border-sky-300/40 text-sky-100 items-center justify-center hover:bg-[#256faa] transition-colors"
      >
        <ChevronIcon flipped={collapsed} />
      </button>

      {/* Logo */}
      <div className={`px-5 py-5 md:py-8 ${collapsed ? 'md:px-0 md:flex md:justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'md:gap-0' : ''}`}>
          <div className="w-16 h-16 shrink-0 rounded-lg border border-sky-300/50 overflow-hidden flex items-center justify-center bg-white/5">
            <img src="./i.ico" alt="" className="w-24 h-24 object-contain" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-white font-semibold text-xl leading-tight tracking-tight">Напояване</p>
              <p className="text-white font-semibold text-xl leading-tight tracking-tight">ХТР Ямбол</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-5">
        <div className="space-y-2">
          {NAV.map(item => {
            const isActive = active === item.id
            const count = counts[item.id]

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-left text-sm font-semibold transition-all ${
                  collapsed ? 'md:justify-center md:px-0' : ''
                } ${
                  isActive
                    ? 'bg-[#1e5f8f] ring-1 ring-teal-300/40 nav-item-active'
                    : 'text-sky-100/95 hover:bg-[#1d4d75]'
                }`}
              >
                <span className={`w-6 shrink-0 flex items-center justify-center ${isActive ? 'text-teal-300 nav-icon-active' : 'opacity-90'}`}>{item.icon}</span>
                {!collapsed && <span className={`flex-1 truncate ${isActive ? 'text-teal-300' : ''}`}>{item.label}</span>}
                {!collapsed && count !== undefined && count > 0 && (
                  <span className="rounded-full bg-sky-200/20 px-2 py-0.5 text-xs text-sky-100">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {onLogout && (
        <div className={`px-4 pb-2 ${collapsed ? 'md:flex md:justify-center md:px-0' : ''}`}>
          <button
            onClick={onLogout}
            title="Изход"
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-sky-100/80 hover:bg-[#1d4d75] hover:text-sky-100 transition-colors ${
              collapsed ? 'md:justify-center md:px-0 md:w-11' : 'w-full'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px] shrink-0">
              <path d="M15 4.5H8.5A1.5 1.5 0 007 6v12a1.5 1.5 0 001.5 1.5H15" />
              <path d="M11 12h9.5m0 0l-3-3m3 3l-3 3" />
            </svg>
            {!collapsed && 'Изход'}
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="px-5 py-4 text-center text-xs text-sky-200/40 leading-relaxed">
          инж. Станислава Димитрова<br />@ 2026 · v1.0
        </div>
      )}
    </aside>
  )
}
