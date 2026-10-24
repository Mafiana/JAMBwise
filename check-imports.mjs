// Run with:  node check-imports.mjs
// 1) lists imports that point to a file that does not exist
// 2) lists names imported from a file that does not export them (a file that is an OLD version)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) && files.push(p) } }
walk('src')

const resolveFile = (from, spec) => {
  const base = resolve(dirname(from), spec.split('?')[0])
  for (const c of [base, base + '.js', base + '.jsx', base + '.json']) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}
const exportsOf = (file) => {
  const t = readFileSync(file, 'utf8')
  const names = new Set()
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1])
  for (const m of t.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach((s) => { const n = s.trim().split(/\s+as\s+/).pop(); if (n) names.add(n) })
  if (/export\s+default/.test(t)) names.add('default')
  return names
}

const missing = []
const wrong = []
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/import\s+([^'";]*?)\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolveFile(f, m[2])
    if (!target) { missing.push(`${f}  needs  ${m[2]}`); continue }
    if (!/\.jsx?$/.test(target)) continue
    const have = exportsOf(target)
    const clause = m[1]
    const named = clause.match(/\{([^}]*)\}/)
    if (named) for (const part of named[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n && !have.has(n)) wrong.push(`${f}  imports { ${n} } from ${m[2]}, but that file does not have it (old version?)`) }
    if (/^[A-Za-z0-9_$]+/.test(clause.trim()) && !have.has('default')) wrong.push(`${f}  imports the default from ${m[2]}, but that file has no default export (old version?)`)
  }
  for (const m of text.matchAll(/import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) if (!resolveFile(f, m[1])) missing.push(`${f}  needs  ${m[1]}`)
}
for (const n of ['package.json', 'index.html', 'vite.config.js', 'src/main.jsx', 'src/App.jsx', 'src/index.css']) if (!existsSync(n)) missing.push(`project is missing ${n}`)

let bad = false
if (missing.length) { bad = true; console.log('MISSING FILES:\n' + [...new Set(missing)].map((x) => '  - ' + x).join('\n')) }
if (wrong.length) { bad = true; console.log('\nOLD OR WRONG FILES (copy the newest version of the file named after "from"):\n' + [...new Set(wrong)].map((x) => '  - ' + x).join('\n')) }
if (!bad) console.log('All files found and all imports match. If the page still does not show, send me the red error from the terminal and from the browser console (F12).')
process.exit(bad ? 1 : 0)
