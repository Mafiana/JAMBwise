import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { breakdown, buildScoresheet, latestMocks, scoreStats } from '../src/lib/scoresheet.js'
import { buildTablePdf, fit, textWidth, toLatin } from '../src/lib/pdf.js'

const students = [
  { id: 'a', full_name: 'Ada Obi', reg_number: 'JW-1', email: 'a@x.com', school: 'UI' },
  { id: 'b', full_name: 'Bayo Ade', reg_number: 'JW-2', email: 'b@x.com', school: '' },
  { id: 'c', full_name: 'Chi Eze', reg_number: 'JW-3', email: 'c@x.com', school: '' },
  { id: 'd', full_name: 'Dayo (never wrote)', reg_number: 'JW-4', email: 'd@x.com', school: '' },
]
const t0 = '2026-10-10T10:00:00.000Z', t1 = '2026-10-10T10:00:00.400Z'
const rows = [
  { id: 1, user_id: 'a', subject: 'eng', correct: 15, total: 20, kind: 'mock', mock_score: 290, created_at: t0 },
  { id: 2, user_id: 'a', subject: 'mat', correct: 18, total: 20, kind: 'mock', mock_score: null, created_at: t1 },
  { id: 3, user_id: 'b', subject: 'eng', correct: 10, total: 20, kind: 'mock', mock_score: 200, created_at: t0 },
  { id: 4, user_id: 'c', subject: 'eng', correct: 10, total: 20, kind: 'mock', mock_score: 200, created_at: t0 },
  { id: 5, user_id: 'd', subject: 'eng', correct: 5, total: 20, kind: 'practice', mock_score: null, created_at: t0 },
  { id: 6, user_id: 'zz', subject: 'eng', correct: 5, total: 20, kind: 'mock', mock_score: 100, created_at: t0 }, // deleted student
]

test('ranks best first, ties share a rank, practice and unknown students are left out', () => {
  const s = buildScoresheet(students, rows)
  assert.deepEqual(s.map((r) => [r.name, r.total, r.rank]), [['Ada Obi', 290, 1], ['Bayo Ade', 200, 2], ['Chi Eze', 200, 2]])
})
test('subject rows of the same mock are grouped, English first', () => {
  const s = buildScoresheet(students, rows)
  assert.equal(breakdown(s[0]), 'ENG 15/20   MAT 18/20')
})
test('takes the newest mock when an old one exists (after an admin allowed a retake)', () => {
  const later = [...rows, { id: 9, user_id: 'b', subject: 'eng', correct: 18, total: 20, kind: 'mock', mock_score: 350, created_at: '2026-10-12T10:00:00.000Z' }]
  const m = latestMocks(later).find((x) => x.user_id === 'b')
  assert.equal(m.total, 350); assert.equal(m.subjects.length, 1)
})
test('CBT Mock and ExamHall are kept apart', () => {
  const both = [...rows, { id: 20, user_id: 'a', subject: 'eng', correct: 20, total: 20, kind: 'hall', mock_score: 380, created_at: t0 }, { id: 21, user_id: 'a', subject: 'phy', correct: 10, total: 20, kind: 'hall', mock_score: null, created_at: t1 }]
  assert.deepEqual(buildScoresheet(students, both, 'hall').map((r) => [r.name, r.total]), [['Ada Obi', 380]])
  assert.equal(breakdown(buildScoresheet(students, both, 'hall')[0]), 'ENG 20/20   PHY 10/20')
  assert.deepEqual(buildScoresheet(students, both, 'mock').map((r) => r.total), [290, 200, 200]) // the hall row does not leak in
  assert.deepEqual(buildScoresheet(students, both).map((r) => r.total), [290, 200, 200]) // default is CBT Mock
})
test('stats', () => {
  assert.deepEqual(scoreStats(buildScoresheet(students, rows)), { count: 3, average: 230, highest: 290, over300: 0 })
  assert.deepEqual(scoreStats([]), { count: 0, average: 0, highest: 0, over300: 0 })
})

test('pdf text helpers', () => {
  assert.equal(toLatin('Ọlá Ñandi'), 'Ola Nandi')
  assert.equal(toLatin('你好'), '??')
  assert.ok(textWidth('Hello', 10) > 20 && textWidth('Hello', 10) < 30)
  const f = fit('A very very very long student name indeed', 80, 9.5)
  assert.ok(f.endsWith('...') && textWidth(f, 9.5) <= 80)
})

const cols = [{ label: 'Rank', width: 40, align: 'center' }, { label: 'Student', width: 200 }, { label: 'Score', width: 60, align: 'right' }]
const asText = (b) => Buffer.from(b).toString('latin1')

test('pdf is well formed: header, xref offsets, page count', () => {
  const data = Array.from({ length: 70 }, (_, i) => [String(i + 1), `Student (${i}) \\ name`, String(300 - i)])
  const bytes = buildTablePdf({ title: 'Scoresheet', subtitle: 'sub', columns: cols, rows: data, note: 'n', generated: 'g' })
  const s = asText(bytes)
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'))
  const pages = Number(s.match(/\/Count (\d+)/)[1])
  assert.equal(pages, 4) // 70 rows: 21 on page 1 (it has the title), then 22 a page
  assert.equal((s.match(/\/Type \/Page /g) || []).length, pages)
  const start = Number(s.match(/startxref\n(\d+)/)[1])
  assert.equal(s.slice(start, start + 4), 'xref')
  const offs = [...s.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
  offs.forEach((o, k) => assert.equal(s.slice(o, o + (`${k + 1} 0 obj`).length), `${k + 1} 0 obj`, 'object ' + (k + 1)))
  assert.match(s, /Page 4 of 4/)
  assert.match(s, /\(Student \\\(0\\\) \\\\ name\)/) // brackets and backslash escaped
})
test('pdf with no rows still has one page', () => {
  const s = asText(buildTablePdf({ title: 'T', columns: cols, rows: [] }))
  assert.match(s, /\/Count 1/); assert.match(s, /No scores yet/)
})
test('pdf opens in a real reader when one is installed', (t) => {
  let tool
  for (const c of ['pdftotext', 'qpdf']) { try { execFileSync('which', [c]); tool = c; break } catch { /* next */ } }
  if (!tool) return t.skip('no pdf tool here')
  const dir = mkdtempSync(join(tmpdir(), 'pdf-')); const f = join(dir, 'a.pdf')
  writeFileSync(f, buildTablePdf({ title: 'Scoresheet', columns: cols, rows: [['1', 'Ada Obi', '290']] }))
  const out = tool === 'pdftotext' ? execFileSync('pdftotext', ['-layout', f, '-']).toString() : execFileSync('qpdf', ['--check', f]).toString()
  if (tool === 'pdftotext') { assert.match(out, /Ada Obi/); assert.match(out, /290/) } else assert.match(out, /No syntax or stream encoding errors/)
})
