import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const startupDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
const startupFile = path.join(startupDir, 'KimiSymphonyWidget.vbs')

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export async function isStartupEnabled() {
  try {
    await fs.access(startupFile)
    return true
  } catch {
    return false
  }
}

export async function setStartupEnabled(enabled) {
  if (!enabled) {
    await fs.unlink(startupFile).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    return { enabled: false, file: startupFile }
  }
  if (process.platform !== 'win32') throw new Error('当前系统尚未支持开机自启')
  const launcher = path.join(root, '启动挂件.cmd')
  const command = `cmd.exe /c "${launcher}"`
  const content = [
    'Option Explicit',
    'Dim shell',
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = ${quote(root)}`,
    `shell.Run ${quote(command)}, 0, False`,
    '',
  ].join('\r\n')
  await fs.mkdir(startupDir, { recursive: true })
  await fs.writeFile(startupFile, `\ufeff${content}`, 'utf16le')
  return { enabled: await isStartupEnabled(), file: startupFile }
}
