const fs = require('node:fs/promises')
const path = require('node:path')
const { CloudBaseState } = require('./cloudbase-state.js')
const packageJson = require('./app-package.json')
const releaseConfig = require('./release.config.json')

const repository = releaseConfig.repository
const releaseUrl = `https://github.com/${repository}/releases/latest`
const state = new CloudBaseState()
let accountStore
let announcementStore
let defaultMessages

function json(value, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(value),
    isBase64Encoded: false,
  }
}

function projectInfo() {
  return {
    name: 'Kimi 星律挂件',
    version: packageJson.version,
    repository: `https://github.com/${repository}`,
    releaseUrl,
    downloads: { windows: releaseConfig.windowsAsset ? `${releaseUrl}/download/${releaseConfig.windowsAsset}` : '' },
    configUrl: '/config',
    references: [
      { label: '交互参考：dsh-whale-widget', url: 'https://github.com/NieRMHY/dsh-whale-widget' },
      { label: '常态形象来源：zcode-fox-widget', url: 'https://github.com/pigeon189/zcode-fox-widget' },
      { label: '素材与许可说明', url: `https://github.com/${repository}/blob/main/NOTICE` },
    ],
  }
}

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/, '').split(/[.-]/).slice(0, 3).map(part => Number(part) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

async function checkUpdate() {
  const response = await fetch(releaseUrl, { redirect: 'manual', headers: { 'User-Agent': 'Kimi-Symphony-Widget' } })
  if (response.status === 404) return json({ ...projectInfo(), latestVersion: null, updateAvailable: false, message: '尚未发布 Release' })
  const location = response.headers.get('location')
  if (location && [301, 302, 303, 307, 308].includes(response.status)) {
    const latestVersion = decodeURIComponent(location.split('/').filter(Boolean).pop()).replace(/^v/, '')
    return json({ ...projectInfo(), latestVersion, releaseUrl: location, updateAvailable: compareVersions(latestVersion, packageJson.version) > 0, publishedAt: null })
  }
  return json({ error: `检查更新失败（HTTP ${response.status}）` }, response.status)
}

class AnnouncementStore {
  constructor(storage) {
    this.storage = storage
  }

  async fetch(request) {
    if (request.method === 'GET') {
      const value = await this.storage.get('announcement')
      return new Response(JSON.stringify(value || { text: '欢迎来到 Kimi 星律挂件公共主页。', updatedAt: null }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    }
    if (request.method !== 'PUT') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    if (!process.env.ANNOUNCEMENT_KEY) return new Response(JSON.stringify({ error: '公告编辑尚未配置' }), { status: 503 })
    const input = await request.json()
    if (input.key !== process.env.ANNOUNCEMENT_KEY) return new Response(JSON.stringify({ error: '公告板密钥错误' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    const value = { text: String(input.text || '').trim().slice(0, 2000), updatedAt: new Date().toISOString() }
    await this.storage.put('announcement', value)
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
}

async function stores() {
  if (!accountStore) {
    const { AccountStore, DEFAULT_MESSAGES } = await import('./account-store.mjs')
    accountStore = new AccountStore(state)
    announcementStore = new AnnouncementStore(state.storage)
    defaultMessages = DEFAULT_MESSAGES
  }
  return { accountStore, announcementStore, defaultMessages }
}

function requestFromEvent(event) {
  const method = event.httpMethod || event.method || 'GET'
  const headers = new Headers(event.headers || {})
  const rawPath = event.path || event.requestPath || '/'
  const apiIndex = rawPath.indexOf('/api/')
  const pathname = apiIndex >= 0 ? rawPath.slice(apiIndex) : rawPath
  const query = event.queryStringParameters ? `?${new URLSearchParams(event.queryStringParameters)}` : ''
  const init = { method, headers }
  if (!['GET', 'HEAD'].includes(method) && event.body) {
    init.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body
  }
  return new Request(`https://cloudbase.local${pathname}${query}`, init)
}

async function gatewayResponse(response) {
  const buffer = Buffer.from(await response.arrayBuffer())
  const headers = {}
  response.headers.forEach((value, key) => { headers[key] = value })
  const type = response.headers.get('content-type') || ''
  const binary = !type.includes('json') && !type.includes('text') && !type.includes('javascript') && !type.includes('svg')
  return {
    statusCode: response.status,
    headers,
    body: binary ? buffer.toString('base64') : buffer.toString('utf8'),
    isBase64Encoded: binary,
  }
}

function uploadKey(username, uploadId, index) {
  return `upload:${username}:${uploadId}:${index}`
}

async function readChunks(username, uploadId, total) {
  let text = ''
  for (let index = 0; index < total; index += 1) {
    const chunk = await state.storage.get(uploadKey(username, uploadId, index))
    if (typeof chunk !== 'string') throw new Error('上传分块不完整，请重试')
    text += chunk
  }
  return text
}

async function clearChunks(username, uploadId, total) {
  for (let index = 0; index < total; index += 1) await state.storage.delete(uploadKey(username, uploadId, index))
}

async function chunkedAsset(request, accountStore) {
  const user = await accountStore.requireUser(request)
  const input = await request.json()
  const uploadId = String(input.uploadId || '')
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uploadId)) return json({ error: '上传标识无效' }, 400)
  if (input.finalize) {
    const kind = String(input.kind || '')
    if (kind === 'sounds') {
      const releaseId = String(input.releaseId || '')
      const total = Number(input.total)
      const releaseTotal = Number(input.releaseTotal)
      const press = await readChunks(user.username, uploadId, total)
      const release = await readChunks(user.username, releaseId, releaseTotal)
      const next = new Request(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ press, release }) })
      const response = await accountStore.handleAsset(next, user, 'press')
      await clearChunks(user.username, uploadId, total)
      await clearChunks(user.username, releaseId, releaseTotal)
      return gatewayResponse(response)
    }
    const total = Number(input.total)
    const dataUrl = await readChunks(user.username, uploadId, total)
    const next = new Request(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) })
    const response = await accountStore.handleAsset(next, user, kind)
    await clearChunks(user.username, uploadId, total)
    return gatewayResponse(response)
  }
  const total = Number(input.total)
  const index = Number(input.index)
  if (!Number.isInteger(total) || total < 1 || total > 128 || !Number.isInteger(index) || index < 0 || index >= total) return json({ error: '上传分块编号无效' }, 400)
  const data = String(input.data || '')
  if (!data || data.length > 60000) return json({ error: '上传分块大小无效' }, 400)
  await state.storage.put(uploadKey(user.username, uploadId, index), data)
  return json({ ok: true, index, total })
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.wav': 'audio/wav',
}

async function staticFile(pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  if (relative === 'kimi') relative = 'index.html'
  if (relative === 'config' || relative === 'config/') relative = 'config/index.html'
  const root = path.resolve(__dirname, 'public')
  const file = path.resolve(root, relative)
  if (!file.startsWith(`${root}${path.sep}`)) return json({ error: 'Not found' }, 404)
  try {
    const content = await fs.readFile(file)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
      body: content.toString('base64'),
      isBase64Encoded: true,
    }
  } catch {
    return json({ error: 'Not found' }, 404)
  }
}

exports.main = async event => {
  try {
    const request = requestFromEvent(event)
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true, version: packageJson.version, provider: 'cloudbase' })
    if (url.pathname === '/api/project' && request.method === 'GET') return json(projectInfo())
    if (url.pathname === '/api/update/check' && request.method === 'GET') return checkUpdate()
    const storesReady = await stores()
    if (url.pathname === '/api/defaults' && request.method === 'GET') return json({ bubbleMessages: storesReady.defaultMessages })
    if (url.pathname === '/api/announcement') return gatewayResponse(await storesReady.announcementStore.fetch(request))
    if (url.pathname === '/api/assets/chunk' && request.method === 'POST') return chunkedAsset(request, storesReady.accountStore)
    if (url.pathname.startsWith('/api/auth/') || ['/api/state', '/api/sync', '/api/settings'].includes(url.pathname) || url.pathname.startsWith('/api/assets/')) {
      return gatewayResponse(await storesReady.accountStore.fetch(request))
    }
    return staticFile(url.pathname)
  } catch (error) {
    console.error(error)
    return json({ error: error.message || '服务器内部错误' }, 500)
  }
}
