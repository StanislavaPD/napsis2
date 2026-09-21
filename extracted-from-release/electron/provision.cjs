// First-run provisioning: sets up a local PostgreSQL instance, database, role and tables so the
// app works right after installation without anyone manually running setup.sql or INSERTing a
// user. Each machine gets its own independent database (see design doc in
// docs/superpowers/specs/2026-07-27-self-provisioning-install-design.md).
const { app } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const fssync = require('node:fs')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { Client } = require('pg')

const DB_PORT = 5432
const DB_NAME = 'napoyavane'
const APP_ROLE = 'napoyavane_app'
const SUPERUSER = 'postgres'

// Generated secrets use only [A-Za-z0-9-_] (base64url) so they can be interpolated directly into
// SQL string literals with no escaping risk — PostgreSQL DDL (CREATE/ALTER ROLE) doesn't support
// parameterized queries the way DML does. Never starts with '-': some values (e.g. the superuser
// password) get passed as an unattended-installer CLI argument, and a leading dash risks being
// parsed as another flag instead of the value.
function genSecret(bytes = 24) {
  let s = crypto.randomBytes(bytes).toString('base64url')
  while (s.startsWith('-')) s = crypto.randomBytes(bytes).toString('base64url')
  return s
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.env')
}

// Holds in-progress secrets between provisioning attempts. Written right after generation, before
// the risky elevated install step — so if the process is interrupted after Postgres actually got
// installed but before setup finished, a retry reuses the same superuser password instead of
// prompting for one that was only ever generated in memory and never shown to anyone. Cleared once
// setup completes.
function statePath() {
  return path.join(app.getPath('userData'), 'provision-state.json')
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8'))
  } catch {
    return null
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(statePath()), { recursive: true })
  await fs.writeFile(statePath(), JSON.stringify(state), 'utf8')
}

async function clearState() {
  await fs.rm(statePath(), { force: true })
}

async function hasSavedState() {
  return !!(await loadState())?.superuserPassword
}

function installerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'postgresql-installer.exe')
    : path.join(__dirname, '..', 'vendor', 'postgresql-installer.exe')
}

function probePort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let done = false
    const finish = ok => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function detectExistingPostgres() {
  return probePort(DB_PORT)
}

async function waitForPort(port, attempts = 20, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    if (await probePort(port, '127.0.0.1', 1500)) return true
    await new Promise(r => setTimeout(r, delayMs))
  }
  return false
}

// Runs an executable elevated (triggers a single UAC prompt) via PowerShell's Start-Process
// -Verb RunAs, and propagates the elevated process's own exit code back out. Standard handles
// can't be redirected together with -Verb RunAs, so real diagnostics have to come from a log file
// the child process writes itself (see --debugtrace below).
function runElevated(exePath, args) {
  return new Promise((resolve, reject) => {
    const quotedArgs = args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',')
    const quotedExe = exePath.replace(/'/g, "''")
    const command = `$p = Start-Process -FilePath '${quotedExe}' -ArgumentList ${quotedArgs} -Verb RunAs -Wait -PassThru; exit $p.ExitCode`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: false })
    let stderr = ''
    child.stderr.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else {
        const err = new Error(stderr.trim() || `PowerShell завърши с код ${code}.`)
        err.exitCode = code
        reject(err)
      }
    })
  })
}

async function readTraceTail(traceFile, maxLines = 25) {
  try {
    const contents = await fs.readFile(traceFile, 'utf8')
    return contents.split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n')
  } catch {
    return null
  }
}

async function installPostgresSilently(superuserPassword, onProgress) {
  onProgress?.('Инсталиране на PostgreSQL (изисква администраторски права)…')
  const exe = installerPath()
  if (!fssync.existsSync(exe)) {
    throw new Error('Липсва вграденият PostgreSQL инсталатор в пакета на приложението.')
  }
  const traceFile = path.join(os.tmpdir(), `napoyavane-pg-install-${Date.now()}.log`)
  const args = [
    '--mode', 'unattended',
    '--unattendedmodeui', 'minimal',
    '--debugtrace', traceFile,
    '--superpassword', superuserPassword,
    '--serverport', String(DB_PORT),
    '--disable-components', 'stackbuilder',
    // Skips the bundled Visual C++ Redistributable installer — the most common cause of the
    // unattended installer failing near the very end (exit code 1) when a newer/incompatible
    // version is already present on the machine. Any reasonably current Windows already has it.
    '--install_runtimes', '0',
  ]
  try {
    await runElevated(exe, args)
  } catch (err) {
    const tail = await readTraceTail(traceFile)
    const detail = tail ? `\n\nПоследни редове от лога на инсталатора:\n${tail}` : ''
    const code = err.exitCode !== undefined ? ` (код ${err.exitCode})` : ''
    throw new Error(`Инсталацията на PostgreSQL не завърши успешно${code}: ${err.message}${detail}`)
  }
  onProgress?.('PostgreSQL е инсталиран, изчакваме сървъра да стартира…')
  const up = await waitForPort(DB_PORT)
  if (!up) throw new Error('PostgreSQL не стартира навреме след инсталацията.')
}

async function provisionDatabase({ superuserPassword, appPassword, onProgress }) {
  onProgress?.('Настройка на роля и база данни…')
  const adminClient = new Client({ host: 'localhost', port: DB_PORT, user: SUPERUSER, password: superuserPassword, database: 'postgres' })
  await adminClient.connect()
  try {
    const roleCheck = await adminClient.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [APP_ROLE])
    if (roleCheck.rowCount === 0) {
      await adminClient.query(`CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${appPassword}'`)
    } else {
      await adminClient.query(`ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${appPassword}'`)
    }
    const dbCheck = await adminClient.query('SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1', [DB_NAME])
    if (dbCheck.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${DB_NAME} OWNER ${APP_ROLE}`)
    }
    await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${APP_ROLE}`)
  } finally {
    await adminClient.end()
  }

  onProgress?.('Създаване на таблици…')
  const dbClient = new Client({ host: 'localhost', port: DB_PORT, user: SUPERUSER, password: superuserPassword, database: DB_NAME })
  await dbClient.connect()
  try {
    await dbClient.query(`GRANT ALL ON SCHEMA public TO ${APP_ROLE}`)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator';
      CREATE TABLE IF NOT EXISTS contractors (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS htus (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS irrigation_methods (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS crops (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS acts (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
    `)
  } finally {
    await dbClient.end()
  }
}

async function writeConfig({ appPassword, jwtSecret }) {
  const url = `postgresql://${APP_ROLE}:${appPassword}@localhost:${DB_PORT}/${DB_NAME}`
  const contents = `DATABASE_URL=${url}\nJWT_SECRET=${jwtSecret}\n`
  await fs.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.writeFile(configPath(), contents, 'utf8')
  return { DATABASE_URL: url, JWT_SECRET: jwtSecret }
}

// Idempotent by nature: re-running after an interruption re-detects Postgres, and the SQL steps
// use IF NOT EXISTS / existence checks, so nothing is duplicated. Only reuses saved state for
// self-generated passwords (existingSuperuserPassword is a user-typed value for a pre-existing
// external Postgres, never persisted — a wrong manual entry should fail cleanly and re-prompt
// instead of being retried forever from state).
async function runProvisioning({ existingSuperuserPassword, onProgress } = {}) {
  const hasExisting = await detectExistingPostgres()
  const saved = existingSuperuserPassword ? null : await loadState()

  const superuserPassword = existingSuperuserPassword || saved?.superuserPassword || genSecret(18)
  const appPassword = saved?.appPassword || genSecret(18)
  const jwtSecret = saved?.jwtSecret || genSecret(32)

  if (!existingSuperuserPassword) {
    await saveState({ superuserPassword, appPassword, jwtSecret })
  }

  if (!hasExisting) {
    await installPostgresSilently(superuserPassword, onProgress)
  } else {
    onProgress?.('Открит е вече работещ PostgreSQL сървър.')
  }

  await provisionDatabase({ superuserPassword, appPassword, onProgress })

  const env = await writeConfig({ appPassword, jwtSecret })
  await clearState()
  onProgress?.('Готово.')
  return env
}

module.exports = { detectExistingPostgres, hasSavedState, runProvisioning, configPath }
