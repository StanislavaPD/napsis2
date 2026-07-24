import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Contractor, HTU, IrrigationMethod, Crop, Contract, Act, IrrigRequest, Payment } from './types'

interface StoreState {
  contractors: Contractor[]
  htus: HTU[]
  irrigationMethods: IrrigationMethod[]
  crops: Crop[]
  contracts: Contract[]
  acts: Act[]
  requests: IrrigRequest[]
  payments: Payment[]
  setContractors: (v: Contractor[]) => void
  setHtus: (v: HTU[]) => void
  setIrrigationMethods: (v: IrrigationMethod[]) => void
  setCrops: (v: Crop[]) => void
  setContracts: (v: Contract[]) => void
  setActs: (v: Act[]) => void
  setRequests: (v: IrrigRequest[]) => void
  setPayments: (v: Payment[]) => void
}

const StoreContext = createContext<StoreState | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

const CONTRACTOR_EXTRA_DEFAULTS = {
  entityType: 'legal' as const,
  vatRegistered: false, vatNumber: '', egn: '', idCardNumber: '', idCardIssuedDate: '',
  hasProxy: false, proxyName: '', proxyEgn: '', notaryDeedNumber: '', notaryName: '', notaryJurisdiction: '',
}

const SAMPLE_CONTRACTORS: Contractor[] = [
  { id: '1', name: 'Агро Фарм ЕООД', bulstat: '123456789', address: 'с. Горно Езерово, ул. Главна 5', contact: 'Иван Петров', phone: '0888 123 456', iban: '', ...CONTRACTOR_EXTRA_DEFAULTS },
  { id: '2', name: 'Зелена Нива АД', bulstat: '987654321', address: 'гр. Пловдив, бул. Марица 12', contact: 'Мария Стоянова', phone: '0877 654 321', iban: '', ...CONTRACTOR_EXTRA_DEFAULTS },
  { id: '3', name: 'Слънчева Долина ЕТ', bulstat: '456789123', address: 'с. Долно Езерово, ул. Тракия 3', contact: 'Георги Николов', phone: '0899 321 654', iban: '', ...CONTRACTOR_EXTRA_DEFAULTS },
]

const SAMPLE_HTUS: HTU[] = [
  { id: '1', htuName: 'ХТУ Безмер', equipment: 'Помпена станция П-1', village: 'Безмер' },
  { id: '2', htuName: 'ХТУ Ямбол', equipment: 'Помпена станция П-2', village: 'Ямбол' },
  { id: '3', htuName: 'ХТУ Зимница', equipment: 'Хидровъзел Г-3', village: 'Зимница' },
  { id: '4', htuName: 'ХТУ Болярово', equipment: 'Помпена станция П-4', village: 'Болярово' },
  { id: '5', htuName: 'ХТУ Стралджа', equipment: 'Помпена станция П-5', village: 'Стралджа' },
]

const SAMPLE_METHODS: IrrigationMethod[] = [
  { id: '1', name: 'Гравитачно напояване - Капково' },
  { id: '2', name: 'Гравитачно напояване - Дъждуване' },
  { id: '3', name: 'Гравитачно напояване - С водомер' },
  { id: '4', name: 'Помпено напояване - Капково' },
  { id: '5', name: 'Помпено напояване - Дъждуване' },
  { id: '6', name: 'Помпено напояване - С водомер' },
]

const SAMPLE_CROPS: Crop[] = [
  { id: '1', name: 'Пшеница' },
  { id: '2', name: 'Царевица' },
  { id: '3', name: 'Слънчоглед' },
  { id: '4', name: 'Домати' },
  { id: '5', name: 'Краставици' },
  { id: '6', name: 'Картофи' },
]

const SAMPLE_CONTRACTS: Contract[] = [
  {
    id: '1',
    date: '2024-03-15',
    number: 'Д-001/2024',
    contractorId: '1',
    htuId: '1',
    village: 'Горно Езерово',
    irrigationMethodId: '1',
    cropId: '2',
    area: 50,
    irrigationCount: 4,
    totalDka: 200,
    cubicPerDka: 380,
    waterCubic: 76000,
    unitPrice: 0.08,
    value: 6080,
    irrigationNumber: '1',
    month: 'Юни',
  },
]

/**
 * Renames legacy "Фурмово напояване" entries (however cased) to "Помпено напояване", and adds
 * the Гравитачно/Помпено × Капково/Дъждуване/С водомер combinations if none of them exist yet
 * (additive only — never removes existing entries, so old contracts/acts keep a valid reference).
 */
function migrateMethods(methods: IrrigationMethod[]): IrrigationMethod[] {
  const renamed = methods.map(m =>
    m.name.trim().toLowerCase() === 'фурмово напояване' ? { ...m, name: 'Помпено напояване' } : m
  )
  const haveCombos = renamed.some(m => /^(гравитачно|помпено) напояване - /i.test(m.name.trim()))
  if (haveCombos) return renamed
  const missing = SAMPLE_METHODS
    .filter(sm => !renamed.some(m => m.name.trim() === sm.name))
    .map((sm, i) => ({ ...sm, id: `combo-${i}` }))
  return [...renamed, ...missing]
}

/**
 * Ensures all 5 named ХТУ exist. Drops duplicate-named entries (data corruption cleanup from an
 * earlier migration bug that could repeatedly add the same name) and backfills any of the 5 that
 * are still missing — never removes entries with names outside the canonical set.
 */
function migrateHtus(htus: HTU[]): HTU[] {
  const seen = new Set<string>()
  const deduped = htus.filter(h => {
    const key = h.htuName.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const missing = SAMPLE_HTUS
    .filter(sh => !deduped.some(h => h.htuName.trim() === sh.htuName))
    .map((sh, i) => ({ ...sh, id: `htu-${Date.now()}-${i}` }))
  return [...deduped, ...missing]
}

/** Converts payments saved before multi-crop/area support (`cropId` or `cropIds`, no per-crop `area`) to the `items` shape. */
function migratePayments(payments: (Partial<Payment> & { cropId?: string; cropIds?: string[] })[]): Payment[] {
  return payments.map(p => {
    const { cropId, cropIds, items, ...rest } = p
    return {
      id: '', invoiceNumber: '', invoiceDate: '', contractorId: '', amount: 0, paid: false,
      ...rest,
      items: items ?? (cropIds ? cropIds.map(id => ({ cropId: id, area: 0 })) : cropId ? [{ cropId, area: 0 }] : []),
    }
  })
}

/** Converts requests saved before multi-crop/area support (single `cropId`, no per-crop `area`) to the `items` shape. */
function migrateRequests(requests: (Partial<IrrigRequest> & { cropId?: string })[]): IrrigRequest[] {
  return requests.map(r => {
    const { cropId, items, ...rest } = r
    return {
      id: '', contractorId: '', irrigationNumber: '', startDate: '', endDate: '',
      ...rest,
      items: items ?? (cropId ? [{ cropId, area: 0 }] : []),
    }
  })
}

/** Backfills fields for contractors saved before they existed. */
function migrateContractors(contractors: Partial<Contractor>[]): Contractor[] {
  return contractors.map(c => ({
    id: '', name: '', bulstat: '', address: '', contact: '', phone: '', iban: '',
    ...CONTRACTOR_EXTRA_DEFAULTS,
    ...c,
  }))
}

/** Reads and migrates every collection from localStorage (the pre-account persistence layer). */
function loadLegacyFromLocalStorage() {
  return {
    contractors: migrateContractors(load('agrovoda_contractors', SAMPLE_CONTRACTORS)),
    htus: migrateHtus(load('agrovoda_htus', SAMPLE_HTUS)),
    irrigationMethods: migrateMethods(load('agrovoda_methods', SAMPLE_METHODS)),
    crops: load('agrovoda_crops', SAMPLE_CROPS),
    contracts: load('agrovoda_contracts', SAMPLE_CONTRACTS),
    acts: load('agrovoda_acts', [] as Act[]),
    requests: migrateRequests(load('agrovoda_requests', [])),
    payments: migratePayments(load('agrovoda_payments', [])),
  }
}

export function StoreProvider({ children, token }: { children: ReactNode; token?: string | null }) {
  const useBackend = typeof window !== 'undefined' && !!window.api && !!token

  const [contractors, setContractors] = useState<Contractor[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().contractors)
  const [htus, setHtus] = useState<HTU[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().htus)
  const [irrigationMethods, setIrrigationMethods] = useState<IrrigationMethod[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().irrigationMethods)
  const [crops, setCrops] = useState<Crop[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().crops)
  const [contracts, setContracts] = useState<Contract[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().contracts)
  const [acts, setActs] = useState<Act[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().acts)
  const [requests, setRequests] = useState<IrrigRequest[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().requests)
  const [payments, setPayments] = useState<Payment[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().payments)
  const [loaded, setLoaded] = useState(!useBackend)

  // One-time fetch from Postgres via the Electron backend. If the server has no data yet for this
  // account, seed it from whatever is already in this browser's localStorage (pre-account data).
  useEffect(() => {
    if (!useBackend || !token) return
    let cancelled = false
    window.api!.getAll(token).then(async res => {
      if (cancelled) return
      if ('error' in res) { setLoaded(true); return }
      const d = res.data
      const allEmpty = Object.values(d).every(arr => arr.length === 0)
      const seed = allEmpty ? loadLegacyFromLocalStorage() : {
        contractors: migrateContractors(d.contractors ?? []),
        htus: migrateHtus((d.htus ?? []) as unknown as HTU[]),
        irrigationMethods: migrateMethods((d.irrigationMethods ?? []) as unknown as IrrigationMethod[]),
        crops: (d.crops ?? []) as unknown as Crop[],
        contracts: (d.contracts ?? []) as unknown as Contract[],
        acts: (d.acts ?? []) as unknown as Act[],
        requests: migrateRequests(d.requests ?? []),
        payments: migratePayments(d.payments ?? []),
      }
      if (allEmpty) {
        await Promise.all(Object.entries(seed).map(([key, arr]) =>
          arr.length ? window.api!.setCollection(token, key, arr as unknown as Record<string, unknown>[]) : Promise.resolve()
        ))
      }
      if (cancelled) return
      setContractors(seed.contractors)
      setHtus(seed.htus)
      setIrrigationMethods(seed.irrigationMethods)
      setCrops(seed.crops)
      setContracts(seed.contracts)
      setActs(seed.acts)
      setRequests(seed.requests)
      setPayments(seed.payments)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [useBackend, token])

  function persist(collection: string, value: unknown[]) {
    if (!loaded) return
    if (useBackend && token) window.api!.setCollection(token, collection, value as Record<string, unknown>[])
    else localStorage.setItem(`agrovoda_${collection === 'irrigationMethods' ? 'methods' : collection}`, JSON.stringify(value))
  }

  useEffect(() => { persist('contractors', contractors) }, [contractors, loaded])
  useEffect(() => { persist('htus', htus) }, [htus, loaded])
  useEffect(() => { persist('irrigationMethods', irrigationMethods) }, [irrigationMethods, loaded])
  useEffect(() => { persist('crops', crops) }, [crops, loaded])
  useEffect(() => { persist('contracts', contracts) }, [contracts, loaded])
  useEffect(() => { persist('acts', acts) }, [acts, loaded])
  useEffect(() => { persist('requests', requests) }, [requests, loaded])
  useEffect(() => { persist('payments', payments) }, [payments, loaded])

  if (!loaded) return null

  return (
    <StoreContext.Provider value={{
      contractors, setContractors,
      htus, setHtus,
      irrigationMethods, setIrrigationMethods,
      crops, setCrops,
      contracts, setContracts,
      acts, setActs,
      requests, setRequests,
      payments, setPayments,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
