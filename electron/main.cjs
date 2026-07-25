const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
// In a packaged build, extraResources puts .env next to the app (resourcesPath), not inside the
// asar alongside this file — in dev it sits one level up from electron/.
const envPath = app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(__dirname, '..', '.env')
require('dotenv').config({ path: envPath, quiet: true })

const JWT_SECRET = process.env.JWT_SECRET
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

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
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// No auth:register handler: new accounts are created directly in the database, never through the
// app UI, so nobody can self-register without the owner's explicit action.
ipcMain.handle('auth:login', async (_e, username, password) => {
  username = String(username || '').trim()
  const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username])
  const user = result.rows[0]
  if (!user) return { error: 'Грешно потребителско име или парола.' }
  const ok = await bcrypt.compare(String(password || ''), user.password_hash)
  if (!ok) return { error: 'Грешно потребителско име или парола.' }
  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  return { token, username: user.username }
})

ipcMain.handle('auth:verify', async (_e, token) => {
  const payload = verifyToken(token)
  if (!payload) return null
  return { username: payload.username }
})

ipcMain.handle('data:getAll', async (_e, token) => {
  if (!verifyToken(token)) return { error: 'Неоторизиран достъп.' }
  const out = {}
  for (const collection of COLLECTIONS) {
    const table = TABLE_BY_COLLECTION[collection]
    const result = await pool.query(`SELECT id, data FROM ${table}`)
    out[collection] = result.rows.map(r => ({ ...r.data, id: r.id }))
  }
  return { data: out }
})

ipcMain.handle('data:setCollection', async (_e, token, collection, items) => {
  if (!verifyToken(token)) return { error: 'Неоторизиран достъп.' }
  const table = TABLE_BY_COLLECTION[collection]
  if (!table) return { error: `Непознат тип данни: ${collection}` }
  const client = await pool.connect()
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
