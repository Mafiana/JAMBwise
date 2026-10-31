// Converts question .json files into CSV files in the JAMBwise template format.
//
// Usage (from the JAMBwise folder):
//   node scripts/json-to-csv.mjs "C:\Users\YOU\Desktop\DEEPSEEK"
// It reads every .json file in that folder and writes one .csv per file into a "csv" subfolder,
// plus ALL-QUESTIONS.csv with everything together.  (The admin import takes at most 2000 questions
// and 2 MB per file, so use the per-subject files to import; the combined file is for your own records.)
// Subject is read from each question's "subject"; if the question has none, it is guessed from the file name
// (e.g. "Chemistry DEEPSEEK - 300.json" -> chm).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
// Repairs text where UTF-8 was wrongly read as the PT154 (Cyrillic) code page, e.g. "вӮӮ" should be "₂".
const PT154 = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u007f\u0496\u0492\u04ee\u0493\u201e\u2026\u04b6\u04ae\u04b2\u04af\u04a0\u04e2\u04a2\u049a\u04ba\u04b8\u0497\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u04b3\u04b7\u04a1\u04e3\u04a3\u049b\u04bb\u04b9\u00a0\u040e\u045e\u0408\u04e8\u0498\u04b0\u00a7\u0401\u00a9\u04d8\u00ab\u00ac\u04ef\u00ae\u049c\u00b0\u04b1\u0406\u0456\u0499\u04e9\u00b6\u00b7\u0451\u2116\u04d9\u00bb\u0458\u04aa\u04ab\u049d\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f"
const rev = new Map([...PT154].map((c, i) => [c, i]))
function fixMojibake(text) {
  return text.replace(/[^\x00-\x7f]{2,}/g, (m) => {
    const bytes = [...m].map((c) => rev.get(c))
    if (bytes.some((b) => b === undefined)) return m
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)) } catch { return m }
  })
}
import { parseQuestionFile, normaliseSubject, TEMPLATE_HEADERS } from '../src/lib/importQuestions.js'

const dir = process.argv[2]
if (!dir) { console.log('Tell me the folder, e.g.  node scripts/json-to-csv.mjs "C:\\Users\\YOU\\Desktop\\DEEPSEEK"'); process.exit(1) }

const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const toCsv = (rows) => '\uFEFF' + [TEMPLATE_HEADERS.join(','), ...rows.map((r) =>
  [r.subject, r.body, r.options[0], r.options[1], r.options[2], r.options[3], 'ABCD'[r.answer], r.explanation].map(esc).join(','))].join('\r\n') + '\r\n'

// "Use of English 600 - DEEPSEEK" -> try the longest leading run of words that is a subject name
function guessSubject(file) {
  const words = basename(file).replace(/\.json$/i, '').replace(/[^A-Za-z ]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean)
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const s = normaliseSubject(words.slice(0, n).join(' '))
    if (s) return s
  }
  return ''
}

const out = join(dir, 'csv')
mkdirSync(out, { recursive: true })
const all = []
let problems = 0
for (const f of readdirSync(dir).filter((x) => /\.json$/i.test(x)).sort()) {
  const res = parseQuestionFile(fixMojibake(readFileSync(join(dir, f), 'utf8')), f, guessSubject(f))
  if (res.error) { console.log(`✗ ${f}: ${res.error}`); problems++; continue }
  const good = res.rows.filter((r) => !r.error)
  const bad = res.rows.filter((r) => r.error)
  writeFileSync(join(out, f.replace(/\.json$/i, '.csv')), toCsv(good))
  all.push(...good)
  console.log(`✓ ${f}: ${good.length} questions${bad.length ? `, ${bad.length} skipped` : ''}`)
  for (const b of bad.slice(0, 5)) console.log(`    question ${b.line}: ${b.error}`)
  if (bad.length > 5) console.log(`    …and ${bad.length - 5} more skipped`)
  problems += bad.length
}
writeFileSync(join(out, 'ALL-QUESTIONS.csv'), toCsv(all))
console.log(`\nDone: ${all.length} questions written to ${out}`)
if (problems) console.log('Some questions were skipped (reasons above). Send me one of those lines if you want help fixing them.')
