import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMockSlipPdf, buildResultSlipPdf, readJpeg, subjectScore } from '../src/lib/slipPdf.js'

const slip = {
  name: 'Ada Obi', reg_number: 'JW-2026-123456', course: 'Medicine', school: 'University of Lagos', exam: 'ExamHall', date: '3 November 2026', total: 249,
  subjects: [{ name: 'English', correct: 32, total: 50 }, { name: 'Physics', correct: 11, total: 20 }, { name: 'Biology', correct: 15, total: 20 }, { name: 'Chemistry', correct: 11, total: 20 }],
}

test('a subject is scored out of 100', () => {
  assert.equal(subjectScore({ correct: 32, total: 50 }), 64)
  assert.equal(subjectScore({ correct: 0, total: 0 }), 0)
})

test('the slip is a valid one-page PDF that names JAMBwise and is not an official JAMB result', () => {
  const bytes = buildResultSlipPdf(slip, new Date('2026-11-03T10:00:00Z'))
  const s = Buffer.from(bytes).toString('latin1')
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'))
  assert.match(s, /\/Count 1/)
  for (const t of ['JAMBwise', 'Ada Obi', 'JW-2026-123456', 'TOTAL SCORE', '249', 'not an official JAMB result', 'not affiliated']) assert.ok(s.includes(t), t)
})

test('odd characters in a name do not break the PDF', () => {
  const bytes = buildResultSlipPdf({ ...slip, name: 'Ọlá (Jr) \\ Ñ' })
  assert.ok(Buffer.from(bytes).toString('latin1').includes('%%EOF'))
})

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAEsASwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCeiiivnT6QKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k='

test('a JPEG portrait is read and embedded in the slip', () => {
  const j = readJpeg(PHOTO)
  assert.equal(j.w, 300); assert.equal(j.h, 300); assert.equal(j.comps, 3)
  const s = Buffer.from(buildResultSlipPdf({ ...slip, photo: PHOTO })).toString('latin1')
  assert.ok(s.includes('/DCTDecode') && s.includes('/Im1 Do') && s.includes('/XObject'))
  assert.ok(!buildResultSlipPdf(slip).toString().includes('DCTDecode') && Buffer.from(buildResultSlipPdf(slip)).toString('latin1').includes('No photo'))
})

test('anything that is not a JPEG data URL is ignored', () => {
  assert.equal(readJpeg('data:image/png;base64,AAAA'), null)
  assert.equal(readJpeg(null), null)
  assert.equal(readJpeg('data:image/jpeg;base64,AAAA'), null)
})

test('the CBT Mock slip is a one-page PDF with the scores and no JAMB branding', () => {
  const s = Buffer.from(buildMockSlipPdf({ ...slip, exam: 'CBT Mock', email: 'ada@example.com', when: 'Wednesday, 4 November 2026 at 9:00 AM' })).toString('latin1')
  assert.ok(s.startsWith('%PDF-1.4') && s.includes('/Count 1'))
  for (const t of ['CBT Mock Results', 'Total Score: 249', 'ada@example.com', 'JAMBwise Number', 'not affiliated']) assert.ok(s.includes(t), t)
  assert.ok(!s.includes('DCTDecode'))
})
