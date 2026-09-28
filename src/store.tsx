import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Contractor, HTU, IrrigationMethod, Crop, Contract, Act, IrrigRequest, Payment, UdvnRepair, SeasonArchive } from './types'
import { buildArchive, BACKUP_FOLDER_KEY, LAST_AUTO_BACKUP_KEY } from './lib/backup'
import { blobToBase64 } from './lib/docx-fill'

interface StoreState {
  contractors: Contractor[]
  htus: HTU[]
  irrigationMethods: IrrigationMethod[]
  crops: Crop[]
  contracts: Contract[]
  acts: Act[]
  requests: IrrigRequest[]
  payments: Payment[]
  udvnRepairs: UdvnRepair[]
  seasonArchives: SeasonArchive[]
  setContractors: (v: Contractor[]) => void
  setHtus: (v: HTU[]) => void
  setIrrigationMethods: (v: IrrigationMethod[]) => void
  setCrops: (v: Crop[]) => void
  setContracts: (v: Contract[]) => void
  setActs: (v: Act[]) => void
  setRequests: (v: IrrigRequest[]) => void
  setPayments: (v: Payment[]) => void
  setUdvnRepairs: (v: UdvnRepair[]) => void
  setSeasonArchives: (v: SeasonArchive[]) => void
  findOrCreateContractor: (name: string) => string
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

const SAMPLE_CONTRACTORS: Contractor[] = []

const SAMPLE_HTUS: HTU[] = [
  { id: '2',            htuName: 'ХТУ  "Ямбол"',    equipment: 'ЯГ -4 ПС ДЗС', village: 'гр. Ямбол' },
  { id: '3',            htuName: 'ХТУ  "Зимница"', equipment: 'Р-9',           village: 'с. Зимница' },
  { id: '4',            htuName: 'ХТУ  "Болярово"',equipment: 'Р-4',           village: 'гр. Болярово' },
  { id: '5',            htuName: 'ХТУ  "Стралджа"',equipment: 'ГСТ',           village: 'гр. Стралджа' },
  { id: '1786719120870',htuName: 'ХТУ  "Безмер"',  equipment: 'M-1-3',         village: 'с. Гълъбинци' },
  { id: '1786719673623',htuName: 'ХТУ  "Безмер"',  equipment: 'M-1-3',         village: 'с. Безмер' },
  { id: '1786719734094',htuName: 'ХТУ  "Безмер"',  equipment: 'M-1-3',         village: 'с. Болярско' },
  { id: '1786720010999',htuName: 'ХТУ  "Зимница"', equipment: 'Р-9',           village: 'с. Веселиново' },
  { id: '1786720024548',htuName: 'ХТУ  "Зимница"', equipment: 'Р-10',          village: 'с. Зимница' },
  { id: '1786720040348',htuName: 'ХТУ  "Зимница"', equipment: 'Р-9',           village: 'с. Завой' },
]

const SAMPLE_METHODS: IrrigationMethod[] = [
  { id: '1',            name: 'Гравитачно  - капково' },
  { id: '2',            name: 'Гравитачно - дъждуване' },
  { id: '3',            name: 'Гравитачно  - с водомер' },
  { id: '4',            name: 'Помпено  - капково' },
  { id: '5',            name: 'Помпено  - дъждуване' },
  { id: '6',            name: 'Помпено - с водомер' },
  { id: '1786720870979',name: 'Гравитачно' },
  { id: '1786720955889',name: 'Помпено' },
]

const SAMPLE_CROPS: Crop[] = [
  { id: '1',            name: 'Пшеница' },
  { id: '2',            name: 'Царевица' },
  { id: '3',            name: 'Слънчоглед' },
  { id: '4',            name: 'Домати' },
  { id: '5',            name: 'Краставици' },
  { id: '6',            name: 'Картофи' },
  { id: '1786720213915',name: 'Маточина' },
  { id: '1786720325062',name: 'Лозя' },
  { id: '1786720364345',name: 'Люцерна' },
  { id: '1786720410777',name: 'Бостан' },
  { id: '1786720461585',name: 'Тр. насаждения' },
  { id: '1786720513396',name: 'Зеленчуци' },
  { id: '1786721942956',name: 'Бадем' },
  { id: '1786721954695',name: 'Сливи' },
]

const SAMPLE_CONTRACTS: Contract[] = []

/**
 * Renames legacy "Фурмово напояване" entries (however cased) to "Помпено напояване", and adds
 * the Гравитачно/Помпено × Капково/Дъждуване/С водомер combinations if none of them exist yet
 * (additive only — never removes existing entries, so old contracts/acts keep a valid reference).
 */
function migrateMethods(methods: IrrigationMethod[]): IrrigationMethod[] {
  const renamed = methods.map(m =>
    m.name.trim().toLowerCase() === 'фурмово напояване' ? { ...m, name: 'Помпено напояване' } : m
  )
  const haveCombos = renamed.some(m => /^(гравитачно|помпено)(\s+напояване)?\s*-/i.test(m.name.trim()))
  if (haveCombos) return renamed
  const missing = SAMPLE_METHODS
    .filter(sm => !renamed.some(m => m.name.trim() === sm.name))
    .map((sm, i) => ({ ...sm, id: `combo-${i}` }))
  return [...renamed, ...missing]
}

/**
 * Drops entries that are fully identical (same ХТУ name, съоражение AND землище) — data corruption
 * cleanup from an earlier migration bug. Same ХТУ name with a *different* съоражение or землище is a
 * legit, intentional record (one ХТУ can have several съоражения), so only the full combo is a dup.
 */
function migrateHtus(htus: HTU[]): HTU[] {
  const seen = new Set<string>()
  return htus.filter(h => {
    const key = `${h.htuName.trim().toLowerCase()}|${h.equipment.trim().toLowerCase()}|${h.village.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    udvnRepairs: load('agrovoda_udvn_repairs', [] as UdvnRepair[]),
    seasonArchives: load('agrovoda_season_archives', [] as SeasonArchive[]),
  }
}

export function StoreProvider({ children, token, isAdmin = false }: { children: ReactNode; token?: string | null; isAdmin?: boolean }) {
  const useBackend = typeof window !== 'undefined' && !!window.api && !!token

  const [contractors, setContractors] = useState<Contractor[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().contractors)
  const [htus, setHtus] = useState<HTU[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().htus)
  const [irrigationMethods, setIrrigationMethods] = useState<IrrigationMethod[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().irrigationMethods)
  const [crops, setCrops] = useState<Crop[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().crops)
  const [contracts, setContracts] = useState<Contract[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().contracts)
  const [acts, setActs] = useState<Act[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().acts)
  const [requests, setRequests] = useState<IrrigRequest[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().requests)
  const [payments, setPayments] = useState<Payment[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().payments)
  const [udvnRepairs, setUdvnRepairs] = useState<UdvnRepair[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().udvnRepairs)
  const [seasonArchives, setSeasonArchives] = useState<SeasonArchive[]>(() => useBackend ? [] : loadLegacyFromLocalStorage().seasonArchives)
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

  /** Resolves a typed contractor name to an id, creating a bare-bones Contractor record if no existing one matches (case/whitespace-insensitive) — backs the contractor Combobox on the Requests/Contracts/Acts/Payments forms so operators can type a name instead of only picking from the register. */
  function findOrCreateContractor(name: string): string {
    const trimmed = name.trim()
    const existing = contractors.find(c => c.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.id
    const id = Date.now().toString()
    setContractors([...contractors, {
      id, name: trimmed, bulstat: '', address: '', contact: '', phone: '', iban: '',
      ...CONTRACTOR_EXTRA_DEFAULTS,
    }])
    return id
  }

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
  useEffect(() => { persist('seasonArchives', seasonArchives) }, [seasonArchives, loaded])

  // Silent daily backup: writes the same fixed filename each time (no save dialog), so it's purely
  // a local safety net — only runs once per calendar day, tracked via a localStorage date stamp.
  useEffect(() => {
    if (!loaded || !useBackend || !isAdmin) return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LAST_AUTO_BACKUP_KEY) === today) return
    const archive = buildArchive({ contractors, htus, irrigationMethods, crops, contracts, acts, requests, payments })
    const blob = new Blob([JSON.stringify(archive)], { type: 'application/json' })
    blobToBase64(blob).then(base64 => {
      const folder = localStorage.getItem(BACKUP_FOLDER_KEY)
      window.api!.writeAutoBackup(folder, base64).then(res => {
        if (!('error' in res)) localStorage.setItem(LAST_AUTO_BACKUP_KEY, today)
      })
    })
  }, [loaded, useBackend, isAdmin, contractors, htus, irrigationMethods, crops, contracts, acts, requests, payments])

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
      udvnRepairs, setUdvnRepairs,
      seasonArchives, setSeasonArchives,
      findOrCreateContractor,
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
