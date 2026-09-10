import type { Act } from '../types'
import type { Contract } from '../types'

/** Identifies "the same act" — same document number and date, regardless of which crop line it's for. */
export function actKey(a: Pick<Act, 'number' | 'date'>): string {
  return `${a.number.trim().toLowerCase()}|${a.date}`
}

/** Counts acts as documents rather than rows: two rows sharing the same number and date (one act covering several crops) count once. */
export function countActs(list: Act[]): number {
  return new Set(list.map(actKey)).size
}

/** Identifies "the same contract" — same number and date, regardless of crop. */
export function contractKey(c: Pick<Contract, 'number' | 'date'>): string {
  return `${c.number.trim().toLowerCase()}|${c.date}`
}

/** Counts contracts as documents: rows sharing the same number+date count once. */
export function countContracts(list: Contract[]): number {
  return new Set(list.map(contractKey)).size
}

/** The real duplicate case for an act: same number, date AND crop as `form`. Two rows sharing a number+date but different crops are the same act split by culture, not a duplicate. */
export function findDuplicateAct(list: Act[], form: Omit<Act, 'id'>, excludeId?: string): Act | undefined {
  const number = form.number.trim().toLowerCase()
  return list.find(a =>
    a.id !== excludeId &&
    a.number.trim().toLowerCase() === number &&
    a.date === form.date &&
    a.cropId === form.cropId
  )
}
