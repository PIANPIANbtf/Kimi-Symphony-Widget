import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const releaseConfig = JSON.parse(await fs.readFile(path.join(root, 'release.config.json'), 'utf8'))
const repository = String(process.env.KIMI_SYMPHONY_REPOSITORY || releaseConfig.repository || '').trim()

export const projectVersion = packageJson.version
export const projectReferences = [
  {
    label: '交互参考：dsh-whale-widget',
    url: 'https://github.com/NieRMHY/dsh-whale-widget',
  },
  {
    label: '常态形象来源：zcode-fox-widget',
    url: 'https://github.com/pigeon189/zcode-fox-widget',
  },
  {
    label: '完整素材与许可说明',
    url: '/NOTICE',
  },
]

export function hasRepository() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
}

export function downloadUrl(platform) {
  if (!hasRepository()) return ''
  const asset = platform === 'darwin' ? releaseConfig.macAsset : releaseConfig.windowsAsset
  return `https://github.com/${repository}/releases/latest/download/${asset}`
}

export function getProjectInfo() {
  return {
    name: packageJson.productName || 'Kimi Symphony Widget',
    version: packageJson.version,
    repository: hasRepository() ? `https://github.com/${repository}` : '',
    configured: hasRepository(),
    releaseUrl: hasRepository() ? `https://github.com/${repository}/releases/latest` : '',
    downloads: {
      windows: downloadUrl('win32'),
      mac: downloadUrl('darwin'),
    },
    references: projectReferences,
    storage: '本机用户目录',
  }
}

export function repositoryName() {
  return hasRepository() ? repository : ''
}
