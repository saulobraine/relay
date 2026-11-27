import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const distDir = resolve('dist')
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

const entries = readdirSync(distDir, { withFileTypes: true })
const exeFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.exe'))
  .map((entry) => entry.name)
  .sort()

if (exeFiles.length === 0) {
  console.warn('generate-checksums: Nenhum arquivo .exe encontrado em dist/')
}

const lines = exeFiles.map((filename) => {
  const filePath = join(distDir, filename)
  const buffer = readFileSync(filePath)
  const hash = createHash('sha256').update(buffer).digest('hex').toUpperCase()
  return `${hash}  ${filename}`
})

const outputPath = join(distDir, 'SHA256SUMS.txt')
writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8')
console.log(`Gerado: ${outputPath}`)
lines.forEach((line) => console.log(`  ${line}`))
