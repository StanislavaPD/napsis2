export {}

interface ElectronApi {
  register: (username: string, password: string) => Promise<{ token: string; username: string } | { error: string }>
  login: (username: string, password: string) => Promise<{ token: string; username: string } | { error: string }>
  verify: (token: string) => Promise<{ username: string } | null>
  getAll: (token: string) => Promise<{ data: Record<string, Record<string, unknown>[]> } | { error: string }>
  setCollection: (token: string, collection: string, items: Record<string, unknown>[]) => Promise<{ ok: true } | { error: string }>
  saveFile: (filename: string, base64Data: string) => Promise<{ canceled: boolean; filePath?: string }>
}

declare global {
  interface Window {
    api?: ElectronApi
  }
}
