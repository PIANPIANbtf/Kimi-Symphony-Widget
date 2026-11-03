const $ = (selector) => document.querySelector(selector)
let state
let toastTimer

function toast(message, error = false) {
  const element = $('#toast')
  element.textContent = message
  element.classList.toggle('error', error)
  element.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600)
}

async function request(path, options) {
  const response = await fetch(path, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

function renderProject(project) {
  for (const [selector, url] of [['#download-windows', project.downloads.windows], ['#download-mac', project.downloads.mac]]) {
    const link = $(selector)
    if (url) link.href = url
    else link.removeAttribute('href')
    link.classList.toggle('disabled', !url)
    link.title = url ? '始终下载 GitHub 最新 Release' : '上传 GitHub 前，请先配置 release.config.json'
  }
  $('#release-status').textContent = `当前 v${project.version} · 配置仅保存在本机`
  $('#check-update').disabled = !project.configured
  $('#apply-update').disabled = !project.configured
  $('#project-footer').textContent = `Kimi Symphony Widget v${project.version} · 本地配置中心`
  const references = $('#project-references')
  references.replaceChildren()
  for (const reference of project.references) {
    const link = document.createElement('a')
    link.textContent = reference.label
    link.href = reference.url
    link.target = '_blank'
    link.rel = 'noopener'
    references.append(link)
  }
}

async function loadState() {
  const [nextState, announcement, project] = await Promise.all([request('/api/state'), request('/api/announcement'), request('/api/project')])
  state = nextState
  renderProject(project)
  $('#announcement-text').textContent = announcement.text || '暂无公告。'
  $('#announcement-input').value = announcement.text
  $('#announcement-time').textContent = announcement.updatedAt ? `更新于 ${new Date(announcement.updatedAt).toLocaleString('zh-CN')}` : '所有人都可以阅读'
  const settings = state.settings
  $('#scale').value = settings.scale
  $('#scale-output').value = `${Math.round(settings.scale * 100)}%`
  $('#sound-set').value = settings.soundSet
  $('#sound-volume').value = settings.soundVolume
  $('#sound-volume').disabled = settings.soundSet === 'mute'
  $('#volume-output').value = `${Math.round(settings.soundVolume * 100)}%`
  $('#always-on-top').checked = settings.alwaysOnTop
  $('#auto-start').checked = settings.autoStart
  $('#custom-option').hidden = !state.customSounds
  $('#custom-option').disabled = !state.customSounds
  $('#mascot-preview').src = state.mascotUrl ? `${state.mascotUrl}?t=${Date.now()}` : '/assets/kimi-nyan.png'
  $('#working-preview').src = state.workingImageUrl ? `${state.workingImageUrl}?t=${Date.now()}` : '/assets/working.png'
  $('#completed-preview').src = state.completedImageUrl ? `${state.completedImageUrl}?t=${Date.now()}` : '/assets/completed.png'
  $('#bubble-messages').value = settings.bubbleMessages.join('\n')
  $('#working-text').value = (settings.workingMessages || [settings.workingText]).join('\n')
  $('#completed-text').value = settings.completedText
  const theme = document.querySelector(`input[name="bubble-theme"][value="${settings.bubbleTheme}"]`)
  if (theme) theme.checked = true
  $('#module-summary').checked = settings.modules.summary
  $('#module-reset').checked = settings.modules.resetTime
  $('#module-apps').checked = settings.modules.appButtons
  $('#module-source').checked = settings.modules.source
  $('#shortcut-kimi-label').value = settings.shortcuts.kimi.label
  $('#shortcut-kimi-url').value = settings.shortcuts.kimi.url
  $('#shortcut-kimi-path').value = settings.shortcuts.kimi.path
  $('#shortcut-code-label').value = settings.shortcuts['kimi-code'].label
  $('#shortcut-code-url').value = settings.shortcuts['kimi-code'].url
  $('#shortcut-code-path').value = settings.shortcuts['kimi-code'].path
  renderPlugins()
}

function renderPlugins() {
  const list = $('#plugin-list')
  list.replaceChildren()
  if (!state.settings.plugins.length) {
    const empty = document.createElement('p')
    empty.className = 'plugin-empty'
    empty.textContent = '尚未添加插件。添加后，小按钮会出现在弹窗文案区域下方。'
    list.append(empty)
    return
  }
  for (const plugin of state.settings.plugins) {
    const row = document.createElement('div')
    row.className = 'plugin-row'
    const info = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = plugin.name
    const url = document.createElement('small')
    url.textContent = plugin.url
    info.append(name, url)
    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.checked = plugin.enabled
    toggle.title = '启用或停用插件'
    toggle.addEventListener('change', () => run(async () => {
      await saveSettings({ plugins: state.settings.plugins.map((item) => item.id === plugin.id ? { ...item, enabled: toggle.checked } : item) })
    }, '插件状态已更新'))
    const open = document.createElement('a')
    open.textContent = '打开'
    open.href = plugin.url
    open.target = '_blank'
    open.rel = 'noopener'
    const remove = document.createElement('button')
    remove.className = 'secondary'
    remove.textContent = '删除'
    remove.addEventListener('click', () => run(async () => {
      await saveSettings({ plugins: state.settings.plugins.filter((item) => item.id !== plugin.id) })
    }, '插件已删除'))
    row.append(info, toggle, open, remove)
    list.append(row)
  }
}

async function saveSettings(patch) {
  state.settings = await request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (patch.plugins) renderPlugins()
  return state.settings
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

async function run(action, success) {
  try {
    await action()
    toast(success)
  } catch (error) {
    toast(error.message, true)
  }
}

$('#scale').addEventListener('input', (event) => { $('#scale-output').value = `${Math.round(Number(event.target.value) * 100)}%` })
$('#sound-volume').addEventListener('input', (event) => { $('#volume-output').value = `${Math.round(Number(event.target.value) * 100)}%` })
$('#sound-set').addEventListener('change', (event) => { $('#sound-volume').disabled = event.target.value === 'mute' })
$('#general-form').addEventListener('submit', (event) => {
  event.preventDefault()
  run(() => saveSettings({
    scale: Number($('#scale').value),
    soundSet: $('#sound-set').value,
    soundVolume: Number($('#sound-volume').value),
    alwaysOnTop: $('#always-on-top').checked,
    autoStart: $('#auto-start').checked,
  }), '基础设置已同步到挂件')
})
$('#mascot-file').addEventListener('change', (event) => {
  $('#mascot-file-name').textContent = event.target.files[0]?.name || '尚未选择文件'
})
$('#upload-mascot').addEventListener('click', () => run(async () => {
  const file = $('#mascot-file').files[0]
  if (!file) throw new Error('请先选择 PNG 或 JPEG 图片')
  await request('/api/assets/mascot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: await fileData(file) }) })
  await loadState()
}, '新形象已应用到挂件'))
$('#reset-mascot').addEventListener('click', () => run(async () => {
  await request('/api/assets/mascot', { method: 'DELETE' })
  await loadState()
}, '已恢复原版 Kimi 娘'))
for (const kind of ['working', 'completed']) {
  $(`#upload-${kind}`).addEventListener('click', () => run(async () => {
    const file = $(`#${kind}-file`).files[0]
    if (!file) throw new Error('请先选择一张形象图片')
    await request(`/api/assets/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: await fileData(file) }) })
    await loadState()
  }, `${kind === 'working' ? '工作' : '完成'}形象已更新`))
  $(`#reset-${kind}`).addEventListener('click', () => run(async () => {
    await request(`/api/assets/${kind}`, { method: 'DELETE' })
    await loadState()
  }, '已恢复默认特殊形象'))
}

$('#save-messages').addEventListener('click', () => run(async () => {
  const bubbleMessages = $('#bubble-messages').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!bubbleMessages.length) throw new Error('请至少保留一条随机文字')
  await saveSettings({
    bubbleMessages,
    workingText: $('#working-text').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '别吵，在思考...',
    workingMessages: $('#working-text').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    completedText: $('#completed-text').value.trim() || '完成...',
  })
}, '随机文字已保存'))
$('#restore-messages').addEventListener('click', () => run(async () => {
  const defaults = await request('/api/defaults')
  $('#bubble-messages').value = defaults.bubbleMessages.join('\n')
  await saveSettings({ bubbleMessages: defaults.bubbleMessages })
}, '已恢复参考文案'))
$('#save-modules').addEventListener('click', () => run(() => saveSettings({
  bubbleTheme: document.querySelector('input[name="bubble-theme"]:checked')?.value || 'compact',
  modules: {
    summary: $('#module-summary').checked,
    resetTime: $('#module-reset').checked,
    appButtons: $('#module-apps').checked,
    source: $('#module-source').checked,
  },
}), '弹窗模块已更新'))
$('#save-shortcuts').addEventListener('click', () => run(() => saveSettings({
  shortcuts: {
    kimi: { label: $('#shortcut-kimi-label').value.trim() || '打开 Kimi', url: $('#shortcut-kimi-url').value.trim(), path: $('#shortcut-kimi-path').value.trim() },
    'kimi-code': { label: $('#shortcut-code-label').value.trim() || '打开 Kimi Code', url: $('#shortcut-code-url').value.trim(), path: $('#shortcut-code-path').value.trim() },
  },
}), '应用入口已保存'))
$('#add-plugin').addEventListener('click', () => run(async () => {
  const name = $('#plugin-name').value.trim()
  const url = $('#plugin-url').value.trim()
  if (!name) throw new Error('请填写插件名称')
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('插件网址必须使用 http 或 https')
  const plugin = { id: `plugin-${Date.now()}`, name, url: parsed.toString(), enabled: true }
  await saveSettings({ plugins: [...state.settings.plugins, plugin] })
  $('#plugin-name').value = ''
  $('#plugin-url').value = ''
}, '插件已添加'))
$('#upload-sounds').addEventListener('click', () => run(async () => {
  const press = $('#press-file').files[0]
  const release = $('#release-file').files[0]
  if (!press || !release) throw new Error('请分别选择按下和松开的 MP3 文件')
  await request('/api/assets/sounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ press: await fileData(press), release: await fileData(release) }),
  })
  await saveSettings({ soundSet: 'custom' })
  await loadState()
}, '自定义音效已启用'))
$('#reset-sounds').addEventListener('click', () => run(async () => {
  await request('/api/assets/sounds', { method: 'DELETE' })
  await saveSettings({ soundSet: 'chime' })
  await loadState()
}, '已删除自定义音效并恢复 Kimi 风铃'))

$('#save-announcement').addEventListener('click', () => run(async () => {
  await request('/api/announcement', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: $('#announcement-input').value, key: $('#announcement-key').value }),
  })
  $('#announcement-key').value = ''
  await loadState()
}, '公告已保存并对所有读者可见'))

async function latestRelease() {
  const release = await request('/api/update/check', { method: 'POST' })
  $('#release-status').textContent = release.updateAvailable
    ? `发现 v${release.latestVersion}，当前 v${release.version}`
    : `当前 v${release.version} 已是最新版本`
  return release
}

$('#check-update').addEventListener('click', () => run(latestRelease, '版本检查完成'))
$('#apply-update').addEventListener('click', () => run(async () => {
  const release = await latestRelease()
  if (!release.updateAvailable) return
  $('#release-status').textContent = `正在下载并校验 v${release.latestVersion}...`
  const result = await request('/api/update/apply', { method: 'POST' })
  $('#release-status').textContent = result.message
}, '更新已准备完成，挂件将自动重启'))

loadState().catch((error) => toast(error.message, true))
