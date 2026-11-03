import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readUsage, writeUsage } from './usage.mjs'

const USAGE_URL = 'https://api.kimi.com/coding/v1/usages'
const PROFILE_URL = 'https://api.kimi.com/coding/v1/me'
const CACHE_TTL_MS = 60000
let cache = null
let inFlight = null

async function accessToken() {
  const override = String(process.env.KIMI_CODING_KEY || '').trim()
  if (override) return override
  const home = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code')
  const file = path.join(home, 'credentials', 'kimi-code.json')
  let credential
  try {
    credential = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('未找到 Kimi Code 登录凭据，请先在 Kimi Code 中登录')
    throw new Error('Kimi Code 登录凭据无法读取')
  }
  const token = typeof credential.access_token === 'string' ? credential.access_token.trim() : ''
  if (!token) throw new Error('Kimi Code 登录凭据不完整，请重新登录')
  if (typeof credential.expires_at === 'number' && credential.expires_at > 0 && credential.expires_at <= Date.now() / 1000 + 30) {
    throw new Error('Kimi Code 登录已过期，请打开 Kimi Code 重新登录')
  }
  return token
}

async function officialJson(url, token) {
  let response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('官方用量请求超时')
    throw new Error('无法连接 Kimi 官方用量服务')
  }
  if (response.status === 401 || response.status === 403) throw new Error('Kimi Code 登录已失效，请重新登录')
  if (!response.ok) throw new Error(`官方用量服务返回 HTTP ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error('官方用量服务返回了无法解析的数据')
  }
}

function quotaWindow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ratio = Number(raw.used_ratio)
  if (!Number.isFinite(ratio)) return null
  return {
    usedPercent: Math.min(100, Math.max(0, ratio * 100)),
    resetsAt: typeof raw.reset_time === 'string' && raw.reset_time ? raw.reset_time : null,
  }
}

export async function fetchOfficialUsage() {
  const token = await accessToken()
  const [usagePayload, profilePayload] = await Promise.all([
    officialJson(USAGE_URL, token),
    officialJson(PROFILE_URL, token).catch(() => null),
  ])
  const quotas = usagePayload?.usages
  if (!quotas || typeof quotas !== 'object') throw new Error('官方用量响应缺少 usages 字段')
  const windows = {
    fiveHour: quotaWindow(quotas.limit_5h),
    weekly: quotaWindow(quotas.limit_7d),
    monthly: quotaWindow(quotas.limit_month_total) || quotaWindow(quotas.limit_month_code),
  }
  if (!windows.fiveHour && !windows.weekly && !windows.monthly) throw new Error('官方响应中没有可展示的订阅额度')
  return writeUsage({
    planName: profilePayload?.user_level_name || 'Kimi 订阅',
    windows,
  }, 'official')
}

export async function getUsage({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.usage
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const usage = await fetchOfficialUsage()
      cache = { at: Date.now(), usage }
      return usage
    } catch (error) {
      const cached = await readUsage()
      return { ...cached, error: error.message, stale: !cached.isDemo }
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function invalidateUsageCache() {
  cache = null
}
