export const ARCHIVE_VERSION = 1

export interface ArchiveCollections {
  contractors: unknown[]
  htus: unknown[]
  irrigationMethods: unknown[]
  crops: unknown[]
  contracts: unknown[]
  acts: unknown[]
  requests: unknown[]
  payments: unknown[]
}

export interface ArchiveFile extends ArchiveCollections {
  version: number
  exportedAt: string
}

const COLLECTION_KEYS: (keyof ArchiveCollections)[] = [
  'contractors', 'htus', 'irrigationMethods', 'crops', 'contracts', 'acts', 'requests', 'payments',
]

export function buildArchive(data: ArchiveCollections): ArchiveFile {
  return { version: ARCHIVE_VERSION, exportedAt: new Date().toISOString(), ...data }
}

export function isValidArchive(x: unknown): x is ArchiveFile {
  if (!x || typeof x !== 'object') return false
  return COLLECTION_KEYS.every(k => Array.isArray((x as Record<string, unknown>)[k]))
}

/** localStorage key holding the user-chosen folder for the daily auto-backup (null/absent = default Documents folder). */
export const BACKUP_FOLDER_KEY = 'agrovoda_backup_folder'
/** localStorage key holding the "yyyy-mm-dd" date the auto-backup last ran, so it only fires once per day. */
export const LAST_AUTO_BACKUP_KEY = 'agrovoda_last_auto_backup_date'
