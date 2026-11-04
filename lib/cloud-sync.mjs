import fs from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from './paths.mjs'
import { readSettings, writeSettings } from './settings.mjs'
import { getCustomAssets, saveMascot, saveSounds, removeMascot, removeSounds, saveStateMascot, removeStateMascot } from './custom-assets.mjs'

const sessionFile = path.join(dataDir, 'cloud-session.json')
const defaultServer = process.env.KIMI_SYMPHONY_CLOUD_URL || 'https://app.kimi-symphony.workers.dev'
let syncInFlight = null

async function readSession() {
  try {
    return JSON.parse(await fs.readFile(sessionFile, 'utf8'))
  } catch {
    return null
  }
}

async function writeSession(session) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(sessionFile, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 })
}

function publicStatus(session) {
  return {
    loggedIn: Boolean(session?.token),
    user: session?.user || null,
    server: session?.server || defaultServer,
    revision: session?.revision || 0,
    lastSync: session?.lastSync || null,
    lastError: session?.lastError || null,
  }
}

export async function cloudStatus() {
  return publicStatus(await readSession())
}

async function api(session, path, options = {}) {
  const response = await fetch(`${session.server}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const error = new Error(data.error || `云同步请求失败（HTTP ${response.status}）`)
    error.status = response.status
    throw error
  }
  return response
}

async function migrateLocalConfiguration(session) {
  const remote = await (await api(session, '/api/sync')).json()
  if (remote.revision !== 1 || remote.mascotUrl || remote.workingImageUrl || remote.completedImageUrl || remote.customSounds) return
  const local = await readSettings()
  await api(session, '/api/settings', { method: 'PUT', body: JSON.stringify(local) })
  const custom = await getCustomAssets(true)
  if (custom.mascot) await api(session, '/api/assets/mascot', { method: 'POST', body: JSON.stringify({ dataUrl: custom.mascot.value }) })
  for (const kind of ['working', 'completed']) {
    if (custom[kind]) await api(session, `/api/assets/${kind}`, { method: 'POST', body: JSON.stringify({ dataUrl: custom[kind].value }) })
  }
  if (custom.sounds) await api(session, '/api/assets/sounds', { method: 'POST', body: JSON.stringify(custom.sounds) })
}

export async function cloudLogin(username, password) {
  const session = { server: defaultServer, revision: 0 }
  const response = await api(session, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  const result = await response.json()
  const next = {
    ...session,
    token: result.token,
    user: result.user,
    expiresAt: result.expiresAt,
    lastSync: null,
    lastError: null,
  }
  await writeSession(next)
  try {
    await migrateLocalConfiguration(next)
  } catch (error) {
    await fs.unlink(sessionFile).catch(() => {})
    throw new Error(`本机配置迁移失败：${error.message}`)
  }
  return cloudSync()
}

export async function cloudLogout() {
  const session = await readSession()
  if (session?.token) await api(session, '/api/auth/logout', { method: 'POST' }).catch(() => {})
  await fs.unlink(sessionFile).catch(() => {})
  return { loggedIn: false }
}

async function downloadAsset(session, url) {
  const response = await api(session, url)
  const mime = response.headers.get('content-type') || 'application/octet-stream'
  const bytes = Buffer.from(await response.arrayBuffer())
  return `data:${mime};base64,${bytes.toString('base64')}`
}

async function syncAssets(session, remote) {
  if (remote.mascotUrl) await saveMascot(await downloadAsset(session, remote.mascotUrl))
  else await removeMascot()
  for (const [key, url] of [['working', remote.workingImageUrl], ['completed', remote.completedImageUrl]]) {
    if (url) await saveStateMascot(key, await downloadAsset(session, url))
    else await removeStateMascot(key)
  }
  if (remote.customSounds) {
    const press = await downloadAsset(session, remote.customSounds.press)
    const release = await downloadAsset(session, remote.customSounds.release)
    await saveSounds(press, release)
  } else {
    await removeSounds()
  }
}

async function performSync() {
  const session = await readSession()
  if (!session?.token) return { loggedIn: false }
  try {
    const response = await api(session, '/api/sync')
    const remote = await response.json()
    if (remote.revision === session.revision) return publicStatus({ ...session, lastError: null })
    const local = await readSettings()
    await syncAssets(session, remote)
    await writeSettings({
      ...remote.settings,
      position: local.position,
      bubbleVisible: local.bubbleVisible,
      autoStart: local.autoStart,
      alwaysOnTop: local.alwaysOnTop,
    })
    const next = { ...session, revision: remote.revision, lastSync: new Date().toISOString(), lastError: null }
    await writeSession(next)
    return publicStatus(next)
  } catch (error) {
    if (error.status === 401) {
      await fs.unlink(sessionFile).catch(() => {})
      return { loggedIn: false, lastError: '登录已失效，请重新登录' }
    }
    const next = { ...session, lastError: error.message }
    await writeSession(next)
    return publicStatus(next)
  }
}

export function cloudSync() {
  if (!syncInFlight) syncInFlight = performSync().finally(() => { syncInFlight = null })
  return syncInFlight
}
