const $ = selector => document.querySelector(selector)
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

async function load() {
  const [project, announcement] = await Promise.all([request('/api/project'), request('/api/announcement')])
  $('#version').textContent = `v${project.version}`
  $('#download-windows').href = project.downloads.windows
  $('#release-page').href = project.releaseUrl
  $('#source-link').href = project.repository
  $('#release-status').textContent = '下载链接始终指向 GitHub 最新 Release'
  $('#announcement-text').textContent = announcement.text || '暂无公告。'
  $('#announcement-input').value = announcement.text || ''
  $('#announcement-time').textContent = announcement.updatedAt ? `更新于 ${new Date(announcement.updatedAt).toLocaleString('zh-CN')}` : '所有人都可以阅读'
  const links = $('#project-links')
  for (const reference of project.references) {
    const link = document.createElement('a')
    link.textContent = reference.label
    link.href = reference.url
    link.target = '_blank'
    link.rel = 'noopener'
    links.append(link)
  }
}

async function run(action, success) {
  try {
    await action()
    toast(success)
  } catch (error) {
    toast(error.message, true)
  }
}

$('#check-update').addEventListener('click', () => run(async () => {
  const release = await request('/api/update/check')
  $('#release-status').textContent = release.latestVersion
    ? `最新发布：v${release.latestVersion} · 当前网站版本：v${release.version}`
    : release.message || '尚未发现 Release'
}, '版本检查完成'))

$('#save-announcement').addEventListener('click', () => run(async () => {
  await request('/api/announcement', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: $('#announcement-input').value, key: $('#announcement-key').value }),
  })
  $('#announcement-key').value = ''
  const announcement = await request('/api/announcement')
  $('#announcement-text').textContent = announcement.text || '暂无公告。'
  $('#announcement-time').textContent = `更新于 ${new Date(announcement.updatedAt).toLocaleString('zh-CN')}`
}, '公共公告已保存'))

load().catch(error => toast(error.message, true))
