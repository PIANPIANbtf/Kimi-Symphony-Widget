import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dataDir } from './paths.mjs'
import { downloadUrl, getProjectInfo, projectVersion, repositoryName } from './project.mjs'

let cachedRelease = null

export function compareVersions(left, right) {
  const parse = (value) => String(value).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Kimi-Symphony-Widget' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`)
  return response.json()
}

export async function checkForUpdate({ force = false } = {}) {
  const project = getProjectInfo()
  if (!project.configured) return { ...project, updateAvailable: false, latestVersion: null }
  if (!force && cachedRelease && Date.now() - cachedRelease.time < 5 * 60 * 1000) return cachedRelease.value
  const release = await fetchJson(`https://api.github.com/repos/${repositoryName()}/releases/latest`)
  const latestVersion = String(release.tag_name || release.name || '').replace(/^v/, '')
  const value = {
    ...project,
    latestVersion,
    releaseUrl: release.html_url || project.releaseUrl,
    updateAvailable: Boolean(latestVersion) && compareVersions(latestVersion, projectVersion) > 0,
    publishedAt: release.published_at || null,
    assets: release.assets.map((asset) => ({ name: asset.name, url: asset.browser_download_url })),
  }
  cachedRelease = { time: Date.now(), value }
  return value
}

function executableTarget() {
  if (process.platform === 'win32') {
    if (path.basename(process.execPath).toLowerCase() !== 'kimisymphonywidget.exe') throw new Error('开发环境不会自我更新，请运行发行版 exe')
    return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  }
  if (process.platform === 'darwin') {
    const marker = '.app/Contents/MacOS/'
    const index = process.execPath.indexOf(marker)
    if (index < 0 || path.basename(process.execPath) !== 'KimiSymphonyWidget') throw new Error('开发环境不会自我更新，请运行发行版 App')
    return process.execPath.slice(0, index + 4)
  }
  throw new Error('当前系统不支持一键更新')
}

async function download(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`下载更新失败（HTTP ${response.status}）`)
  await pipeline(Readable.fromWeb(response.body), (await import('node:fs')).createWriteStream(file))
}

async function verifyChecksum(file, release) {
  const metadataName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
  const metadata = release.assets.find((asset) => asset.name === metadataName)
  if (!metadata) throw new Error(`最新 Release 缺少 ${metadataName}，已停止更新`)
  const response = await fetch(metadata.url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error('无法读取更新校验信息')
  const text = await response.text()
  const match = /^sha512:\s*([A-Za-z0-9+/=]+)\s*$/m.exec(text)
  if (!match) throw new Error('更新校验信息格式无效')
  const actual = createHash('sha512').update(await fs.readFile(file)).digest('base64')
  if (actual !== match[1]) throw new Error('更新包校验失败，未替换当前程序')
}

function cmdQuote(value) {
  return String(value).replaceAll('%', '%%').replaceAll('"', '""')
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

async function createWindowsUpdater(source, target, directory) {
  const script = path.join(directory, 'apply-update.cmd')
  const backup = `${target}.previous`
  const content = [
    '@echo off',
    `set "SOURCE=${cmdQuote(source)}"`,
    `set "TARGET=${cmdQuote(target)}"`,
    `set "BACKUP=${cmdQuote(backup)}"`,
    ':wait',
    'timeout /t 1 /nobreak >nul',
    `tasklist /FI "PID eq ${process.pid}" /NH | findstr /C:"${process.pid}" >nul && goto wait`,
    'copy /y "%TARGET%" "%BACKUP%" >nul',
    'copy /y "%SOURCE%" "%TARGET%" >nul',
    'if errorlevel 1 (',
    '  copy /y "%BACKUP%" "%TARGET%" >nul',
    '  start "" "%TARGET%"',
    '  exit /b 1',
    ')',
    'start "" "%TARGET%"',
    'del /q "%SOURCE%" >nul 2>nul',
    'del /q "%~f0" >nul 2>nul',
    '',
  ].join('\r\n')
  await fs.writeFile(script, content, 'utf8')
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

async function createMacUpdater(source, target, directory) {
  const script = path.join(directory, 'apply-update.sh')
  const extracted = path.join(directory, 'extracted')
  const backup = `${target}.previous`
  const content = `#!/bin/sh
set -e
while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done
/usr/bin/ditto -x -k ${shellQuote(source)} ${shellQuote(extracted)}
APP=$(/usr/bin/find ${shellQuote(extracted)} -maxdepth 2 -name '*.app' -type d -print -quit)
if [ -z "$APP" ]; then exit 1; fi
/bin/rm -rf ${shellQuote(backup)}
/bin/mv ${shellQuote(target)} ${shellQuote(backup)}
if /bin/mv "$APP" ${shellQuote(target)}; then
  /usr/bin/open ${shellQuote(target)}
else
  /bin/mv ${shellQuote(backup)} ${shellQuote(target)}
  /usr/bin/open ${shellQuote(target)}
  exit 1
fi
/bin/rm -rf ${shellQuote(extracted)} ${shellQuote(source)}
/bin/rm -f ${shellQuote(script)}
`
  await fs.writeFile(script, content, { mode: 0o700 })
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref()
}

export async function prepareUpdate() {
  const target = executableTarget()
  const release = await checkForUpdate({ force: true })
  if (!release.configured) throw new Error('请先在 release.config.json 中配置 GitHub 仓库')
  if (!release.updateAvailable) throw new Error('当前已经是最新版本')
  const asset = release.assets.find((item) => item.name === path.basename(downloadUrl(process.platform)))
  if (!asset) throw new Error('最新 Release 中没有适合当前系统的安装包')
  const directory = path.join(dataDir, 'updates', release.latestVersion)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const source = path.join(directory, path.basename(asset.name))
  await download(asset.url, source)
  await verifyChecksum(source, release)
  if (process.platform === 'win32') await createWindowsUpdater(source, target, directory)
  else await createMacUpdater(source, target, directory)
  return { ok: true, version: release.latestVersion, message: '更新包已校验，挂件即将关闭并自动重启' }
}
