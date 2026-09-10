#!/usr/bin/env node
// Downloads (once, cached in vendor/) the official PostgreSQL Windows installer used to bundle
// into the app's installer via electron-builder extraResources, so that on the target machine the
// first-run setup wizard can provision a local PostgreSQL fully offline.
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const crypto = require('node:crypto')

const VERSION = '16.6-1'
const URL = `https://get.enterprisedb.com/postgresql/postgresql-${VERSION}-windows-x64.exe`
// Pinned from the file's own S3 metadata (x-amz-meta-s3cmd-attrs) — verified against the URL above.
const EXPECTED_MD5 = '29fec854f615bddad03dc6f7a8839c33'
const OUT_DIR = path.join(__dirname, '..', 'vendor')
const OUT_FILE = path.join(OUT_DIR, 'postgresql-installer.exe')

function md5File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Твърде много пренасочвания при сваляне.'))
    const file = fs.createWriteStream(dest)
    https
      .get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlink(dest, () => {})
          resolve(download(res.headers.location, dest, redirects + 1))
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(dest, () => {})
          reject(new Error(`Неуспешно сваляне: HTTP ${res.statusCode}`))
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        res.on('data', chunk => {
          received += chunk.length
          if (total) process.stdout.write(`\rСваляне на PostgreSQL инсталатор… ${(received / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB`)
        })
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          process.stdout.write('\n')
          resolve()
        })
      })
      .on('error', err => {
        fs.unlink(dest, () => {})
        reject(err)
      })
  })
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (fs.existsSync(OUT_FILE)) {
    const md5 = await md5File(OUT_FILE)
    if (md5 === EXPECTED_MD5) {
      console.log('PostgreSQL инсталаторът вече е свален и проверен:', OUT_FILE)
      return
    }
    console.warn('Съществуващият файл има грешен checksum, свалям наново…')
    fs.unlinkSync(OUT_FILE)
  }
  console.log('Сваляне на PostgreSQL', VERSION, 'от', URL)
  await download(URL, OUT_FILE)
  const md5 = await md5File(OUT_FILE)
  if (md5 !== EXPECTED_MD5) {
    fs.unlinkSync(OUT_FILE)
    throw new Error(`Checksum на свалените файл не съвпада (получено ${md5}, очаквано ${EXPECTED_MD5}). Файлът е изтрит.`)
  }
  console.log('Готово (checksum проверен):', OUT_FILE)
}

main().catch(err => {
  console.error(err.message || err)
  process.exitCode = 1
})
