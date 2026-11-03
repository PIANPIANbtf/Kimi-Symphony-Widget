import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { writeUsage } from './lib/usage.mjs'
import { getUsage, invalidateUsageCache } from './lib/kimi-usage.mjs'
import { DEFAULT_MESSAGES, readSettings, writeSettings } from './lib/settings.mjs'
import { getCustomAssets, saveMascot, saveSounds, removeMascot, removeSounds, saveStateMascot, removeStateMascot } from './lib/custom-assets.mjs'
import { TaskMonitor } from './lib/task-monitor.mjs'
import { readAnnouncement, writeAnnouncement } from './lib/announcement.mjs'
import { getProjectInfo } from './lib/project.mjs'
import { checkForUpdate, prepareUpdate } from './lib/updater.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.KIMI_SYMPHONY_PORT || 45739)
const taskMonitor = new TaskMonitor()
taskMonitor.start()
const files = new Map([
  ['/', ['renderer/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['renderer/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['renderer/styles.css', 'text/css; charset=utf-8']],
  ['/renderer/app.js', ['renderer/app.js', 'text/javascript; charset=utf-8']],
  ['/renderer/styles.css', ['renderer/styles.css', 'text/css; charset=utf-8']],
  ['/assets/kimi-nyan.png', ['assets/kimi-nyan.png', 'image/png']],
  ['/assets/working.png', ['assets/kimi娘_工作进行中.png', 'image/png']],
  ['/assets/completed.png', ['assets/kimi娘_工作完成.png', 'image/png']],
  ['/assets/nebula/starfield.svg', ['assets/nebula/starfield.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/nebula/crescent.svg', ['assets/nebula/crescent.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/nebula/prism-glint.svg', ['assets/nebula/prism-glint.svg', 'image/svg+xml; charset=utf-8']],
  ['/assets/sounds/chime/press.wav', ['assets/sounds/chime/press.wav', 'audio/wav']],
  ['/assets/sounds/chime/release.wav', ['assets/sounds/chime/release.wav', 'audio/wav']],
  ['/config', ['config/index.html', 'text/html; charset=utf-8']],
  ['/config/', ['config/index.html', 'text/html; charset=utf-8']],
  ['/config/app.js', ['config/app.js', 'text/javascript; charset=utf-8']],
  ['/config/styles.css', ['config/styles.css', 'text/css; charset=utf-8']],
  ['/NOTICE', ['NOTICE', 'text/plain; charset=utf-8']],
  ['/designs', ['designs/index.html', 'text/html; charset=utf-8']],
  ['/designs/', ['designs/index.html', 'text/html; charset=utf-8']],
  ['/designs/styles.css', ['designs/styles.css', 'text/css; charset=utf-8']],
])

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  let text = ''
  for await (const chunk of request) {
    text += chunk
    if (text.length > 8 * 1024 * 1024) throw new Error('请求内容过大')
  }
  return JSON.parse(text || '{}')
}

async function state() {
  const custom = await getCustomAssets(false)
  return {
    usage: await getUsage(),
    settings: await readSettings(),
    mascotUrl: custom.mascot ? '/api/assets/mascot' : null,
    workingImageUrl: custom.working ? '/api/assets/working' : null,
    completedImageUrl: custom.completed ? '/api/assets/completed' : null,
    customSounds: custom.sounds ? { press: '/api/assets/sound/press', release: '/api/assets/sound/release' } : null,
    taskState: taskMonitor.snapshot(),
    desktop: false,
  }
}

async function sendCustomAsset(response, kind) {
  const custom = await getCustomAssets(false)
  const asset = kind === 'mascot' ? custom.mascot : ['working', 'completed'].includes(kind) ? custom[kind] : custom.sounds ? { mime: 'audio/mpeg', value: custom.sounds[kind] } : null
  if (!asset) return json(response, { error: '自定义素材不存在' }, 404)
  const content = await fs.readFile(asset.value)
  response.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-store' })
  response.end(content)
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, await state())
    if (request.method === 'GET' && url.pathname === '/api/announcement') return json(response, await readAnnouncement())
    if (request.method === 'GET' && url.pathname === '/api/project') return json(response, getProjectInfo())
    if (request.method === 'POST' && url.pathname === '/api/update/check') return json(response, await checkForUpdate({ force: true }))
    if (request.method === 'POST' && url.pathname === '/api/update/apply') {
      const result = await prepareUpdate()
      json(response, result)
      setTimeout(() => process.exit(0), 800)
      return
    }
    if (request.method === 'PUT' && url.pathname === '/api/announcement') {
      const input = await body(request)
      return json(response, await writeAnnouncement(input.text, input.key))
    }
    if (request.method === 'POST' && url.pathname === '/api/task-state/ack') {
      taskMonitor.acknowledge()
      return json(response, taskMonitor.snapshot())
    }
    if (request.method === 'GET' && url.pathname === '/api/usage') return json(response, await getUsage({ force: true }))
    if (request.method === 'GET' && url.pathname === '/api/defaults') return json(response, { bubbleMessages: DEFAULT_MESSAGES })
    if (request.method === 'PUT' && url.pathname === '/api/usage') {
      const usage = await writeUsage(await body(request), 'manual')
      invalidateUsageCache()
      return json(response, usage)
    }
    if (request.method === 'PUT' && url.pathname === '/api/settings') {
      const patch = await body(request)
      return json(response, await writeSettings({ ...await readSettings(), ...patch }))
    }
    if (url.pathname === '/api/assets/mascot') {
      if (request.method === 'GET') return sendCustomAsset(response, 'mascot')
      if (request.method === 'POST') {
        const input = await body(request)
        await saveMascot(input.dataUrl)
        return json(response, { ok: true })
      }
      if (request.method === 'DELETE') {
        await removeMascot()
        return json(response, { ok: true })
      }
    }
    if (url.pathname === '/api/assets/working' || url.pathname === '/api/assets/completed') {
      const kind = url.pathname.endsWith('working') ? 'working' : 'completed'
      if (request.method === 'GET') return sendCustomAsset(response, kind)
      if (request.method === 'POST') {
        const input = await body(request)
        await saveStateMascot(kind, input.dataUrl)
        return json(response, { ok: true })
      }
      if (request.method === 'DELETE') {
        await removeStateMascot(kind)
        return json(response, { ok: true })
      }
    }
    if (url.pathname === '/api/assets/sounds') {
      if (request.method === 'POST') {
        const input = await body(request)
        await saveSounds(input.press, input.release)
        return json(response, { ok: true })
      }
      if (request.method === 'DELETE') {
        await removeSounds()
        return json(response, { ok: true })
      }
    }
    if (request.method === 'GET' && (url.pathname === '/api/assets/sound/press' || url.pathname === '/api/assets/sound/release')) {
      return sendCustomAsset(response, url.pathname.endsWith('press') ? 'press' : 'release')
    }
    if (request.method === 'GET' && files.has(url.pathname)) {
      const [relative, type] = files.get(url.pathname)
      const content = await fs.readFile(path.join(root, relative))
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      return response.end(content)
    }
    json(response, { error: 'Not found' }, 404)
  } catch (error) {
    json(response, { error: error.message }, error.status || 400)
  }
})

function openBrowser() {
  const url = `http://127.0.0.1:${port}${process.argv.includes('--studio') ? '/config' : ''}`
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    if (process.argv.includes('--open')) openBrowser()
    return
  }
  console.error(error)
  process.exitCode = 1
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Kimi Symphony Widget: http://127.0.0.1:${port}`)
  console.log(`Kimi Symphony Studio: http://127.0.0.1:${port}/config`)
  if (process.argv.includes('--open')) openBrowser()
})
