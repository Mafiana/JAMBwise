import test from 'node:test'
import assert from 'node:assert/strict'
import { buildParentReportPdf, stamp, stampForFile } from '../src/lib/reportPdf.js'

const sample = () => ({
  student: { name: 'Ada Obi', reg_number: 'JW-2026-000009', course: 'Law', school: 'UNILAG', plan: 'pro', exam_date: '' },
  parent: 'Mr Obi',
  stats: [{ value: 10, label: 'questions answered' }, { value: '70%', label: 'accuracy' }, { value: '-', label: 'best mock, of 400' }, { value: 2, label: 'day streak' }],
  attention: '', subjects: [{ name: 'Mathematics', pct: 70, detail: '7 of 10 correct' }], activity: 'Practised on 2 of the last 14 days.',
  mocks: [], hall: null, recent: Array.from({ length: 60 }, (_, i) => ['1 Oct, 08:00', 'Practice', 'Mathematics', `${i} / 20`]),
})

test('the stamp is the real moment it was made, and the file name carries it too', () => {
  const t = new Date(2026, 9, 25, 6, 52, 21)
  assert.match(stamp(t), /^25 October 2026, 6:52:21 (am|AM)/)
  assert.equal(stampForFile(t), '2026-10-25-0652')
})
test('the PDF is valid, carries the download stamp on every page and pages a long list', () => {
  const t = new Date(2026, 9, 25, 6, 52, 21)
  const txt = Buffer.from(buildParentReportPdf(sample(), t)).toString('latin1')
  assert.ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'))
  const pages = (txt.match(/\/Type \/Page /g) || []).length
  assert.ok(pages >= 2, 'a long list runs onto more pages')
  assert.equal((txt.match(/Downloaded 25 October 2026, 6:52:21/g) || []).length >= pages + 1, true)
  assert.ok(txt.includes('Ada Obi') && txt.includes('Mr Obi'))
})
test('odd characters never break the PDF', () => {
  const r = sample(); r.student.name = 'Ọbụ (Test) \\ Ñ'
  const txt = Buffer.from(buildParentReportPdf(r)).toString('latin1')
  assert.ok(txt.includes('%%EOF'))
})
