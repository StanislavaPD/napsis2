import { useRef, useState, useEffect, type ReactNode, type ChangeEvent, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  extraWide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  extraWide?: boolean
}) {
  const w = extraWide ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-lg'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] w-full ${w}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
export function Btn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  className?: string
}) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-sm',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    ghost: 'text-gray-600 hover:bg-gray-100',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function EditIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  )
}

export function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

export function ImportIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.25V18a2 2 0 002 2h12a2 2 0 002-2v-2.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v10.5m0 0l-3.5-3.5M12 14.25l3.5-3.5" />
    </svg>
  )
}

export function ExportIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.25V18a2 2 0 002 2h12a2 2 0 002-2v-2.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25v-10.5m0 0l-3.5 3.5M12 3.75l3.5 3.5" />
    </svg>
  )
}

export function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.25V18a2 2 0 002 2h12a2 2 0 002-2v-2.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v10.5m0 0l-3.5-3.5M12 14.25l3.5-3.5" />
    </svg>
  )
}

export function PrinterIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 8.25V4.5a1 1 0 011-1h8.5a1 1 0 011 1v3.75" />
      <rect x="3.75" y="8.25" width="16.5" height="8" rx="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 14.25v4.5a1 1 0 001 1h8.5a1 1 0 001-1v-4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5h2" />
    </svg>
  )
}

export function SaveIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="8.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.75 12.25l2.25 2.25 4.25-4.5" />
    </svg>
  )
}

export function FormRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement>
export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition ${className}`}
    />
  )
}

/**
 * A decimal-friendly numeric input. Unlike a plain `<Input type="number">` bound directly to a
 * parsed number, this keeps whatever the user is typing on screen (so "0", "0.", "0.01" don't get
 * collapsed back to "0" mid-keystroke) while still reporting a real number via onChange.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value === 0 ? '' : String(value))

  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.'))
    const current = Number.isNaN(parsed) ? 0 : parsed
    if (current !== value) setText(value === 0 ? '' : String(value))
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value
        if (!/^-?\d*[.,]?\d*$/.test(raw)) return
        setText(raw)
        const n = parseFloat(raw.replace(',', '.'))
        onChange(Number.isNaN(n) ? 0 : n)
      }}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition ${className}`}
    />
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
export function Select({ className = '', children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition appearance-none cursor-pointer ${className}`}
    >
      {children}
    </select>
  )
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition resize-none ${className}`}
    />
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Търсене...',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition w-64"
      />
    </div>
  )
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <Btn variant="secondary" onClick={onCancel}>Откажи</Btn>
          <Btn variant="danger" onClick={onConfirm}>Изтрий</Btn>
        </div>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: 'gray' | 'teal' | 'blue' | 'amber' | 'red' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-600',
    teal: 'bg-teal-50 text-teal-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, color = 'teal' }: { label: string; value: string | number; sub?: string; color?: 'teal' | 'blue' | 'amber' | 'emerald' }) {
  const colors = {
    teal: 'from-teal-500 to-teal-600',
    blue: 'from-blue-500 to-blue-600',
    amber: 'from-amber-400 to-amber-500',
    emerald: 'from-emerald-500 to-emerald-600',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-5 text-white shadow-md`}>
      <p className="text-xs font-medium opacity-80 mb-2">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  )
}

export function num(v: number | string, decimals = 2) {
  const n = Number(v)
  return isNaN(n) ? '0' : n.toLocaleString('bg-BG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function ImportButton({ label = <><ImportIcon /> Импорт</>, onFile }: { label?: ReactNode; onFile: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <Btn variant="secondary" onClick={() => ref.current?.click()}>{label}</Btn>
    </>
  )
}

export function ImportResultModal({ added, errors, onClose }: { added: number; errors: string[]; onClose: () => void }) {
  return (
    <Modal title="Резултат от импорта" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="bg-teal-50 rounded-lg px-4 py-3 text-sm text-teal-700 font-medium">
          ✓ Успешно импортирани записа: {added}
        </div>
        {errors.length > 0 && (
          <div className="bg-red-50 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-red-600 mb-2">Пропуснати редове ({errors.length}):</p>
            <ul className="text-xs text-red-500 space-y-1 max-h-48 overflow-y-auto">
              {errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}
      </div>
      <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
        <Btn onClick={onClose}>Затвори</Btn>
      </div>
    </Modal>
  )
}
