// Run with:  node check-imports.mjs
// Lists every import in src/ that points to a file that does not exist (the cause of "Failed to resolve import" and blank pages).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) && files.push(p) } }
walk('src')

const missing = []
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[1].split('?')[0])
    const ok = existsSync(target) && statSync(target).isFile()
    const withExt = ['.js', '.jsx', '.json'].some((e) => existsSync(target + e))
    if (!ok && !withExt) missing.push(`${f}  needs  ${m[1]}`)
  }
}
const need = ['package.json', 'index.html', 'vite.config.js', 'src/main.jsx', 'src/App.jsx', 'src/index.css']
for (const n of need) if (!existsSync(n)) missing.push(`project is missing ${n}`)

if (missing.length) { console.log('MISSING FILES:\n' + [...new Set(missing)].map((x) => '  - ' + x).join('\n')); process.exit(1) }
console.log('All imports found. If the page still does not show, send me the red error from the terminal and the browser console (F12).')
