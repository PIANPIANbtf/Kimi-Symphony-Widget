import fs from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from './paths.mjs'

const file = path.join(dataDir, 'announcement.json')
const EDIT_KEY = 'Butterfly2026'

export async function readAnnouncement() {
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'))
    return {
      text: String(saved.text || ''),
      updatedAt: saved.updatedAt || null,
    }
  } catch {
    return { text: '欢迎来到 Kimi Symphony Studio。', updatedAt: null }
  }
}

export async function writeAnnouncement(text, key) {
  if (key !== EDIT_KEY) {
    const error = new Error('公告板密钥错误')
    error.status = 401
    throw error
  }
  const announcement = {
    text: String(text || '').trim().slice(0, 2000),
    updatedAt: new Date().toISOString(),
  }
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(file, `${JSON.stringify(announcement, null, 2)}\n`, { mode: 0o600 })
  return announcement
}
