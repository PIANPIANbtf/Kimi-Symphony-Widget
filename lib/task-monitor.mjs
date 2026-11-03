import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TaskStateMachine } from './task-state.mjs'

const ACTIVE_STATUSES = new Set(['running', 'working', 'streaming', 'pending', 'in_progress', 'processing', 'queued', 'started'])
const STALE_TURN_MS = 120000

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readTail(file, size = 131072) {
  try {
    const handle = await fs.open(file, 'r')
    try {
      const stat = await handle.stat()
      const start = Math.max(0, stat.size - size)
      const buffer = Buffer.alloc(Math.min(size, stat.size))
      await handle.read(buffer, 0, buffer.length, start)
      return { text: buffer.toString('utf8'), mtimeMs: stat.mtimeMs }
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

async function walk(dir, depth, visit) {
  if (depth < 0) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(file, depth - 1, visit)
    else if (entry.isFile()) await visit(file)
  }
}

export class TaskMonitor extends TaskStateMachine {
  constructor() {
    super()
    this.timer = null
    this.refreshing = false
    this.codeHome = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code')
    this.kimiStatusFile = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'kimi-desktop', 'kimi-agent', 'conversation-statuses.json')
  }

  async start() {
    await this.refresh()
    this.timer = setInterval(() => this.refresh(), 1500)
    this.timer.unref()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
  }

  async refresh() {
    if (this.refreshing) return this.snapshot()
    this.refreshing = true
    try {
      const [kimi, code] = await Promise.all([this.kimiActiveCount(), this.codeActiveCount()])
      this.update(kimi + code)
    } finally {
      this.refreshing = false
    }
    return this.snapshot()
  }

  async kimiActiveCount() {
    const statuses = await readJson(this.kimiStatusFile)
    if (!statuses || typeof statuses !== 'object') return 0
    return Object.values(statuses).filter((status) => ACTIVE_STATUSES.has(String(status).toLowerCase())).length
  }

  async codeActiveCount() {
    const sessions = path.join(this.codeHome, 'sessions')
    let active = 0
    await walk(sessions, 5, async (file) => {
      if (file.endsWith(path.join('agents', 'main', 'wire.jsonl'))) active += await this.wireActiveTurns(file)
      if (file.includes(`${path.sep}tasks${path.sep}`) && file.endsWith('.json')) active += await this.taskFileActive(file) ? 1 : 0
    })
    return active
  }

  async wireActiveTurns(file) {
    const tail = await readTail(file)
    if (!tail || Date.now() - tail.mtimeMs > STALE_TURN_MS) return 0
    const active = new Set()
    for (const line of tail.text.split(/\r?\n/)) {
      try {
        const record = JSON.parse(line)
        const event = record.event || record
        const turnId = String(event.turnId || event.turn_id || event.turn || '')
        if (!turnId) continue
        if (event.type === 'step.begin') active.add(turnId)
        if (event.type === 'step.end' && event.finishReason !== 'tool_use') active.delete(turnId)
        if (event.type === 'turn.end' || event.type === 'turn.cancel') active.delete(turnId)
      } catch {}
    }
    return active.size
  }

  async taskFileActive(file) {
    const task = await readJson(file)
    if (!task || !ACTIVE_STATUSES.has(String(task.status).toLowerCase())) return false
    const command = String(task.command || '')
    const description = String(task.description || '')
    if (command.includes('server.mjs') || (command.includes('start') && description.includes('挂件'))) return false
    return true
  }
}
