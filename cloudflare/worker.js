import packageJson from '../package.json'
import releaseConfig from '../release.config.json'
import { AccountStore, DEFAULT_MESSAGES } from './account-store.js'

export { AccountStore }

const repository = releaseConfig.repository
const releaseUrl = `https://github.com/${repository}/releases/latest`

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function projectInfo() {
  return {
    name: 'Kimi 星律挂件',
    version: packageJson.version,
    repository: `https://github.com/${repository}`,
    releaseUrl,
    downloads: {
      windows: releaseConfig.windowsAsset ? `${releaseUrl}/download/${releaseConfig.windowsAsset}` : '',
    },
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
  const response = await fetch(releaseUrl, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Kimi-Symphony-Widget' },
  })
  if (response.status === 404) return json({ ...projectInfo(), latestVersion: null, updateAvailable: false, message: '尚未发布 Release' })
  const location = response.headers.get('location')
  if (location && [301, 302, 303, 307, 308].includes(response.status)) {
    const latestVersion = decodeURIComponent(location.split('/').filter(Boolean).pop()).replace(/^v/, '')
    return json({
      ...projectInfo(),
      latestVersion,
      releaseUrl: location,
      updateAvailable: Boolean(latestVersion) && compareVersions(latestVersion, packageJson.version) > 0,
      publishedAt: null,
    })
  }
  return json({ error: `检查更新失败（HTTP ${response.status}）` }, response.status)
}

export class AnnouncementStore {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    if (request.method === 'GET') {
      const value = await this.state.storage.get('announcement')
      return json(value || { text: '欢迎来到 Kimi 星律挂件公共主页。', updatedAt: null })
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)
    if (!this.env.ANNOUNCEMENT_KEY) return json({ error: '公告编辑尚未配置' }, 503)
    const input = await request.json()
    if (input.key !== this.env.ANNOUNCEMENT_KEY) return json({ error: '公告板密钥错误' }, 401)
    const value = {
      text: String(input.text || '').trim().slice(0, 2000),
      updatedAt: new Date().toISOString(),
    }
    await this.state.storage.put('announcement', value)
    return json(value)
  }
}

function secured(response) {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  return new Response(response.body, { status: response.status, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true, version: packageJson.version })
    if (url.pathname === '/api/project' && request.method === 'GET') return json(projectInfo())
    if (url.pathname === '/api/update/check' && request.method === 'GET') return checkUpdate()
    if (url.pathname === '/api/defaults' && request.method === 'GET') return json({ bubbleMessages: DEFAULT_MESSAGES })
    if (url.pathname.startsWith('/api/auth/') || ['/api/state', '/api/sync', '/api/settings'].includes(url.pathname) || url.pathname.startsWith('/api/assets/')) {
      const store = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts'))
      return store.fetch(request)
    }
    if (url.pathname === '/api/announcement') {
      const store = env.ANNOUNCEMENT.get(env.ANNOUNCEMENT.idFromName('global'))
      return store.fetch(request)
    }
    return secured(await env.ASSETS.fetch(request))
  },
}
