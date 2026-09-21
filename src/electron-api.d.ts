export {}

type UserRole = 'admin' | 'operator'

interface ElectronApi {
  login: (username: string, password: string) => Promise<{ token: string; username: string; role: UserRole } | { error: string }>
  verify: (token: string) => Promise<{ username: string; role: UserRole } | null>
  getAll: (token: string) => Promise<{ data: Record<string, Record<string, unknown>[]> } | { error: string }>
  setCollection: (token: string, collection: string, items: Record<string, unknown>[]) => Promise<{ ok: true } | { error: string }>
  saveFile: (filename: string, base64Data: string) => Promise<{ canceled: boolean; filePath?: string }>
  openTempFile: (filename: string, base64Data: string) => Promise<{ ok: true } | { error: string }>
  setupStatus: () => Promise<{ provisioned: boolean; hasAdmin: boolean; error?: string }>
  detectExistingPostgres: () => Promise<{ existing: boolean; hasSavedPassword: boolean }>
  runProvisioning: (existingSuperuserPassword?: string) => Promise<{ ok: true } | { error: string }>
  onSetupProgress: (callback: (message: string) => void) => () => void
  bootstrapAdmin: (username: string, password: string) => Promise<{ token: string; username: string; role: UserRole } | { error: string; alreadyExists?: boolean }>
  createUser: (token: string, username: string, password: string) => Promise<{ ok: true; username: string } | { error: string }>
  pickBackupFolder: () => Promise<{ canceled: true } | { canceled: false; folderPath: string }>
  writeAutoBackup: (folderPath: string | null, base64Data: string) => Promise<{ ok: true; filePath: string } | { error: string }>
}

declare global {
  interface Window {
    api?: ElectronApi
  }
}
