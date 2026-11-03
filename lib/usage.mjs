import fs from 'node:fs/promises'
import { dataDir, usageFile } from './paths.mjs'

const WINDOW_KEYS = ['fiveHour', 'weekly', 'monthly']
const WINDOW_LABELS = {
  fiveHour: '5 小时额度',
  weekly: '每周额度',
  monthly: '每月总额度',
}

const demoUsage = {
  version: 1,
  planName: 'Kimi Plus',
  source: 'demo',
  isDemo: true,
  updatedAt: null,
  windows: {
    fiveHour: { label: '5 小时额度', usedPercent: 32, remainingPercent: 68, resetsAt: null },
    monthly: { label: '每月总额度', usedPercent: 18, remainingPercent: 82, resetsAt: null },
  },
}

function finitePercent(value, field) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`${field} 必须是 0–100 的数字`)
  }
  return Math.round(number * 10) / 10
}

function optionalDate(value) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('重置时间不是有效日期')
  return date.toISOString()
}

export function normalizeUsage(input, source = 'snapshot') {
  if (!input || typeof input !== 'object') throw new Error('用量数据必须是 JSON 对象')
  const sourceWindows = input.windows || input
  const windows = {}

  for (const key of WINDOW_KEYS) {
    const value = sourceWindows[key]
    if (value === null || value === undefined || value === '') continue
    if (typeof value !== 'object') throw new Error(`${key} 必须是对象`)
    let usedPercent
    if (value.usedPercent !== undefined) {
      usedPercent = finitePercent(value.usedPercent, `${key}.usedPercent`)
    } else if (value.remainingPercent !== undefined) {
      usedPercent = finitePercent(100 - Number(value.remainingPercent), `${key}.remainingPercent`)
    } else {
      throw new Error(`${key} 缺少 usedPercent 或 remainingPercent`)
    }
    windows[key] = {
      label: WINDOW_LABELS[key],
      usedPercent,
      remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
      resetsAt: optionalDate(value.resetsAt),
    }
  }

  if (!windows.fiveHour && !windows.weekly && !windows.monthly) {
    throw new Error('至少提供一项套餐额度')
  }

  return {
    version: 1,
    planName: String(input.planName || 'Kimi 订阅').slice(0, 60),
    source: String(input.source || source).slice(0, 40),
    isDemo: false,
    updatedAt: new Date().toISOString(),
    windows,
  }
}

export async function readUsage() {
  try {
    const raw = await fs.readFile(usageFile, 'utf8')
    const parsed = JSON.parse(raw)
    const normalized = normalizeUsage(parsed, parsed.source)
    return { ...normalized, updatedAt: parsed.updatedAt || normalized.updatedAt }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return {
        ...demoUsage,
        source: 'error',
        error: `用量快照读取失败：${error.message}`,
      }
    }
    return { ...demoUsage }
  }
}

export async function writeUsage(input, source = 'snapshot') {
  const usage = normalizeUsage(input, source)
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  const temporary = `${usageFile}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(usage, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, usageFile)
  return usage
}

export function publicUsage(usage) {
  return usage
}
