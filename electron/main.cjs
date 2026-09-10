const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const fssync = require('node:fs')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const provision = require('./provision.cjs')

// Dev keeps using the repo-root .env unchanged. Packaged builds have no such file — each installed
// machine provisions its own independent PostgreSQL instance on first run (see provision.cjs), and
// the resulting config is written to userData (always writable, unlike resourcesPath).
const devEnvPath = path.join(__dirname, '..', '.env')
function loadConfig() {
  if (!app.isPackaged && fssync.existsSync(devEnvPath)) {
    require('dotenv').config({ path: devEnvPath, quiet: true })
    return
  }
  const userConfigPath = provision.configPath()
  if (fssync.existsSync(userConfigPath)) {
    require('dotenv').config({ path: userConfigPath, quiet: true })
  }
}
loadConfig()

let pool = null
function getPool() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return pool
}

function getJwtSecret() {
  return process.env.JWT_SECRET
}

const COLLECTIONS = ['contractors', 'htus', 'irrigationMethods', 'crops', 'contracts', 'acts', 'requests', 'payments']
const TABLE_BY_COLLECTION = {
  contractors: 'contractors',
  htus: 'htus',
  irrigationMethods: 'irrigation_methods',
  crops: 'crops',
  contracts: 'contracts',
  acts: 'acts',
  requests: 'requests',
  payments: 'payments',
}

function verifyToken(token) {
  const secret = getJwtSecret()
  if (!secret) return null
  try {
    return jwt.verify(token, secret)
  } catch {
    return null
  }
}

// No auth:register handler: new accounts are created directly in the database (or once, through
// auth:bootstrapAdmin during first-run setup), never through the regular app UI, so nobody can
// self-register without the owner's explicit action.
ipcMain.handle('auth:login', async (_e, username, password) => {
  username = String(username || '').trim()
  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }
  const result = await p.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username])
  const user = result.rows[0]
  if (!user) return { error: 'Грешно потребителско име или парола.' }
  const ok = await bcrypt.compare(String(password || ''), user.password_hash)
  if (!ok) return { error: 'Грешно потребителско име или парола.' }
  const token = jwt.sign({ sub: user.id, username: user.username }, getJwtSecret(), { expiresIn: '30d' })
  return { token, username: user.username }
})

ipcMain.handle('auth:verify', async (_e, token) => {
  const payload = verifyToken(token)
  if (!payload) return null
  return { username: payload.username }
})

ipcMain.handle('setup:status', async () => {
  const p = getPool()
  if (!p) return { provisioned: false, hasAdmin: false }
  try {
    const r = await p.query('SELECT count(*)::int AS c FROM users')
    return { provisioned: true, hasAdmin: r.rows[0].c > 0 }
  } catch (err) {
    return { provisioned: false, hasAdmin: false, error: String(err.message || err) }
  }
})

ipcMain.handle('setup:detectPostgres', async () => {
  const existing = await provision.detectExistingPostgres()
  const hasSavedPassword = await provision.hasSavedState()
  return { existing, hasSavedPassword }
})

ipcMain.handle('setup:runProvisioning', async (event, existingSuperuserPassword) => {
  try {
    const env = await provision.runProvisioning({
      existingSuperuserPassword: existingSuperuserPassword || undefined,
      onProgress: message => event.sender.send('setup:progress', message),
    })
    process.env.DATABASE_URL = env.DATABASE_URL
    process.env.JWT_SECRET = env.JWT_SECRET
    pool = null
    return { ok: true }
  } catch (err) {
    return { error: String(err.message || err) }
  }
})

// Only usable once: guarded by an empty users table, so it can't be used to add a second account
// after the initial setup wizard runs.
ipcMain.handle('auth:bootstrapAdmin', async (_e, username, password) => {
  username = String(username || '').trim()
  if (!username || !password) return { error: 'Въведете потребителско име и парола.' }
  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }
  const countRes = await p.query('SELECT count(*)::int AS c FROM users')
  if (countRes.rows[0].c > 0) return { error: 'Вече има създаден администратор.', alreadyExists: true }
  const hash = await bcrypt.hash(password, 10)
  const ins = await p.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, hash],
  )
  const token = jwt.sign({ sub: ins.rows[0].id, username: ins.rows[0].username }, getJwtSecret(), { expiresIn: '30d' })
  return { token, username: ins.rows[0].username }
})

ipcMain.handle('data:getAll', async (_e, token) => {
  if (!verifyToken(token)) return { error: 'Неоторизиран достъп.' }
  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }
  const out = {}
  for (const collection of COLLECTIONS) {
    const table = TABLE_BY_COLLECTION[collection]
    const result = await p.query(`SELECT id, data FROM ${table}`)
    out[collection] = result.rows.map(r => ({ ...r.data, id: r.id }))
  }
  return { data: out }
})

ipcMain.handle('data:setCollection', async (_e, token, collection, items) => {
  if (!verifyToken(token)) return { error: 'Неоторизиран достъп.' }
  const table = TABLE_BY_COLLECTION[collection]
  if (!table) return { error: `Непознат тип данни: ${collection}` }
  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }
  const client = await p.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM ${table}`)
    for (const item of items) {
      await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [String(item.id), item])
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    await client.query('ROLLBACK')
    return { error: String(err.message || err) }
  } finally {
    client.release()
  }
})

ipcMain.handle('file:save', async (event, filename, base64Data) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, { defaultPath: filename })
  if (result.canceled || !result.filePath) return { canceled: true }
  await fs.writeFile(result.filePath, Buffer.from(base64Data, 'base64'))
  return { canceled: false, filePath: result.filePath }
})

// Opens a document in the user's default app for its file type (Word for .docx) — used so
// "Принтирай" shows/prints the exact same generated document as "Изтегли", instead of a separate
// print-only HTML rendering that can drift out of sync with the real .docx.
ipcMain.handle('file:openTemp', async (_e, filename, base64Data) => {
  const tempPath = path.join(os.tmpdir(), `napoyavane-${Date.now()}-${filename}`)
  await fs.writeFile(tempPath, Buffer.from(base64Data, 'base64'))
  const error = await shell.openPath(tempPath)
  return error ? { error } : { ok: true }
})

function defaultBackupFolder() {
  return path.join(app.getPath('documents'), 'Напояване ХТР Ямбол - Архив')
}

ipcMain.handle('backup:pickFolder', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  return { canceled: false, folderPath: result.filePaths[0] }
})

// Writes straight to disk (no save dialog) so the daily auto-backup can run silently, always
// overwriting the same filename — that's the point of an unattended backup.
ipcMain.handle('backup:writeAuto', async (_e, folderPath, base64Data) => {
  try {
    const dir = folderPath || defaultBackupFolder()
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, 'napoyavane-avtomatichen-arhiv.json')
    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'))
    return { ok: true, filePath }
  } catch (err) {
    return { error: String(err.message || err) }
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '..', 'build-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('did-fail-load', errorCode, errorDescription, validatedURL)
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[renderer]', level, message, `${sourceId}:${line}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('render-process-gone', details)
  })

  const devUrl = process.env.ELECTRON_START_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
