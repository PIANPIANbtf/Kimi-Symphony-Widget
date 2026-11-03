import fs from 'node:fs/promises'
import { writeUsage } from '../lib/usage.mjs'
import { usageFile } from '../lib/paths.mjs'

const file = process.argv[2]
if (!file) {
  console.error('用法：node scripts/import-usage.mjs <用量快照.json>')
  process.exit(1)
}

const input = JSON.parse(await fs.readFile(file, 'utf8'))
const usage = await writeUsage(input, 'import')
console.log(`已更新 ${usageFile}`)
console.log(JSON.stringify(usage, null, 2))
