const DEFAULT_MESSAGES = [
  '点我看看用量',
  'Kimi 来啦，接下来交给我吧',
  '今天也要一起加油呀~',
  '要不要先喝口水？',
  '代码交给我，你去休息一下',
  '星海那么大，一起去看看吧',
  '今天的 Token 也要精打细算',
  '我会一直陪着你的',
  '好模型... ↓',
  '好女孩... ↓',
]

const DEFAULT_SETTINGS = {
  scale: 1,
  bubbleVisible: false,
  alwaysOnTop: true,
  autoStart: true,
  soundSet: 'chime',
  soundVolume: 0.7,
  bubbleMessages: DEFAULT_MESSAGES,
  bubbleTheme: 'compact',
  workingText: '别吵，在思考...',
  workingMessages: ['别吵，在思考...'],
  completedText: '完成...',
  shortcuts: {
    kimi: { label: '打开 Kimi', url: '', path: '' },
    'kimi-code': { label: '打开 Kimi Code', url: '', path: '' },
  },
  plugins: [],
  modules: { summary: true, appButtons: true, source: true, resetTime: true },
  position: null,
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

function bytesToBase64(bytes) {
  let text = ''
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return btoa(text)
}

function tokenHash(token) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)).then(bytesToBase64)
}

function requestToken(request) {
  const authorization = request.headers.get('Authorization') || ''
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim()
  const cookies = request.headers.get('Cookie') || ''
  const match = /(?:^|;\s*)kimi_session=([^;]+)/.exec(cookies)
  return match ? decodeURIComponent(match[1]) : ''
}

function sessionCookie(token, maxAge) {
  return `kimi_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function sanitizeMessages(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const messages = value.map(item => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 50)
  return messages.length ? messages : [...fallback]
}

function sanitizeUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function sanitizeSettings(input = {}) {
  const modules = input.modules && typeof input.modules === 'object' ? input.modules : {}
  const shortcuts = input.shortcuts && typeof input.shortcuts === 'object' ? input.shortcuts : {}
  const scale = Number(input.scale)
  const volume = Number(input.soundVolume)
  return {
    scale: Number.isFinite(scale) ? Math.min(1.35, Math.max(0.75, scale)) : 1,
    bubbleVisible: false,
    alwaysOnTop: input.alwaysOnTop !== false,
    autoStart: input.autoStart !== false,
    soundSet: ['chime', 'custom', 'mute'].includes(input.soundSet) ? input.soundSet : 'chime',
    soundVolume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.7,
    bubbleMessages: sanitizeMessages(input.bubbleMessages, DEFAULT_MESSAGES),
    bubbleTheme: ['nebula', 'compact', 'classic', 'minimal'].includes(input.bubbleTheme) ? input.bubbleTheme : 'compact',
    workingText: String(input.workingText || '别吵，在思考...').trim().slice(0, 80) || '别吵，在思考...',
    workingMessages: sanitizeMessages(input.workingMessages, ['别吵，在思考...']),
    completedText: String(input.completedText || '完成...').trim().slice(0, 80) || '完成...',
    shortcuts: Object.fromEntries(['kimi', 'kimi-code'].map(id => {
      const fallback = DEFAULT_SETTINGS.shortcuts[id]
      const item = shortcuts[id] && typeof shortcuts[id] === 'object' ? shortcuts[id] : {}
      return [id, {
        label: String(item.label || fallback.label).trim().slice(0, 30) || fallback.label,
        url: sanitizeUrl(item.url),
        path: String(item.path || '').trim().slice(0, 500),
      }]
    })),
    plugins: Array.isArray(input.plugins) ? input.plugins.slice(0, 20).map((item, index) => ({
      id: String(item.id || `plugin-${index + 1}`).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50),
      name: String(item.name || `插件 ${index + 1}`).trim().slice(0, 40),
      url: sanitizeUrl(item.url),
      enabled: item.enabled !== false,
    })).filter(item => item.url) : [],
    modules: {
      summary: modules.summary !== false,
      appButtons: modules.appButtons !== false,
      source: modules.source !== false,
      resetTime: modules.resetTime !== false,
    },
    position: null,
  }
}

function decodeDataUrl(dataUrl, kind) {
  const image = kind === 'image'
  const match = new RegExp(`^data:(${image ? 'image/(?:png|jpeg)' : 'audio/mpeg'});base64,([A-Za-z0-9+/=]+)$`).exec(String(dataUrl || ''))
  if (!match) throw new Error('文件格式或编码不受支持')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const maxBytes = image ? 3 * 1024 * 1024 : 2 * 1024 * 1024
  if (!bytes.length || bytes.length > maxBytes) throw new Error('文件大小超出限制')
  if (match[1] === 'image/png' && ![137, 80, 78, 71].every((value, index) => bytes[index] === value)) throw new Error('PNG 文件内容无效')
  if (match[1] === 'image/jpeg' && (bytes[0] !== 255 || bytes[1] !== 216)) throw new Error('JPEG 文件内容无效')
  return { mime: match[1], bytes }
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return new Uint8Array(bits)
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export class AccountStore {
  constructor(state) {
    this.state = state
  }

  async user(username) {
    return (await this.state.storage.get(`user:${username}`)) || null
  }

  async saveUser(user) {
    await this.state.storage.put(`user:${user.username}`, user)
  }

  async authenticatedUser(request) {
    const token = requestToken(request)
    if (!token) return null
    const session = await this.state.storage.get(`session:${await tokenHash(token)}`)
    if (!session || session.expiresAt <= Date.now()) return null
    return this.user(session.username)
  }

  async requireUser(request) {
    const user = await this.authenticatedUser(request)
    if (!user) throw Object.assign(new Error('请先登录'), { status: 401 })
    return user
  }

  async createSession(username) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
    await this.state.storage.put(`session:${await tokenHash(token)}`, { username, expiresAt })
    return { token, expiresAt }
  }

  async register(request) {
    const input = await request.json()
    const username = String(input.username || '').trim().toLowerCase()
    const password = String(input.password || '')
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: '用户名需为 3–24 位小写字母、数字或下划线' }, 400)
    if (password.length < 10 || password.length > 128) return json({ error: '密码长度需为 10–128 位' }, 400)
    if (await this.user(username)) return json({ error: '用户名已存在，请直接登录或更换用户名' }, 409)
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const user = {
      id: crypto.randomUUID(),
      username,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(await passwordHash(password, salt)),
      settings: structuredClone(DEFAULT_SETTINGS),
      revision: 1,
      failures: 0,
      lockedUntil: 0,
      createdAt: new Date().toISOString(),
    }
    await this.saveUser(user)
    const session = await this.createSession(username)
    return json({ user: { username }, token: session.token, expiresAt: session.expiresAt }, 201, { 'Set-Cookie': sessionCookie(session.token, 2592000) })
  }

  async login(request) {
    const input = await request.json()
    const username = String(input.username || '').trim().toLowerCase()
    const password = String(input.password || '')
    const user = await this.user(username)
    if (!user) return json({ error: '用户名或密码错误' }, 401)
    if (user.lockedUntil > Date.now()) return json({ error: '尝试次数过多，请稍后再试' }, 429)
    const actual = await passwordHash(password, new Uint8Array(atob(user.salt).split('').map(char => char.charCodeAt(0))))
    const expected = new Uint8Array(atob(user.hash).split('').map(char => char.charCodeAt(0)))
    if (!sameBytes(actual, expected)) {
      user.failures = (user.failures || 0) + 1
      if (user.failures >= 5) {
        user.lockedUntil = Date.now() + 5 * 60 * 1000
        user.failures = 0
      }
      await this.saveUser(user)
      return json({ error: '用户名或密码错误' }, 401)
    }
    user.failures = 0
    user.lockedUntil = 0
    await this.saveUser(user)
    const session = await this.createSession(username)
    return json({ user: { username }, token: session.token, expiresAt: session.expiresAt }, 200, { 'Set-Cookie': sessionCookie(session.token, 2592000) })
  }

  async logout(request) {
    const token = requestToken(request)
    if (token) await this.state.storage.delete(`session:${await tokenHash(token)}`)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
  }

  async touchRevision(user) {
    user.revision = (user.revision || 0) + 1
    await this.saveUser(user)
  }

  assetKey(username, kind) {
    return `asset:${username}:${kind}`
  }

  async assetInfo(username, kind) {
    return (await this.state.storage.get(`${this.assetKey(username, kind)}:meta`)) || null
  }

  async putAsset(username, kind, mime, bytes) {
    const previous = await this.assetInfo(username, kind)
    if (previous) await this.removeAsset(username, kind)
    const chunks = Math.ceil(bytes.length / 98304)
    const entries = { [`${this.assetKey(username, kind)}:meta`]: { mime, size: bytes.length, chunks } }
    for (let index = 0; index < chunks; index += 1) {
      entries[`${this.assetKey(username, kind)}:${index}`] = bytes.slice(index * 98304, (index + 1) * 98304)
    }
    await this.state.storage.put(entries)
  }

  async getAsset(username, kind) {
    const meta = await this.assetInfo(username, kind)
    if (!meta) return null
    const bytes = new Uint8Array(meta.size)
    for (let index = 0; index < meta.chunks; index += 1) {
      const chunk = await this.state.storage.get(`${this.assetKey(username, kind)}:${index}`)
      if (!chunk) throw new Error('素材数据不完整')
      bytes.set(new Uint8Array(chunk), index * 98304)
    }
    return { mime: meta.mime, bytes }
  }

  async removeAsset(username, kind) {
    const meta = await this.assetInfo(username, kind)
    if (!meta) return
    const keys = [`${this.assetKey(username, kind)}:meta`]
    for (let index = 0; index < meta.chunks; index += 1) keys.push(`${this.assetKey(username, kind)}:${index}`)
    await this.state.storage.delete(keys)
  }

  async snapshot(user) {
    const [mascot, working, completed, press, release] = await Promise.all([
      this.assetInfo(user.username, 'mascot'),
      this.assetInfo(user.username, 'working'),
      this.assetInfo(user.username, 'completed'),
      this.assetInfo(user.username, 'press'),
      this.assetInfo(user.username, 'release'),
    ])
    return {
      usage: null,
      settings: user.settings,
      mascotUrl: mascot ? '/api/assets/mascot' : null,
      workingImageUrl: working ? '/api/assets/working' : null,
      completedImageUrl: completed ? '/api/assets/completed' : null,
      customSounds: press && release ? { press: '/api/assets/sound/press', release: '/api/assets/sound/release' } : null,
      taskState: { state: 'normal', activeCount: 0 },
      revision: user.revision,
      desktop: false,
    }
  }

  async handleAsset(request, user, kind) {
    const key = kind === 'press' || kind === 'release' ? `sound/${kind}` : kind
    if (request.method === 'GET') {
      const asset = await this.getAsset(user.username, kind)
      if (!asset) return json({ error: '自定义素材不存在' }, 404)
      return new Response(asset.bytes, { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'private, no-store' } })
    }
    if (request.method === 'DELETE') {
      await this.removeAsset(user.username, kind)
      await this.touchRevision(user)
      return json({ ok: true, key })
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const input = await request.json()
    if (kind === 'press' || kind === 'release') {
      const first = decodeDataUrl(input.press, 'audio')
      const second = decodeDataUrl(input.release, 'audio')
      await this.putAsset(user.username, 'press', first.mime, first.bytes)
      await this.putAsset(user.username, 'release', second.mime, second.bytes)
    } else {
      const asset = decodeDataUrl(input.dataUrl, 'image')
      await this.putAsset(user.username, kind, asset.mime, asset.bytes)
    }
    await this.touchRevision(user)
    return json({ ok: true, key })
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/api/auth/register' && request.method === 'POST') return this.state.blockConcurrencyWhile(() => this.register(request))
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return this.login(request)
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return this.logout(request)
      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const user = await this.authenticatedUser(request)
        return user ? json({ user: { username: user.username }, revision: user.revision }) : json({ error: '未登录' }, 401)
      }
      const user = await this.requireUser(request)
      if (url.pathname === '/api/state' && request.method === 'GET') return json(await this.snapshot(user))
      if (url.pathname === '/api/sync' && request.method === 'GET') return json(await this.snapshot(user))
      if (url.pathname === '/api/settings') {
        if (request.method === 'GET') return json(user.settings)
        if (request.method === 'PUT') {
          user.settings = sanitizeSettings({ ...user.settings, ...await request.json() })
          await this.touchRevision(user)
          return json(user.settings)
        }
      }
      if (url.pathname === '/api/assets/mascot' || url.pathname === '/api/assets/working' || url.pathname === '/api/assets/completed') {
        return this.handleAsset(request, user, url.pathname.split('/').pop())
      }
      if (url.pathname === '/api/assets/sounds') {
        if (request.method === 'DELETE') {
          await this.removeAsset(user.username, 'press')
          await this.removeAsset(user.username, 'release')
          await this.touchRevision(user)
          return json({ ok: true })
        }
        return this.handleAsset(request, user, 'press')
      }
      if (url.pathname === '/api/assets/sound/press' || url.pathname === '/api/assets/sound/release') {
        return this.handleAsset(request, user, url.pathname.endsWith('press') ? 'press' : 'release')
      }
      return json({ error: 'Not found' }, 404)
    } catch (error) {
      return json({ error: error.message || '请求失败' }, error.status || 400)
    }
  }
}

export { DEFAULT_MESSAGES }
