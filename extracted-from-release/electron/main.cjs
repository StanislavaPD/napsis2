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
let configLoaded = false
function loadConfig() {
  if (configLoaded) return
  configLoaded = true

  // Load dev .env if it exists (development mode)
  if (fssync.existsSync(devEnvPath)) {
    require('dotenv').config({ path: devEnvPath, quiet: true })
    return
  }
  // Load user config if available (production mode after provisioning)
  try {
    const userConfigPath = provision.configPath()
    if (fssync.existsSync(userConfigPath)) {
      require('dotenv').config({ path: userConfigPath, quiet: true })
    }
  } catch (err) {
    // app.getPath() may not be ready yet, will retry later
  }
}
// Try to load config early
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

// Security logging helper
function logSecurityEvent(event, details) {
  const timestamp = new Date().toISOString()
  const logEntry = `[SECURITY] ${timestamp} - ${event}: ${JSON.stringify(details)}`
  console.log(logEntry)
  // TODO: В production, записвайте в persistent log file
}

// Generic error handler - скрива детайли от потребителя, но ги логва
function safeError(context, err, userMessage = 'Възникна техническа грешка.') {
  console.error(`[ERROR] ${context}:`, err)
  logSecurityEvent('ERROR', { context, error: err.message || String(err) })
  return { error: userMessage }
}

// Rate limiting tracker
const loginAttempts = new Map() // username -> { count, lastAttempt }
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000, // 15 минути
  LOCKOUT_MS: 30 * 60 * 1000, // 30 минути lockout след MAX_ATTEMPTS
}

function checkRateLimit(username) {
  const now = Date.now()
  const attempts = loginAttempts.get(username)

  if (!attempts) {
    loginAttempts.set(username, { count: 1, lastAttempt: now, lockedUntil: null })
    return { allowed: true }
  }

  // Проверка за активен lockout
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingMinutes = Math.ceil((attempts.lockedUntil - now) / 60000)
    return {
      allowed: false,
      message: `Твърде много опити за вход. Опитайте отново след ${remainingMinutes} минути.`
    }
  }

  // Reset ако прозорецът е изтекъл
  if (now - attempts.lastAttempt > RATE_LIMIT.WINDOW_MS) {
    loginAttempts.set(username, { count: 1, lastAttempt: now, lockedUntil: null })
    return { allowed: true }
  }

  // Увеличаване на брояча
  attempts.count++
  attempts.lastAttempt = now

  if (attempts.count >= RATE_LIMIT.MAX_ATTEMPTS) {
    attempts.lockedUntil = now + RATE_LIMIT.LOCKOUT_MS
    logSecurityEvent('RATE_LIMIT_EXCEEDED', { username, attempts: attempts.count })
    return {
      allowed: false,
      message: `Твърде много неуспешни опити за вход. Акаунтът е временно блокиран за ${RATE_LIMIT.LOCKOUT_MS / 60000} минути.`
    }
  }

  return { allowed: true }
}

function resetRateLimit(username) {
  loginAttempts.delete(username)
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

  // Rate limiting check
  const rateLimitCheck = checkRateLimit(username)
  if (!rateLimitCheck.allowed) {
    logSecurityEvent('LOGIN_RATE_LIMITED', { username })
    return { error: rateLimitCheck.message }
  }

  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }

  try {
    const result = await p.query('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username])
    const user = result.rows[0]

    if (!user) {
      logSecurityEvent('LOGIN_FAILED_USER_NOT_FOUND', { username })
      return { error: 'Грешно потребителско име или парола.' }
    }

    const ok = await bcrypt.compare(String(password || ''), user.password_hash)
    if (!ok) {
      logSecurityEvent('LOGIN_FAILED_WRONG_PASSWORD', { username })
      return { error: 'Грешно потребителско име или парола.' }
    }

    // Успешен login - reset rate limit
    resetRateLimit(username)
    logSecurityEvent('LOGIN_SUCCESS', { username, role: user.role })

    const token = jwt.sign({ sub: user.id, username: user.username }, getJwtSecret(), { expiresIn: '30d' })
    return { token, username: user.username, role: user.role || 'operator' }
  } catch (err) {
    return safeError('auth:login', err, 'Грешка при вход в системата.')
  }
})

ipcMain.handle('auth:verify', async (_e, token) => {
  const payload = verifyToken(token)
  if (!payload) return null

  // Зареди ролята от базата данни
  const p = getPool()
  if (!p) return null

  try {
    const result = await p.query('SELECT role FROM users WHERE username = $1', [payload.username])
    if (result.rows.length === 0) return null
    return { username: payload.username, role: result.rows[0].role }
  } catch (err) {
    console.error('Error verifying token:', err)
    return null
  }
})

ipcMain.handle('auth:createUser', async (_e, adminToken, username, password) => {
  // Verify admin token
  const payload = verifyToken(adminToken)
  if (!payload) return { error: 'Невалиден токен.' }

  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }

  try {
    // Check if requester is admin
    const adminCheck = await p.query('SELECT role FROM users WHERE username = $1', [payload.username])
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      logSecurityEvent('CREATE_USER_DENIED_NOT_ADMIN', { requester: payload.username, targetUser: username })
      return { error: 'Само администратори могат да създават нови акаунти.' }
    }

    // Check if username already exists
    const existingUser = await p.query('SELECT id FROM users WHERE username = $1', [username])
    if (existingUser.rows.length > 0) {
      return { error: 'Потребителското име вече съществува.' }
    }

    // Create new user with operator role
    const hash = await bcrypt.hash(password, 10)
    const ins = await p.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, 'operator'],
    )

    logSecurityEvent('USER_CREATED', { createdBy: payload.username, newUser: username, role: 'operator' })

    return { username: ins.rows[0].username, role: ins.rows[0].role }
  } catch (err) {
    return safeError('auth:createUser', err, 'Създаването на акаунт не завърши успешно.')
  }
})

ipcMain.handle('setup:status', async () => {
  const p = getPool()
  if (!p) return { provisioned: false, hasAdmin: false }
  try {
    const r = await p.query('SELECT count(*)::int AS c FROM users')
    return { provisioned: true, hasAdmin: r.rows[0].c > 0 }
  } catch (err) {
    return { ...safeError('setup:status', err, 'Базата данни не може да бъде проверена.'), provisioned: false, hasAdmin: false }
  }
})

ipcMain.handle('setup:detectPostgres', async () => {
  const existing = await provision.detectExistingPostgres()
  const hasSavedPassword = await provision.hasSavedState()
  return { existing, hasSavedPassword }
})

ipcMain.handle('setup:runProvisioning', async (event, existingSuperuserPassword) => {
  try {
    logSecurityEvent('PROVISIONING_STARTED', { hasExistingPassword: !!existingSuperuserPassword })
    const env = await provision.runProvisioning({
      existingSuperuserPassword: existingSuperuserPassword || undefined,
      onProgress: message => event.sender.send('setup:progress', message),
    })
    process.env.DATABASE_URL = env.DATABASE_URL
    process.env.JWT_SECRET = env.JWT_SECRET
    pool = null
    logSecurityEvent('PROVISIONING_COMPLETED', {})
    return { ok: true }
  } catch (err) {
    return safeError('setup:runProvisioning', err, 'Настройката на базата данни не завърши успешно.')
  }
})

// Only usable once: guarded by an empty users table, so it can't be used to add a second account
// after the initial setup wizard runs.
ipcMain.handle('auth:bootstrapAdmin', async (_e, username, password) => {
  username = String(username || '').trim()
  if (!username || !password) return { error: 'Въведете потребителско име и парола.' }
  const p = getPool()
  if (!p) return { error: 'Базата данни не е настроена.' }

  try {
    const countRes = await p.query('SELECT count(*)::int AS c FROM users')
    if (countRes.rows[0].c > 0) {
      logSecurityEvent('BOOTSTRAP_ADMIN_REJECTED_EXISTS', { username })
      return { error: 'Вече има създаден администратор.', alreadyExists: true }
    }

    const hash = await bcrypt.hash(password, 10)
    const ins = await p.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, 'admin'],
    )

    logSecurityEvent('BOOTSTRAP_ADMIN_CREATED', { username, role: 'admin' })

    const token = jwt.sign({ sub: ins.rows[0].id, username: ins.rows[0].username }, getJwtSecret(), { expiresIn: '30d' })
    return { token, username: ins.rows[0].username, role: ins.rows[0].role }
  } catch (err) {
    return safeError('auth:bootstrapAdmin', err, 'Създаването на администратор не завърши успешно.')
  }
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
  const payload = verifyToken(token)
  if (!payload) return { error: 'Неоторизиран достъп.' }

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

    logSecurityEvent('DATA_COLLECTION_UPDATED', {
      username: payload.username,
      collection,
      itemCount: items.length
    })

    return { ok: true }
  } catch (err) {
    await client.query('ROLLBACK')
    return safeError('data:setCollection', err, 'Данните не могат да бъдат записани.')
  } finally {
    client.release()
  }
})

ipcMain.handle('file:save', async (event, filename, base64Data) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win, { defaultPath: filename })
    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.writeFile(result.filePath, Buffer.from(base64Data, 'base64'))
    logSecurityEvent('FILE_SAVED', { filename, path: result.filePath })
    return { canceled: false, filePath: result.filePath }
  } catch (err) {
    return safeError('file:save', err, 'Файлът не може да бъде записан.')
  }
})

// Opens a document in the user's default app for its file type (Word for .docx) — used so
// "Принтирай" shows/prints the exact same generated document as "Изтегли", instead of a separate
// print-only HTML rendering that can drift out of sync with the real .docx.
ipcMain.handle('file:openTemp', async (_e, filename, base64Data) => {
  try {
    const safeFilename = path.basename(String(filename || 'document.docx')).replace(/[^\w. -]/g, '_')
    const tempPath = path.join(os.tmpdir(), `napoyavane-${Date.now()}-${safeFilename}`)
    await fs.writeFile(tempPath, Buffer.from(base64Data, 'base64'))
    const error = await shell.openPath(tempPath)
    if (error) {
      return safeError('file:openTemp', new Error(error), 'Файлът не може да бъде отворен.')
    }
    logSecurityEvent('FILE_OPENED', { filename: safeFilename })
    return { ok: true }
  } catch (err) {
    return safeError('file:openTemp', err, 'Файлът не може да бъде отворен.')
  }
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
    logSecurityEvent('BACKUP_CREATED', { path: filePath })
    return { ok: true, filePath }
  } catch (err) {
    return safeError('backup:writeAuto', err, 'Архивът не може да бъде записан.')
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

app.whenReady().then(() => {
  loadConfig() // Ensure config is loaded after app is ready
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
