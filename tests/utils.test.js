import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shuffle, sample, prepareQuestion, fmtTime, streak, effectivePlan, planLevel, daysUntil,
  summarize, weakest, scoreMock, aggregate, normalizePin, naira, dayKey, buildOverview, toCsv, pageList, ticketNo,
} from '../src/lib/utils.js'

// deterministic "random" so shuffles are reproducible
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

test('shuffle keeps every item and does not mutate the input', () => {
  const a = [1, 2, 3, 4, 5, 6]
  const b = shuffle(a, seeded(3))
  assert.deepEqual([...b].sort(), a)
  assert.deepEqual(a, [1, 2, 3, 4, 5, 6])
})

test('sample returns n distinct items', () => {
  const s = sample([1, 2, 3, 4, 5], 3, seeded(5))
  assert.equal(s.length, 3)
  assert.equal(new Set(s).size, 3)
})

test('prepareQuestion keeps the right answer pointing at the right text', () => {
  for (let seed = 1; seed < 40; seed++) {
    const row = { id: 7, subject: 'mat', body: 'q', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'x' }
    const q = prepareQuestion(row, seeded(seed))
    assert.equal(q.options[q.answer], 'c')
    assert.deepEqual([...q.options].sort(), ['a', 'b', 'c', 'd'])
  }
})

test('fmtTime', () => {
  assert.equal(fmtTime(0), '0:00')
  assert.equal(fmtTime(65), '1:05')
  assert.equal(fmtTime(3600), '60:00')
})

test('streak counts consecutive days and survives a day without practice yet', () => {
  const now = new Date('2026-10-12T15:00:00')
  const at = (d) => new Date(d + 'T10:00:00').toISOString()
  assert.equal(streak([], now), 0)
  assert.equal(streak([at('2026-10-12')], now), 1)
  assert.equal(streak([at('2026-10-12'), at('2026-10-11'), at('2026-10-10')], now), 3)
  assert.equal(streak([at('2026-10-11'), at('2026-10-10')], now), 2) // not yet practised today
  assert.equal(streak([at('2026-10-09')], now), 0) // gap
  assert.equal(streak([at('2026-10-12'), at('2026-10-12'), at('2026-10-10')], now), 1)
})

test('effectivePlan treats an expired paid plan as free', () => {
  const now = new Date('2026-10-12T00:00:00Z')
  assert.equal(effectivePlan(null, now), 'free')
  assert.equal(effectivePlan({ plan: 'free' }, now), 'free')
  assert.equal(effectivePlan({ plan: 'student', plan_expires: null }, now), 'student')
  assert.equal(effectivePlan({ plan: 'pro', plan_expires: '2026-12-01T00:00:00Z' }, now), 'pro')
  assert.equal(effectivePlan({ plan: 'pro', plan_expires: '2026-10-01T00:00:00Z' }, now), 'free')
  assert.equal(planLevel({ plan: 'pro', plan_expires: '2026-10-01T00:00:00Z' }, now), 0)
  assert.equal(planLevel({ plan: 'pro', plan_expires: null }, now), 2)
})

test('daysUntil', () => {
  const now = new Date('2026-10-12T22:00:00')
  assert.equal(daysUntil('', now), 0)
  assert.equal(daysUntil('2026-10-12', now), 0)
  assert.equal(daysUntil('2026-10-19', now), 7)
  assert.equal(daysUntil('2026-10-01', now), 0)
})

test('summarize totals attempts and lists mocks once each', () => {
  const rows = [
    { subject: 'eng', correct: 3, total: 5, kind: 'practice', mock_score: null, created_at: '2026-10-10T09:00:00' },
    { subject: 'eng', correct: 10, total: 20, kind: 'mock', mock_score: 250, created_at: '2026-10-11T09:00:00' },
    { subject: 'mat', correct: 15, total: 20, kind: 'mock', mock_score: null, created_at: '2026-10-11T09:00:00' },
  ]
  const s = summarize(rows)
  assert.equal(s.total, 45)
  assert.equal(s.correct, 28)
  assert.deepEqual(s.bySubject.eng, { correct: 13, total: 25 })
  assert.equal(s.mocks.length, 1)
  assert.equal(s.mocks[0].score, 250)
})

test('weakest picks the lowest accuracy and ignores untouched subjects', () => {
  const by = { eng: { correct: 9, total: 10 }, mat: { correct: 2, total: 10 } }
  assert.equal(weakest(by, ['eng', 'mat', 'phy']), 'mat')
  assert.equal(weakest({}, ['eng', 'mat']), 'eng')
})

test('scoreMock gives 100 marks per subject and a total out of 400', () => {
  const qs = [
    { subject: 'eng', answer: 0 }, { subject: 'eng', answer: 1 },
    { subject: 'mat', answer: 2 }, { subject: 'mat', answer: 3 },
  ]
  const r = scoreMock(['eng', 'mat'], qs, { 0: 0, 1: 1, 2: 2 }) // eng 2/2, mat 1/2, one unanswered
  assert.equal(r.results[0].score, 100)
  assert.equal(r.results[1].score, 50)
  assert.equal(r.total, 150)
  const perfect = scoreMock(['eng', 'mat', 'phy', 'chm'], qs, { 0: 0, 1: 1, 2: 2, 3: 3 })
  assert.equal(perfect.results[2].total, 0)
  assert.equal(perfect.total, 200)
})

test('aggregate = JAMB/8 + postUTME/2, clamped', () => {
  assert.equal(aggregate(320, 70), 75)
  assert.equal(aggregate(400, 100), 100)
  assert.equal(aggregate(900, 500), 100)
  assert.equal(aggregate('', ''), 0)
  assert.equal(aggregate(-5, -5), 0)
})

test('normalizePin', () => {
  assert.equal(normalizePin('abcd2345'), 'ABCD-2345')
  assert.equal(normalizePin(' abcd-2345 '), 'ABCD-2345')
  assert.equal(normalizePin('abc'), null)
  assert.equal(normalizePin(''), null)
  assert.equal(normalizePin(null), null)
})

test('naira and dayKey', () => {
  assert.equal(naira(150000), '₦1,500')
  assert.equal(dayKey('2026-03-05T10:00:00'), '2026-03-05')
})

test('toCsv quotes cells and neutralises spreadsheet formulas', () => {
  const csv = toCsv([{ a: 'x,y', b: '=HYPERLINK("evil")' }, { a: 'say "hi"', b: null }, { a: '+1', b: '@sum' }], [{ label: 'A', value: (r) => r.a }, { label: 'B', value: (r) => r.b }])
  const lines = csv.split('\r\n')
  assert.equal(lines[0], 'A,B')
  assert.equal(lines[1], '"x,y","\'=HYPERLINK(""evil"")"')
  assert.equal(lines[2], '"say ""hi""",')
  assert.equal(lines[3], "'+1,'@sum")
})

test('buildOverview counts plans, signups, revenue and expiring plans', () => {
  const now = new Date('2026-06-15T12:00:00')
  const d = (n) => new Date(now.getTime() + n * 864e5).toISOString()
  const students = [
    { id: 1, plan: 'free', plan_expires: null, created_at: d(-1), last_active: d(-1) },
    { id: 2, plan: 'student', plan_expires: d(3), created_at: d(-20), last_active: d(-10) },
    { id: 3, plan: 'pro', plan_expires: d(20), created_at: d(-30), last_active: null },
    { id: 4, plan: 'pro', plan_expires: d(-2), created_at: d(-40), last_active: d(-2) }, // expired counts as free
  ]
  const payments = [
    { status: 'paid', amount_kobo: 150000, paid_at: d(-1) }, { status: 'paid', amount_kobo: 300000, paid_at: d(-45) },
    { status: 'pending', amount_kobo: 150000, created_at: d(0) }, { status: 'failed', amount_kobo: 1, created_at: d(0) },
  ]
  const o = buildOverview(students, payments, now)
  assert.deepEqual(o.planMix, { free: 2, student: 1, pro: 1 })
  assert.equal(o.new7d, 1); assert.equal(o.active7d, 2); assert.equal(o.conversion, 50)
  assert.equal(o.expiring.length, 1); assert.equal(o.expiring[0].id, 2)
  assert.equal(o.pending, 1); assert.equal(o.revenue30d, 150000)
  assert.equal(o.signups.length, 14); assert.equal(o.signups.reduce((a, b) => a + b, 0), 1); assert.equal(o.revenue[12], 150000)
})

test('pageList shows every page when there are few, and ellipses when there are many', () => {
  assert.deepEqual(pageList(1, 1), [1])
  assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(pageList(1, 20), [1, 2, '…r', 20])
  assert.deepEqual(pageList(10, 20), [1, '…', 9, 10, 11, '…r', 20])
  assert.deepEqual(pageList(20, 20), [1, '…', 19, 20])
  assert.deepEqual(pageList(2, 9), [1, 2, 3, '…r', 9])
})

test('ticketNo pads the id', () => { assert.equal(ticketNo(7), 'JW-T0007'); assert.equal(ticketNo(12345), 'JW-T12345') })

import { questionReport, studentReport, REPORT_REASONS } from '../src/lib/utils.js'
test('questionReport: shows the question as the student saw it, marks the shown answer, fits the ticket limits', () => {
  const q = { id: 12, body: 'What is 2 + 2?', options: ['3', '5', '4', '22'], answer: 2 }
  const r = questionReport({ q, subjectName: 'Mathematics', reason: 'wrong_answer', note: 'I think it is 5' })
  assert.equal(r.subject, 'Report: Q#12 (Mathematics)')
  assert.match(r.body, /^Question #12 · Mathematics\nReason: The marked answer is wrong\n\nWhat is 2 \+ 2\?\nA\. 3\nB\. 5\nC\. 4  \(marked correct\)\nD\. 22\n\nStudent note: I think it is 5$/)
  const huge = questionReport({ q: { id: 1, body: 'x'.repeat(5000), options: ['y'.repeat(900), 'b', 'c', 'd'], answer: 0 }, subjectName: 'English', reason: 'other', note: 'n'.repeat(5000) })
  assert.ok(huge.body.length <= 2000 && huge.body.length >= 5, 'length ' + huge.body.length)
  assert.ok(huge.subject.length <= 120)
  assert.equal(questionReport({ q, subjectName: 'M', reason: 'nonsense' }).body.includes('Something else'), true)
  assert.equal(REPORT_REASONS.length, 5)
})
test('studentReport: totals, accuracy, per-subject rows, mock scores newest first', () => {
  const a = [
    { subject: 'mat', correct: 12, total: 20, kind: 'practice', mock_score: null, created_at: '2026-01-01T10:00:00Z' },
    { subject: 'mat', correct: 18, total: 20, kind: 'practice', mock_score: null, created_at: '2026-01-02T10:00:00Z' },
    { subject: 'eng', correct: 16, total: 20, kind: 'mock', mock_score: 290, created_at: '2026-01-03T10:00:00Z' },
    { subject: 'eng', correct: 10, total: 20, kind: 'mock', mock_score: 210, created_at: '2026-01-04T10:00:00Z' },
  ]
  const r = studentReport(a)
  assert.equal(r.total, 80); assert.equal(r.correct, 56); assert.equal(r.accuracy, 70); assert.equal(r.sessions, 4)
  assert.deepEqual(r.mocks.map((m) => m.score), [210, 290]); assert.equal(r.bestMock, 290)
  assert.deepEqual(r.subjects.map((s) => [s.subject, s.pct, s.sessions]), [['mat', 75, 2], ['eng', 65, 2]])
  assert.deepEqual(studentReport([]), { total: 0, correct: 0, sessions: 0, accuracy: 0, mocks: [], bestMock: null, subjects: [] })
})

import { sampleFresh } from '../src/lib/utils.js'
test('sampleFresh avoids questions already seen, and falls back to them only when needed', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }))
  const seen = new Set([1, 2, 3, 4, 5])
  for (let k = 0; k < 30; k++) {
    const a = sampleFresh(rows, 5, seen)
    assert.equal(a.length, 5)
    assert.ok(a.every((r) => !seen.has(r.id)))
  }
  const b = sampleFresh(rows, 8, seen)
  assert.equal(new Set(b.map((r) => r.id)).size, 8)
  assert.ok([6, 7, 8, 9, 10].every((id) => b.some((r) => r.id === id)))
  assert.equal(sampleFresh(rows, 20, seen).length, 10)
})

test('pinExpired only flags PIN students whose paid time has ended', async () => {
  const { pinExpired } = await import('../src/lib/utils.js')
  const pin = { email: 'gxgf3yqb@pin.jambwise.ng' }
  const now = new Date('2026-11-27T00:00:00Z')
  assert.equal(pinExpired(pin, { plan: 'student', plan_expires: '2026-11-26T00:00:00Z' }, now), true)
  assert.equal(pinExpired(pin, { plan: 'student', plan_expires: '2026-12-26T00:00:00Z' }, now), false)
  assert.equal(pinExpired(pin, { plan: 'free', plan_expires: null }, now), false)
  assert.equal(pinExpired({ email: 'a@b.com' }, { plan: 'student', plan_expires: '2026-11-26T00:00:00Z' }, now), false)
  assert.equal(pinExpired(pin, { plan: 'student', is_teacher: true, plan_expires: '2026-11-26T00:00:00Z' }, now), false)
  assert.equal(pinExpired(null, null, now), false)
})

test('parseRich turns <u> into formatting and leaves other tags as text', async () => {
  const { parseRich } = await import('../src/lib/utils.js')
  assert.deepEqual(parseRich('b<u>i</u>rd'), [{ text: 'b' }, { tag: 'u', text: 'i' }, { text: 'rd' }])
  assert.deepEqual(parseRich('H<sub>2</sub>O'), [{ text: 'H' }, { tag: 'sub', text: '2' }, { text: 'O' }])
  assert.deepEqual(parseRich('<script>x</script>'), [{ text: '<script>x</script>' }])
  assert.deepEqual(parseRich('a < b'), [{ text: 'a < b' }])
  assert.deepEqual(parseRich(null), [])
})

test('pinTimeLeft counts down only in the last 3 days of a PIN student', async () => {
  const { pinTimeLeft } = await import('../src/lib/utils.js')
  const pin = { email: 'gxgf3yqb@pin.jambwise.ng' }
  const now = new Date('2026-11-10T00:00:00Z')
  const exp = (ms) => ({ plan: 'student', plan_expires: new Date(now.getTime() + ms).toISOString() })
  const t = pinTimeLeft(pin, exp(2 * 864e5 + 3 * 36e5 + 4 * 6e4 + 5e3), now)
  assert.deepEqual([t.d, t.h, t.m, t.s], [2, 3, 4, 5])
  assert.equal(pinTimeLeft(pin, exp(4 * 864e5), now), null)      // more than 3 days
  assert.equal(pinTimeLeft(pin, exp(-1000), now), null)          // already over (the expired box handles it)
  assert.equal(pinTimeLeft({ email: 'a@b.com' }, exp(864e5), now), null)
  assert.equal(pinTimeLeft(pin, { plan: 'free', plan_expires: null }, now), null)
})
