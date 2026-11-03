import fs from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from './paths.mjs'

const mascotCandidates = [
  ['custom-mascot.png', 'image/png'],
  ['custom-mascot.jpg', 'image/jpeg'],
  ['custom-mascot.jpeg', 'image/jpeg'],
]

function decodeDataUrl(dataUrl, prefix, maxBytes) {
  const match = new RegExp(`^data:(${prefix});base64,([A-Za-z0-9+/=]+)$`).exec(String(dataUrl || ''))
  if (!match) throw new Error('文件格式或编码不受支持')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`文件大小必须在 1 字节到 ${Math.floor(maxBytes / 1024 / 1024)} MB 之间`)
  return { mime: match[1], bytes }
}

async function exists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export async function saveMascot(dataUrl) {
  const { mime, bytes } = decodeDataUrl(dataUrl, 'image/(?:png|jpeg)', 3 * 1024 * 1024)
  if (mime === 'image/png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('PNG 文件内容无效')
  if (mime === 'image/jpeg' && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) throw new Error('JPEG 文件内容无效')
  await fs.mkdir(dataDir, { recursive: true })
  for (const [name] of mascotCandidates) await fs.unlink(path.join(dataDir, name)).catch(() => {})
  const file = path.join(dataDir, mime === 'image/png' ? 'custom-mascot.png' : 'custom-mascot.jpg')
  await fs.writeFile(file, bytes, { mode: 0o600 })
}

export async function saveSounds(press, release) {
  const first = decodeDataUrl(press, 'audio/mpeg', 2 * 1024 * 1024)
  const second = decodeDataUrl(release, 'audio/mpeg', 2 * 1024 * 1024)
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, 'custom-press.mp3'), first.bytes, { mode: 0o600 })
  await fs.writeFile(path.join(dataDir, 'custom-release.mp3'), second.bytes, { mode: 0o600 })
}

export async function removeMascot() {
  for (const [name] of mascotCandidates) await fs.unlink(path.join(dataDir, name)).catch(() => {})
}

export async function saveStateMascot(kind, dataUrl) {
  if (!['working', 'completed'].includes(kind)) throw new Error('不支持的特殊形象类型')
  const { mime, bytes } = decodeDataUrl(dataUrl, 'image/(?:png|jpeg)', 3 * 1024 * 1024)
  if (mime === 'image/png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('PNG 文件内容无效')
  if (mime === 'image/jpeg' && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) throw new Error('JPEG 文件内容无效')
  await fs.mkdir(dataDir, { recursive: true })
  await removeStateMascot(kind)
  await fs.writeFile(path.join(dataDir, `custom-${kind}.${mime === 'image/png' ? 'png' : 'jpg'}`), bytes, { mode: 0o600 })
}

export async function removeStateMascot(kind) {
  if (!['working', 'completed'].includes(kind)) return
  for (const extension of ['png', 'jpg', 'jpeg']) await fs.unlink(path.join(dataDir, `custom-${kind}.${extension}`)).catch(() => {})
}

export async function removeSounds() {
  await fs.unlink(path.join(dataDir, 'custom-press.mp3')).catch(() => {})
  await fs.unlink(path.join(dataDir, 'custom-release.mp3')).catch(() => {})
}

async function readAsset(file, mime, dataUrls) {
  if (dataUrls) return `data:${mime};base64,${await fs.readFile(file, 'base64')}`
  return file
}

export async function getCustomAssets(dataUrls = false) {
  let mascot = null
  for (const [name, mime] of mascotCandidates) {
    const file = path.join(dataDir, name)
    if (await exists(file)) {
      mascot = { mime, value: await readAsset(file, mime, dataUrls) }
      break
    }
  }
  const pressFile = path.join(dataDir, 'custom-press.mp3')
  const releaseFile = path.join(dataDir, 'custom-release.mp3')
  const hasPress = await exists(pressFile)
  const hasRelease = await exists(releaseFile)
  const stateMascot = async (kind) => {
    for (const extension of ['png', 'jpg', 'jpeg']) {
      const file = path.join(dataDir, `custom-${kind}.${extension}`)
      if (await exists(file)) return { mime: extension === 'png' ? 'image/png' : 'image/jpeg', value: await readAsset(file, extension === 'png' ? 'image/png' : 'image/jpeg', dataUrls) }
    }
    return null
  }
  return {
    mascot,
    working: await stateMascot('working'),
    completed: await stateMascot('completed'),
    sounds: hasPress && hasRelease ? {
      press: await readAsset(pressFile, 'audio/mpeg', dataUrls),
      release: await readAsset(releaseFile, 'audio/mpeg', dataUrls),
    } : null,
  }
}
