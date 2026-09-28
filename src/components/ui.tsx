import { useRef, useState, useEffect, type ReactNode, type ChangeEvent, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

export function Modal({
  title,
  onClose,
  onSave,
  children,
  wide = false,
  extraWide = false,
}: {
  title: string
  onClose: () => void
  onSave?: () => void
  children: ReactNode
  wide?: boolean
  extraWide?: boolean
}) {
  useEffect(() => {
    if (!onSave) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault()
        onSave!()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onSave])

  const w = extraWide ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-lg'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`bg-white rounded-xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] w-full ${w}`}>
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-3 sm:px-6 py-3 sm:py-5">{children}</div>
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

export function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <rect x="8" y="8" width="11" height="13" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8V6.5A1.5 1.5 0 0014.5 5h-9A1.5 1.5 0 004 6.5v11A1.5 1.5 0 005.5 19H8" />
    </svg>
  )
}

export function ArchiveBoxIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <rect x="3.75" y="4.5" width="16.5" height="4" rx="1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 8.5v9a1.5 1.5 0 001.5 1.5h11.5a1.5 1.5 0 001.5-1.5v-9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 12.5h4" />
    </svg>
  )
}

export function ChartBarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20.25h16" />
      <rect x="6" y="12.5" width="3" height="7.5" rx="0.75" />
      <rect x="10.5" y="8" width="3" height="12" rx="0.75" />
      <rect x="15" y="4.5" width="3" height="15.5" rx="0.75" />
    </svg>
  )
}

export function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="8.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function FileTextIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

export function ToolsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  )
}

export function WaterDropIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
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

/**
 * A text input that filters a dropdown of options as you type, instead of a long native <select>
 * list — used where the option list is long enough that scrolling through it is slower than typing.
 */
export function Autocomplete({
  value,
  onChange,
  options,
  placeholder = 'Търсене...',
}: {
  value: string
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  placeholder?: string
}) {
  const selected = options.find(o => o.id === value)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selected?.label ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options

  function select(o: { id: string; label: string }) {
    onChange(o.id)
    setQuery(o.label)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Няма съвпадения</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(o)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 ${o.id === value ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Like Autocomplete, but lets the user commit a name that isn't in the option list yet — `onCreate`
 * is called with the typed text (on blur, Enter, or clicking the "+ Add" row) and must return the id
 * to select, e.g. finding-or-creating a record. Used where a field is normally picked from a small
 * register (contractors, etc.) but operators need to add one on the fly while filling in a form.
 */
export function Combobox({
  value,
  onChange,
  options,
  onCreate,
  placeholder = 'Търсене или въвеждане...',
}: {
  value: string
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  onCreate?: (name: string) => string
  placeholder?: string
}) {
  const selected = options.find(o => o.id === value)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selected?.label ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  const exactMatch = options.find(o => o.label.trim().toLowerCase() === q)

  function select(o: { id: string; label: string }) {
    onChange(o.id)
    setQuery(o.label)
    setOpen(false)
  }

  function commit() {
    setOpen(false)
    const trimmed = query.trim()
    if (!trimmed) { onChange(''); return }
    const match = options.find(o => o.label.trim().toLowerCase() === trimmed.toLowerCase())
    if (match) { select(match); return }
    if (onCreate) onChange(onCreate(trimmed))
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        placeholder={placeholder}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(o)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                o.id === value
                  ? 'bg-gradient-to-r from-teal-50 to-blue-50 text-teal-700 font-medium border-l-2 border-teal-500'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && !onCreate && (
            <p className="px-3 py-2 text-sm text-gray-400">Няма съвпадения</p>
          )}
          {onCreate && q && !exactMatch && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={commit}
              className="w-full text-left px-3 py-2 text-sm text-teal-600 font-medium hover:bg-teal-50 border-t border-gray-200 transition-colors"
            >
              ✨ Добави "{query.trim()}" като нов
            </button>
          )}
        </div>
      )}
    </div>
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
    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 w-full sm:w-auto">{actions}</div>}
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
    <div className={`bg-gradient-to-br ${colors[color]} rounded-lg sm:rounded-xl p-3 sm:p-5 text-white shadow-md`}>
      <p className="text-[10px] sm:text-xs font-medium opacity-80 mb-1 sm:mb-2">{label}</p>
      <p className="text-lg sm:text-2xl font-semibold">{value}</p>
      {sub && <p className="text-[10px] sm:text-xs opacity-70 mt-0.5 sm:mt-1">{sub}</p>}
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
        accept=".xlsx,.csv"
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
