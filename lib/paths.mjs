import os from 'node:os'
import path from 'node:path'

export const dataDir = process.env.KIMI_SYMPHONY_HOME || path.join(os.homedir(), '.kimi-symphony-widget')
export const usageFile = path.join(dataDir, 'usage.json')
export const settingsFile = path.join(dataDir, 'settings.json')
