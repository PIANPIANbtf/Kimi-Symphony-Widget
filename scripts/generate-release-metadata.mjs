import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const platform = process.argv[2]
if (!['win', 'mac'].includes(platform)) throw new Error('用法：node scripts/generate-release-metadata.mjs win|mac')
const root = path.resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const config = JSON.parse(await fs.readFile(path.join(root, 'release.config.json'), 'utf8'))
const asset = platform === 'win' ? config.windowsAsset : config.macAsset
const file = path.join(root, 'release', asset)
const bytes = await fs.readFile(file)
const sha512 = createHash('sha512').update(bytes).digest('base64')
const metadata = [
  `version: ${packageJson.version}`,
  'files:',
  `  - url: ${asset}`,
  `    sha512: ${sha512}`,
  `    size: ${bytes.length}`,
  `path: ${asset}`,
  `sha512: ${sha512}`,
  `size: ${bytes.length}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n')
const target = path.join(root, 'release', platform === 'win' ? 'latest.yml' : 'latest-mac.yml')
await fs.writeFile(target, metadata)
console.log(`Generated ${path.basename(target)} for ${asset}`)
