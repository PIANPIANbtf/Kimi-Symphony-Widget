import fs from 'node:fs/promises'
import { dataDir, settingsFile } from './paths.mjs'

export const DEFAULT_MESSAGES = [
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

const defaults = {
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
  modules: {
    summary: true,
    appButtons: true,
    source: true,
    resetTime: true,
  },
  position: null,
}

export async function readSettings() {
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    return sanitizeSettings({ ...defaults, ...saved })
  } catch {
    return { ...defaults }
  }
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return [...DEFAULT_MESSAGES]
  const messages = value.map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 50)
  return messages.length ? messages : [...DEFAULT_MESSAGES]
}

function sanitizeWorkingMessages(value) {
  if (!Array.isArray(value)) return ['别吵，在思考...']
  const messages = value.map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 50)
  return messages.length ? messages : ['别吵，在思考...']
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

function sanitizeShortcuts(input) {
  const source = input && typeof input === 'object' ? input : {}
  const result = {}
  for (const id of ['kimi', 'kimi-code']) {
    const fallback = defaults.shortcuts[id]
    const item = source[id] && typeof source[id] === 'object' ? source[id] : {}
    result[id] = {
      label: String(item.label || fallback.label).trim().slice(0, 30) || fallback.label,
      url: sanitizeUrl(item.url),
      path: String(item.path || '').trim().slice(0, 500),
    }
  }
  return result
}

function sanitizePlugins(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((item, index) => ({
    id: String(item.id || `plugin-${index + 1}`).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50),
    name: String(item.name || `插件 ${index + 1}`).trim().slice(0, 40),
    url: sanitizeUrl(item.url),
    enabled: item.enabled !== false,
  })).filter((item) => item.url)
}

export function sanitizeSettings(input) {
  const scale = Number(input.scale)
  const soundVolume = Number(input.soundVolume)
  const modules = input.modules && typeof input.modules === 'object' ? input.modules : {}
  return {
    scale: Number.isFinite(scale) ? Math.min(1.35, Math.max(0.75, scale)) : 1,
    bubbleVisible: input.bubbleVisible !== false,
    alwaysOnTop: input.alwaysOnTop !== false,
    autoStart: input.autoStart !== false,
    soundSet: ['chime', 'custom', 'mute'].includes(input.soundSet) ? input.soundSet : 'chime',
    soundVolume: Number.isFinite(soundVolume) ? Math.min(1, Math.max(0, soundVolume)) : 0.7,
    bubbleMessages: sanitizeMessages(input.bubbleMessages),
    bubbleTheme: ['nebula', 'compact', 'classic', 'minimal'].includes(input.bubbleTheme) ? input.bubbleTheme : 'compact',
    workingText: String(input.workingText || '别吵，在思考...').trim().slice(0, 80) || '别吵，在思考...',
    workingMessages: sanitizeWorkingMessages(input.workingMessages),
    completedText: String(input.completedText || '完成...').trim().slice(0, 80) || '完成...',
    shortcuts: sanitizeShortcuts(input.shortcuts),
    plugins: sanitizePlugins(input.plugins),
    modules: {
      summary: modules.summary !== false,
      appButtons: modules.appButtons !== false,
      source: modules.source !== false,
      resetTime: modules.resetTime !== false,
    },
    position: sanitizePosition(input.position),
  }
}

function sanitizePosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null
  return { x: Math.round(position.x), y: Math.round(position.y) }
}

export async function writeSettings(input) {
  const settings = sanitizeSettings(input)
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
  return settings
}
