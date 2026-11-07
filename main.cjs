const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const BASE_WIDTH = 440
const BASE_HEIGHT = 640
const APP_CANDIDATES = {
  kimi: [
    process.env.KIMI_APP_PATH,
    'D:\\下载\\Kimi\\Kimi.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kimi', 'Kimi.exe'),
    '/Applications/Kimi.app',
  ],
  'kimi-code': [
    process.env.KIMI_CODE_APP_PATH,
    'D:\\AGENT\\KIMI code\\Kimi Code.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kimi Code', 'Kimi Code.exe'),
    '/Applications/Kimi Code.app',
  ],
}
let mainWindow = null
let settings
let usageModule
let settingsModule
let kimiUsageModule
let startupModule
let customAssetsModule
let pathsModule
let cloudSyncModule
let configWatcher = null
let configTimer = null
let mascotCenterY = null
let mascotCenterX = null
let taskMonitor = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function windowSize() {
  return { width: BASE_WIDTH, height: BASE_HEIGHT }
}

function validPosition(position, size) {
  if (!position) return null
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return position.x >= area.x - size.width / 2 &&
      position.y >= area.y - size.height / 2 &&
      position.x < area.x + area.width - size.width / 2 &&
      position.y < area.y + area.height - size.height / 2
  }) ? position : null
}

function getLayout() {
  if (!mainWindow) return null
  const bounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  return { bounds, workArea, mascotCenterY, mascotCenterX }
}

async function getState() {
  const custom = await customAssetsModule.getCustomAssets(true)
  return {
    usage: await kimiUsageModule.getUsage(),
    settings: await settingsModule.readSettings(),
    mascotUrl: custom.mascot?.value || null,
    workingImageUrl: custom.working?.value || null,
    completedImageUrl: custom.completed?.value || null,
    customSounds: custom.sounds ? { press: custom.sounds.press, release: custom.sounds.release } : null,
    taskState: taskMonitor?.snapshot() || { state: 'normal', activeCount: 0 },
    cloud: await cloudSyncModule.cloudStatus(),
    layout: getLayout(),
    desktop: true,
  }
}

let settingsQueue = Promise.resolve()
function persistSettings(patch) {
  settingsQueue = settingsQueue.catch(() => {}).then(async () => {
    const current = await settingsModule.readSettings()
    settings = await settingsModule.writeSettings({ ...current, ...patch })
    return settings
  })
  return settingsQueue
}

async function applyStartup(enabled) {
  if (app.isPackaged && ['win32', 'darwin'].includes(process.platform)) {
    if (process.platform === 'win32') await startupModule.setStartupEnabled(false)
    const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
    app.setLoginItemSettings({ openAtLogin: enabled, path: executable })
    return
  }
  return startupModule.setStartupEnabled(enabled)
}

function watchConfig() {
  let pendingAutoStart = null
  configWatcher = fs.watch(pathsModule.dataDir, { persistent: false }, (_event, filename) => {
    clearTimeout(configTimer)
    configTimer = setTimeout(async () => {
      try {
        const previous = pendingAutoStart ?? settings.autoStart
        settings = await settingsModule.readSettings()
        pendingAutoStart = settings.autoStart
        if (previous !== settings.autoStart) await applyStartup(settings.autoStart)
        mainWindow?.webContents.send('widget:config-changed')
      } catch (error) {
        console.warn('配置同步失败:', error.message)
      }
    }, 140)
  })
}

async function synchronizeCloud() {
  const status = await cloudSyncModule.cloudSync()
  mainWindow?.webContents.send('widget:cloud-status', status)
  return status
}

async function createWindow() {
  const modules = await Promise.all([
    import('./lib/usage.mjs'),
    import('./lib/settings.mjs'),
    import('./lib/kimi-usage.mjs'),
    import('./lib/startup.mjs'),
    import('./lib/custom-assets.mjs'),
    import('./lib/paths.mjs'),
    import('./lib/task-monitor.mjs'),
    import('./lib/cloud-sync.mjs'),
  ])
  usageModule = modules[0]
  settingsModule = modules[1]
  kimiUsageModule = modules[2]
  startupModule = modules[3]
  customAssetsModule = modules[4]
  pathsModule = modules[5]
  taskMonitor = new modules[6].TaskMonitor()
  cloudSyncModule = modules[7]
  settings = await settingsModule.readSettings()
  await fs.promises.mkdir(pathsModule.dataDir, { recursive: true })
  try {
    await applyStartup(settings.autoStart)
  } catch (error) {
    console.warn('开机自启设置失败:', error.message)
  }
  const size = windowSize()
  const display = screen.getPrimaryDisplay().workArea
  const fallback = { x: display.x + display.width - size.width - 18, y: display.y + display.height - size.height - 12 }
  const position = validPosition(settings.position, size) || fallback

  mainWindow = new BrowserWindow({
    ...size,
    ...position,
    minWidth: Math.round(BASE_WIDTH * 0.75),
    minHeight: Math.round(BASE_HEIGHT * 0.75),
    maxWidth: 1000,
    maxHeight: Math.round(BASE_HEIGHT * 1.35),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, settings.alwaysOnTop ? 'floating' : 'normal')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.on('closed', () => {
    clearTimeout(configTimer)
    configWatcher?.close()
    configWatcher = null
    taskMonitor?.stop()
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://www.kimi.com/code' || url === 'https://www.kimi.com/') shell.openExternal(url)
    return { action: 'deny' }
  })
  taskMonitor.on('change', (snapshot) => {
    mainWindow?.webContents.send('widget:task-state', snapshot)
  })
  await taskMonitor.start()
  watchConfig()
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

ipcMain.handle('widget:get-state', getState)
ipcMain.handle('widget:get-layout', getLayout)
ipcMain.handle('widget:acknowledge-completed', () => taskMonitor.acknowledge())
ipcMain.handle('widget:refresh-usage', async () => kimiUsageModule.getUsage({ force: true }))

ipcMain.handle('widget:save-usage', async (_event, input) => {
  const usage = await usageModule.writeUsage(input, 'manual')
  kimiUsageModule.invalidateUsageCache()
  return usage
})

ipcMain.handle('widget:set-interactive', (_event, interactive) => {
  if (!mainWindow) return
  mainWindow.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcMain.handle('widget:move-by', (_event, delta) => {
  if (!mainWindow || !Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) return null
  const [x, y] = mainWindow.getPosition()
  const next = { x: Math.round(x + delta.x), y: Math.round(y + delta.y) }
  const bounds = mainWindow.getBounds()
  const area = screen.getDisplayMatching({ ...bounds, x: next.x, y: next.y }).workArea
  const minX = area.x
  const minY = area.y
  const maxX = Math.max(minX, area.x + area.width - bounds.width)
  const maxY = Math.max(minY, area.y + area.height - bounds.height)
  next.x = Math.max(minX, Math.min(next.x, maxX))
  next.y = Math.max(minY, Math.min(next.y, maxY))
  if (Number.isFinite(delta.mascotCenterY)) mascotCenterY = delta.mascotCenterY
  else if (mascotCenterY !== null) mascotCenterY += delta.y
  if (Number.isFinite(delta.mascotCenterX)) mascotCenterX = delta.mascotCenterX
  else if (mascotCenterX !== null) mascotCenterX += delta.x
  mainWindow.setPosition(next.x, next.y)
  return next
})

ipcMain.handle('widget:set-mascot-center', (_event, center) => {
  if (Number.isFinite(center?.x)) mascotCenterX = center.x
  if (Number.isFinite(center?.y)) mascotCenterY = center.y
  return getLayout()
})

ipcMain.handle('widget:snap', async () => {
  if (!mainWindow) return settings
  const bounds = mainWindow.getBounds()
  const display = screen.getDisplayMatching(bounds).workArea
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  let x = bounds.x
  let y = bounds.y
  if (centerX < display.x + display.width / 4) x = display.x + 8
  if (centerX > display.x + display.width * 3 / 4) x = display.x + display.width - bounds.width - 8
  if (centerY < display.y + display.height / 4) y = display.y + 8
  if (centerY > display.y + display.height * 3 / 4) y = display.y + display.height - bounds.height - 8
  x = Math.max(display.x, Math.min(x, display.x + display.width - bounds.width))
  y = Math.max(display.y, Math.min(y, display.y + display.height - bounds.height))
  mainWindow.setPosition(Math.round(x), Math.round(y))
  const saved = await persistSettings({ position: { x: Math.round(x), y: Math.round(y) } })
  return { ...saved, layout: getLayout() }
})

ipcMain.handle('widget:update-settings', async (_event, patch) => {
  if (Object.hasOwn(patch, 'autoStart')) await applyStartup(patch.autoStart)
  settings = await persistSettings(patch)
  if (!mainWindow) return { ...settings, layout: getLayout() }
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, settings.alwaysOnTop ? 'floating' : 'normal')
  const [x, y] = mainWindow.getPosition()
  await persistSettings({ position: { x, y } })
  return { ...settings, layout: getLayout() }
})

ipcMain.handle('widget:cloud-login', async (_event, input) => {
  const status = await cloudSyncModule.cloudLogin(input.username, input.password)
  mainWindow?.webContents.send('widget:cloud-status', status)
  return status
})
ipcMain.handle('widget:cloud-logout', async () => {
  const status = await cloudSyncModule.cloudLogout()
  mainWindow?.webContents.send('widget:cloud-status', status)
  return status
})
ipcMain.handle('widget:cloud-status', () => cloudSyncModule.cloudStatus())
ipcMain.handle('widget:cloud-sync', synchronizeCloud)

ipcMain.handle('widget:open-studio', async () => {
  const status = await cloudSyncModule.cloudStatus()
  await shell.openExternal(`${status.server}/config`)
})

ipcMain.handle('widget:open-app', async (_event, id) => {
  const customPath = settings.shortcuts?.[id]?.path
  if (customPath) {
    if (!fs.existsSync(customPath)) return { ok: false, error: '自定义程序路径不存在' }
    const error = await shell.openPath(customPath)
    return error ? { ok: false, error } : { ok: true }
  }
  const customUrl = settings.shortcuts?.[id]?.url
  if (customUrl) {
    await shell.openExternal(customUrl)
    return { ok: true }
  }
  const candidates = APP_CANDIDATES[id]
  if (!candidates) return { ok: false, error: '不支持的应用入口' }
  const executable = candidates.find((candidate) => candidate && fs.existsSync(candidate))
  if (!executable) return { ok: false, error: `未找到${id === 'kimi' ? ' Kimi ' : ' Kimi Code '}安装路径` }
  const error = await shell.openPath(executable)
  return error ? { ok: false, error } : { ok: true }
})

ipcMain.handle('widget:open-plugin', async (_event, id) => {
  const plugin = settings.plugins?.find((item) => item.id === id && item.enabled)
  if (!plugin) return { ok: false, error: '插件不存在或未启用' }
  await shell.openExternal(plugin.url)
  return { ok: true }
})

ipcMain.handle('widget:close', () => {
  if (mainWindow) mainWindow.close()
})
