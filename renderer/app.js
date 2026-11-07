const desktop = window.widgetDesktop || null
const $ = (selector) => document.querySelector(selector)
const elements = {
  widget: $('#widget'),
  bubble: $('#bubble'),
  settings: $('#settings-panel'),
  mascot: $('#mascot'),
  hint: $('#mascot-hint'),
  plan: $('#plan-name'),
  primaryRemaining: $('#primary-remaining'),
  primaryLabel: $('#primary-label'),
  primaryReset: $('#primary-reset'),
  ring: $('#ring-value'),
  windows: $('#window-list'),
  source: $('#source-status'),
  refresh: $('#refresh-button'),
  formError: $('#form-error'),
}

const defaultSettings = {
  scale: 1,
  bubbleVisible: false,
  alwaysOnTop: true,
  autoStart: true,
  soundSet: 'chime',
  soundVolume: 0.7,
  bubbleMessages: ['点我看看用量'],
  bubbleTheme: 'nebula',
  workingText: '别吵，在思考...',
  workingMessages: ['别吵，在思考...'],
  completedText: '完成...',
  shortcuts: { kimi: { label: '打开 Kimi', url: '', path: '' }, 'kimi-code': { label: '打开 Kimi Code', url: '', path: '' } },
  plugins: [],
  modules: { summary: true, appButtons: true, source: true, resetTime: true },
}
let state = { usage: null, settings: defaultSettings, layout: null, mascotUrl: null, customSounds: null, taskState: { state: 'normal', activeCount: 0 } }
let drag = null
const circumference = 2 * Math.PI * 49
const audioCache = new Map()

document.body.classList.add(desktop ? 'desktop' : 'web')

async function request(path, options) {
  const response = await fetch(path, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

async function loadState() {
  state = desktop ? await desktop.getState() : await request('/api/state')
  applyCustomAssets()
  applySettings()
  applyTaskState(state.taskState, { initial: true })
  renderUsage()
  updateLayout()
  if (desktop) {
    lastInteractive = null
    desktop.setInteractive(false)
  }
}

function setMascotSource(source) {
  const image = $('#mascot-image')
  if (image.dataset.source === source) return
  image.dataset.source = source
  image.style.opacity = '0'
  image.onload = () => { image.style.opacity = '1' }
  image.src = source
}

function applyCustomAssets() {
  const customOption = $('#custom-sound-option')
  customOption.hidden = !state.customSounds
  customOption.disabled = !state.customSounds
}

function randomWorkingMessage() {
  const messages = state.settings.workingMessages?.length ? state.settings.workingMessages : [state.settings.workingText || '别吵，在思考...']
  return messages[Math.floor(Math.random() * messages.length)]
}

function applyTaskState(snapshot, { initial = false } = {}) {
  const previous = state.taskState?.state || 'normal'
  if (!initial && snapshot?.state === previous && snapshot?.activeCount === state.taskState?.activeCount) return
  state.taskState = snapshot || { state: 'normal', activeCount: 0 }
  const current = state.taskState.state
  elements.widget.dataset.taskState = current
  if (current === 'working') {
    setMascotSource(state.workingImageUrl || (desktop ? '../assets/kimi娘_工作进行中.png?v=2' : '/assets/working.png'))
    elements.hint.textContent = randomWorkingMessage()
    if (bubbleMode === 'message') $('#message-text').textContent = randomWorkingMessage()
  } else if (current === 'completed') {
    setMascotSource(state.completedImageUrl || (desktop ? '../assets/kimi娘_工作完成.png?v=2' : '/assets/completed.png'))
    elements.hint.textContent = state.settings.completedText
    if (bubbleMode === 'message') $('#message-text').textContent = state.settings.completedText
  } else {
    setMascotSource(state.mascotUrl || '../assets/kimi-nyan.png')
    randomHint()
  }
  if (current === 'completed' && previous !== 'completed' && !initial) {
    setBubbleMode('message')
    elements.hint.textContent = state.settings.completedText
    $('#message-text').textContent = state.settings.completedText
    updateSettings({ bubbleVisible: true }).catch(() => {})
  }
}

function playSound(kind) {
  const set = state.settings.soundSet
  const volume = state.settings.soundVolume
  if (set === 'mute' || volume <= 0 || (set === 'custom' && !state.customSounds)) return Promise.resolve(false)
  const key = `${set}/${kind}`
  let audio = audioCache.get(key)
  if (!audio) {
    const source = set === 'custom' ? state.customSounds[kind] : `../assets/sounds/${set}/${kind}.wav`
    audio = new Audio(source)
    audio.preload = 'auto'
    audioCache.set(key, audio)
  }
  audio.volume = volume
  audio.currentTime = 0
  return audio.play().then(() => true).catch(() => false)
}

function renderCloudStatus() {
  const cloud = state.cloud || { loggedIn: false }
  $('#cloud-status').textContent = cloud.loggedIn
    ? `已登录 ${cloud.user?.username || ''} · ${cloud.lastError || (cloud.lastSync ? `同步于 ${new Date(cloud.lastSync).toLocaleTimeString('zh-CN')}` : '等待同步')}`
    : cloud.lastError || '尚未登录公共账号'
  $('#cloud-logout').hidden = !cloud.loggedIn
  $('#cloud-sync').hidden = !cloud.loggedIn
}

function applySettings() {
  renderCloudStatus()
  const settings = state.settings
  document.documentElement.style.setProperty('--scale', settings.scale)
  elements.bubble.dataset.theme = settings.bubbleTheme
  elements.bubble.classList.toggle('hidden', !settings.bubbleVisible)
  $('.summary').classList.toggle('hidden', !settings.modules.summary)
  $('.app-actions').classList.toggle('hidden', !settings.modules.appButtons)
  $('.card-footer').classList.toggle('hidden', !settings.modules.source)
  elements.primaryReset.classList.toggle('hidden', !settings.modules.resetTime)
  $('#scale-input').value = settings.scale
  $('#scale-output').value = `${Math.round(settings.scale * 100)}%`
  $('#top-input').checked = settings.alwaysOnTop
  $('#startup-input').checked = settings.autoStart
  $('#sound-set-input').value = settings.soundSet
  $('#sound-volume-input').value = settings.soundVolume
  $('#sound-volume-input').disabled = settings.soundSet === 'mute'
  $('#sound-volume-output').value = `${Math.round(settings.soundVolume * 100)}%`
  $('#open-kimi > span:nth-child(2)').textContent = settings.shortcuts.kimi.label
  $('#open-kimi-code > span:nth-child(2)').textContent = settings.shortcuts['kimi-code'].label
  renderPlugins()
}

function renderPlugins() {
  const container = $('#plugin-buttons')
  container.replaceChildren()
  for (const plugin of state.settings.plugins.filter((item) => item.enabled)) {
    const button = document.createElement('button')
    button.className = 'plugin-entry'
    button.textContent = plugin.name
    button.title = plugin.url
    button.addEventListener('click', () => {
      if (desktop) desktop.openPlugin(plugin.id)
      else window.open(plugin.url, '_blank', 'noopener')
    })
    container.append(button)
  }
}

function randomHint() {
  if (state.taskState?.state === 'working') {
    elements.hint.textContent = state.settings.workingText
    return
  }
  if (state.taskState?.state === 'completed') {
    elements.hint.textContent = state.settings.completedText
    return
  }
  const messages = state.settings.bubbleMessages?.length ? state.settings.bubbleMessages : ['点我看看用量']
  elements.hint.textContent = messages[Math.floor(Math.random() * messages.length)]
}

function updateLayout() {
  const fallbackBounds = elements.widget.getBoundingClientRect()
  const layout = state.layout || {
    bounds: { x: fallbackBounds.left, y: fallbackBounds.top, width: fallbackBounds.width, height: fallbackBounds.height },
    workArea: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
  }
  if (!layout?.bounds || !layout?.workArea) return
  const { bounds, workArea } = layout
  const rootHeight = desktop ? bounds.height : 640
  const rootWidth = desktop ? bounds.width : 440
  elements.widget.style.height = `${rootHeight}px`
  elements.widget.style.width = `${rootWidth}px`
  const size = 245 * state.settings.scale
  const windowTopHalf = bounds.y + bounds.height / 2 < workArea.y + workArea.height / 2
  const defaultCenterY = bounds.y + (windowTopHalf ? size / 2 : rootHeight - size / 2)
  const centerY = Number.isFinite(layout.mascotCenterY) ? layout.mascotCenterY : defaultCenterY
  const mascotTop = Math.max(0, Math.min(rootHeight - size, centerY - bounds.y - size / 2))
  const topHalf = centerY < workArea.y + workArea.height / 2
  elements.mascot.style.top = `${mascotTop}px`
  elements.mascot.style.bottom = 'auto'
  elements.widget.classList.toggle('mascot-left', bounds.x + bounds.width / 2 < workArea.x + workArea.width / 2)
  elements.widget.classList.toggle('mascot-top', state.settings.bubbleVisible && topHalf)
  const leftHalf = bounds.x + bounds.width / 2 < workArea.x + workArea.width / 2

  positionPanel(elements.bubble, elements.bubble.offsetHeight || 380, size, mascotTop, leftHalf, topHalf, true, rootHeight, rootWidth)
  if (!elements.settings.classList.contains('hidden')) {
    positionPanel(elements.settings, elements.settings.offsetHeight || 560, size, mascotTop, leftHalf, topHalf, false, rootHeight, rootWidth)
  }
}

function positionPanel(panel, height, mascotSize, mascotTop, leftHalf, topHalf, tail, rootHeight, rootWidth) {
  const maxTop = Math.max(14, rootHeight - height - 14)
  const top = topHalf
    ? Math.max(14, Math.min(mascotTop + mascotSize + 7, maxTop))
    : Math.max(14, Math.min(mascotTop - height - 7, maxTop))
  panel.style.top = `${top}px`
  panel.style.bottom = 'auto'
  panel.style.left = leftHalf ? 'auto' : '6px'
  panel.style.right = leftHalf ? '6px' : 'auto'
  panel.style.transformOrigin = `${leftHalf ? '85%' : '15%'} ${topHalf ? '0%' : '100%'}`
  if (!tail) return
  const panelWidth = panel.offsetWidth || 380
  const bubbleLeft = leftHalf ? rootWidth - panelWidth - 6 : 6
  const mascotCenter = leftHalf ? mascotSize / 2 - 4 : rootWidth - mascotSize / 2 + 4
  const tailX = Math.max(20, Math.min(panelWidth - 64, mascotCenter - bubbleLeft - 20))
  const tailElement = $('.bubble-tail')
  tailElement.style.left = `${tailX}px`
  tailElement.style.right = 'auto'
  tailElement.style.top = topHalf ? '-17px' : 'auto'
  tailElement.style.bottom = topHalf ? 'auto' : '-19px'
  tailElement.style.transform = topHalf ? 'skewX(-32deg) rotate(-20deg)' : 'skewX(32deg) rotate(20deg)'
}

function resetText(value) {
  if (!value) return '以官方刷新时间为准'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '以官方刷新时间为准'
  return `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)} 重置`
}

function renderUsage() {
  const usage = state.usage
  if (!usage) return
  const windows = usage.windows || {}
  const primaryKey = windows.fiveHour ? 'fiveHour' : windows.monthly ? 'monthly' : 'weekly'
  const primary = windows[primaryKey]
  $('#usage-view').classList.toggle('empty', !primary)
  $('#empty-usage').classList.toggle('hidden', Boolean(primary))
  if (!primary) {
    const noSubscription = usage.code === 'NO_SUBSCRIPTION'
    const needsLogin = /凭据|登录/.test(usage.error || '')
    $('#empty-title').textContent = noSubscription ? '未检测到订阅额度' : needsLogin ? '尚未连接 Kimi Code' : '暂时无法读取用量'
    $('#empty-description').textContent = noSubscription
      ? '当前账号没有可展示的订阅额度。若你已订阅，请在 Kimi Code 中重新登录后重试。'
      : needsLogin
        ? '请先在 Kimi Code 中登录，再点击“同步用量”。未登录时不会显示示例百分比。'
        : '当前没有可显示的历史用量，请检查网络和 Kimi Code 登录状态后重试。'
    elements.plan.textContent = 'Kimi 订阅'
    elements.windows.replaceChildren()
    elements.source.textContent = noSubscription ? '未订阅 · 没有额度数据' : needsLogin ? '未连接 · 没有用量数据' : '读取失败 · 没有历史数据'
    elements.source.title = usage.error || '暂无可显示的用量'
    updateLayout()
    return
  }
  const entries = Object.entries(windows)
  elements.plan.textContent = `${usage.planName}${usage.isDemo ? ' · 演示' : ''}`
  elements.primaryRemaining.textContent = Math.round(primary.remainingPercent)
  elements.primaryLabel.textContent = primary.label || primaryKey
  elements.primaryReset.textContent = resetText(primary.resetsAt)
  elements.ring.style.strokeDashoffset = circumference * (1 - primary.remainingPercent / 100)
  elements.windows.replaceChildren()

  for (const [key, item] of entries) {
    const row = document.createElement('div')
    row.className = `window-row${item.remainingPercent <= 20 ? ' warning' : ''}`
    const name = document.createElement('span')
    name.className = 'window-name'
    const dot = document.createElement('span')
    dot.className = 'window-dot'
    name.append(dot, document.createTextNode(item.label || key))
    const value = document.createElement('span')
    value.className = 'window-value'
    value.textContent = `剩 ${item.remainingPercent}% · 用 ${item.usedPercent}%`
    const progress = document.createElement('div')
    progress.className = 'progress'
    progress.setAttribute('aria-label', `${item.label || key}已使用 ${item.usedPercent}%`)
    const fill = document.createElement('span')
    progress.append(fill)
    row.append(name, value, progress)
    elements.windows.append(row)
    requestAnimationFrame(() => { fill.style.width = `${item.usedPercent}%` })
  }

  const sourceNames = { demo: '演示数据 · 尚未同步', official: '官方实时', manual: '手动同步', 'kimi-code': 'Kimi Code 同步', import: '文件导入', error: '快照读取异常' }
  const updated = usage.updatedAt ? ` · ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(usage.updatedAt))}` : ''
  elements.source.textContent = usage.error
    ? (usage.stale ? '同步失败 · 保留上次数据' : '未连接 · 暂无可显示用量')
    : `${sourceNames[usage.source] || '本地快照'}${updated}`
  elements.source.title = usage.error || (usage.isDemo ? '请在设置中填写官方 /usage 数值' : `快照时间：${usage.updatedAt}`)
  updateLayout()
}

let settingsRevision = 0
let lastLocalUpdate = 0
let refreshTimer = null
let refreshInFlight = null

function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshUsage, 450)
}

async function refreshUsage() {
  if (refreshInFlight) return refreshInFlight
  elements.refresh.classList.add('loading')
  refreshInFlight = (async () => {
    try {
      state.usage = desktop ? await desktop.refreshUsage() : await request('/api/usage')
      renderUsage()
    } catch (error) {
      elements.source.textContent = error.message
    } finally {
      elements.refresh.classList.remove('loading')
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function updateSettings(patch) {
  const revision = ++settingsRevision
  lastLocalUpdate = Date.now()
  const next = desktop
    ? await desktop.updateSettings(patch)
    : await request('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...state.settings, ...patch }) })
  if (revision !== settingsRevision) return next
  state.settings = next
  if (next.layout) state.layout = next.layout
  applySettings()
  updateLayout()
  return next
}

let bubbleMode = 'usage'
let lastMessage = ''
function setBubbleMode(mode) {
  bubbleMode = mode
  $('#usage-view').classList.toggle('hidden', mode !== 'usage')
  $('#message-view').classList.toggle('hidden', mode !== 'message')
  if (mode === 'message') {
    if (state.taskState?.state === 'working') {
      $('#message-text').textContent = randomWorkingMessage()
    } else if (state.taskState?.state === 'completed') {
      $('#message-text').textContent = state.settings.completedText
    } else {
      const messages = state.settings.bubbleMessages?.length ? state.settings.bubbleMessages : ['点我看看用量']
      const choices = messages.filter((message) => message !== lastMessage)
      lastMessage = (choices.length ? choices : messages)[Math.floor(Math.random() * (choices.length || messages.length))]
      $('#message-text').textContent = lastMessage
    }
  }
  updateLayout()
}

async function activateMascot() {
  if (state.taskState?.state === 'completed') {
    if (desktop) await desktop.acknowledgeCompleted()
    else await request('/api/task-state/ack', { method: 'POST' })
    applyTaskState({ state: 'normal', activeCount: 0 })
    setBubbleMode('usage')
    return
  }
  if (state.taskState?.state === 'normal') randomHint()
  if (state.settings.bubbleVisible) {
    setBubbleMode('message')
    return
  }
  setBubbleMode('usage')
  await updateSettings({ bubbleVisible: true })
  scheduleRefresh()
}

function closeBubble() {
  state.settings = { ...state.settings, bubbleVisible: false }
  setBubbleMode('usage')
  applySettings()
  updateLayout()
  updateSettings({ bubbleVisible: false }).catch(() => {})
}

function openSettings() {
  elements.formError.textContent = ''
  elements.settings.classList.remove('hidden')
  updateLayout()
}

function closeSettings() {
  elements.settings.classList.add('hidden')
}

let movePromise = null
let moveDelta = null
function queueMove(delta) {
  moveDelta = moveDelta || { x: 0, y: 0 }
  moveDelta.x += delta.x
  moveDelta.y += delta.y
  if (movePromise) return movePromise
  movePromise = new Promise((resolve) => {
    requestAnimationFrame(async () => {
      const nextDelta = moveDelta
      moveDelta = null
      try {
        const next = await desktop.moveBy(nextDelta)
        if (next && state.layout?.bounds) {
          state.layout.bounds = { ...state.layout.bounds, ...next }
          if (Number.isFinite(state.layout.mascotCenterY)) state.layout.mascotCenterY += nextDelta.y
          if (Number.isFinite(state.layout.mascotCenterX)) state.layout.mascotCenterX += nextDelta.x
          updateLayout()
        }
        resolve(next)
      } catch {
        resolve(null)
      } finally {
        movePromise = null
      }
    })
  })
  return movePromise
}

async function flushMoves() {
  while (movePromise) await movePromise
}

elements.mascot.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return
  event.preventDefault()
  try {
    elements.mascot.setPointerCapture(event.pointerId)
  } catch {}
  playSound('press')
  const rect = elements.widget.getBoundingClientRect()
  const mascotRect = elements.mascot.getBoundingClientRect()
  if (desktop) {
    if (!state.layout) state.layout = await desktop.getLayout()
    const { bounds } = state.layout
    const center = {
      x: bounds.x + mascotRect.left + mascotRect.width / 2,
      y: bounds.y + mascotRect.top + mascotRect.height / 2,
    }
    state.layout.mascotCenterX = center.x
    state.layout.mascotCenterY = center.y
    desktop.setMascotCenter(center)
  }
  elements.mascot.classList.add('pressed')
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.screenX,
    lastY: event.screenY,
    left: rect.left,
    top: rect.top,
    moved: false,
  }
  if (desktop) desktop.setInteractive(true)
})

elements.mascot.addEventListener('pointermove', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY
  if (dx * dx + dy * dy > 9) drag.moved = true
  if (!drag.moved) return
  if (desktop) {
    queueMove({ x: event.screenX - drag.lastX, y: event.screenY - drag.lastY })
  } else {
    elements.widget.style.right = 'auto'
    elements.widget.style.bottom = 'auto'
    elements.widget.style.left = `${drag.left + dx}px`
    elements.widget.style.top = `${drag.top + dy}px`
    state.layout = null
    updateLayout()
  }
  drag.lastX = event.screenX
  drag.lastY = event.screenY
})

async function endDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return
  const moved = drag.moved
  const cancelled = event.type === 'pointercancel'
  drag = null
  elements.mascot.classList.remove('pressed')
  if (!cancelled) playSound('release')
  try {
    if (elements.mascot.hasPointerCapture(event.pointerId)) elements.mascot.releasePointerCapture(event.pointerId)
  } catch {}
  if (moved) {
    if (desktop) {
      await flushMoves()
      const result = await desktop.snap()
      if (result?.layout) state.layout = result.layout
      updateLayout()
    }
  } else if (!cancelled) {
    activateMascot()
  }
}

let hoverArmed = true
elements.mascot.addEventListener('pointerup', endDrag)
elements.mascot.addEventListener('pointercancel', endDrag)
elements.mascot.addEventListener('lostpointercapture', endDrag)
elements.mascot.addEventListener('pointerenter', () => {
  if (!hoverArmed) return
  hoverArmed = false
  randomHint()
})
elements.mascot.addEventListener('pointerleave', () => { hoverArmed = true })
$('#hide-button').addEventListener('click', closeBubble)
$('#message-back').addEventListener('click', () => setBubbleMode('usage'))
$('#plugin-entry').addEventListener('click', () => {
  if (desktop) desktop.openStudio()
  else window.open('/config#plugins', '_blank', 'noopener')
})
$('#settings-button').addEventListener('click', openSettings)
$('#sync-button').addEventListener('click', openSettings)
$('#settings-close').addEventListener('click', closeSettings)
elements.refresh.addEventListener('click', refreshUsage)
$('#scale-input').addEventListener('input', (event) => { $('#scale-output').value = `${Math.round(Number(event.target.value) * 100)}%` })
$('#scale-input').addEventListener('change', (event) => updateSettings({ scale: Number(event.target.value) }))
$('#sound-set-input').addEventListener('change', async (event) => {
  await updateSettings({ soundSet: event.target.value })
  playSound('press')
})
$('#sound-volume-input').addEventListener('input', (event) => { $('#sound-volume-output').value = `${Math.round(Number(event.target.value) * 100)}%` })
$('#sound-volume-input').addEventListener('change', async (event) => {
  await updateSettings({ soundVolume: Number(event.target.value) })
  playSound('press')
})
$('#top-input').addEventListener('change', (event) => updateSettings({ alwaysOnTop: event.target.checked }))
$('#startup-input').addEventListener('change', (event) => updateSettings({ autoStart: event.target.checked }))
$('#official-button').addEventListener('click', () => {
  if (desktop) desktop.openStudio()
  else window.open('/config', '_blank', 'noopener')
})
$('#cloud-login').addEventListener('click', async () => {
  if (!desktop) return
  const username = $('#cloud-username').value.trim()
  const password = $('#cloud-password').value
  if (!username || !password) {
    $('#cloud-status').textContent = '请输入公共账号用户名和密码'
    return
  }
  $('#cloud-status').textContent = '正在登录并同步...'
  try {
    state.cloud = await desktop.cloudLogin({ username, password })
    $('#cloud-password').value = ''
    await loadState()
  } catch (error) {
    $('#cloud-status').textContent = error.message
  }
})
$('#cloud-sync').addEventListener('click', async () => {
  if (!desktop) return
  $('#cloud-status').textContent = '正在同步...'
  state.cloud = await desktop.cloudSync()
  await loadState()
})
$('#cloud-logout').addEventListener('click', async () => {
  if (!desktop) return
  state.cloud = await desktop.cloudLogout()
  renderCloudStatus()
})

async function openApplication(id) {
  if (!desktop) {
    const customUrl = state.settings.shortcuts[id]?.url
    window.open(customUrl || (id === 'kimi' ? 'https://www.kimi.com/' : 'https://www.kimi.com/code'), '_blank', 'noopener')
    return
  }
  const result = await desktop.openApp(id)
  elements.source.textContent = result.ok ? `已请求打开${id === 'kimi' ? ' Kimi' : ' Kimi Code'}` : result.error
  if (!result.ok) elements.source.title = '可在环境变量 KIMI_APP_PATH 或 KIMI_CODE_APP_PATH 中指定应用路径'
  setTimeout(renderUsage, 2200)
}

$('#open-kimi').addEventListener('click', () => openApplication('kimi'))
$('#open-kimi-code').addEventListener('click', () => openApplication('kimi-code'))
$('#close-widget').addEventListener('click', () => { if (desktop) desktop.close() })

let lastInteractive = null
document.addEventListener('pointermove', (event) => {
  if (!desktop || drag) return
  const interactive = Boolean(event.target.closest('.bubble, .settings-panel, #mascot'))
  if (interactive === lastInteractive) return
  lastInteractive = interactive
  desktop.setInteractive(interactive)
})
document.addEventListener('pointerleave', () => { if (desktop && !drag) desktop.setInteractive(false) })
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!elements.settings.classList.contains('hidden')) closeSettings()
    else if (state.settings.bubbleVisible) closeBubble()
  }
})
window.addEventListener('resize', updateLayout)
if (desktop) {
  desktop.onConfigChanged(() => {
    if (Date.now() - lastLocalUpdate > 600) loadState().catch(() => {})
  })
  desktop.onTaskStateChanged((snapshot) => applyTaskState(snapshot))
  desktop.onCloudStatus((status) => {
    state.cloud = status
    renderCloudStatus()
  })
}

if (!desktop) setInterval(async () => {
  try {
    const next = await request('/api/state')
    applyTaskState(next.taskState)
  } catch {}
}, 2000)

loadState().catch((error) => {
  elements.source.textContent = error.message
  elements.primaryLabel.textContent = '暂时无法读取'
})
setInterval(refreshUsage, 60000)
