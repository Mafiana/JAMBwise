import test from 'node:test'
import assert from 'node:assert/strict'
import { examEndsAt, fmtCountdown, mergeEvent, shouldAutoSubmit, windowState } from '../src/lib/integrity.js'
import { clearExam, loadExam, saveExam } from '../src/lib/examStore.js'
import { prepareQuestion, sample } from '../src/lib/utils.js'

const memory = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: (k) => { delete m[k] } } }

test('events that fire together count once, later ones count again', () => {
  let r = mergeEvent([], { type: 'left_tab', at: 1000 })
  assert.equal(r.counted, true)
  r = mergeEvent(r.events, { type: 'left_fullscreen', at: 1500 })
  assert.equal(r.counted, false); assert.equal(r.events.length, 1)
  r = mergeEvent(r.events, { type: 'left_tab', at: 9000 })
  assert.equal(r.counted, true); assert.equal(r.events.length, 2)
})

test('auto-submit happens at the limit, never when the limit is 0', () => {
  assert.equal(shouldAutoSubmit(2, 3), false)
  assert.equal(shouldAutoSubmit(3, 3), true)
  assert.equal(shouldAutoSubmit(50, 0), false)
})

test('sitting window: before, open, closed, and no schedule', () => {
  const w = { opens: 100, closes: 200 }
  assert.equal(windowState(w, 99), 'before')
  assert.equal(windowState(w, 100), 'open')
  assert.equal(windowState(w, 199), 'open')
  assert.equal(windowState(w, 200), 'closed')
  assert.equal(windowState({ opens: null, closes: null }, 5), 'open')
  assert.equal(windowState(null, 5), 'open')
})

test('the exam ends at its full time, or at the closing time if that is sooner (device clock corrected by the server offset)', () => {
  assert.equal(examEndsAt(1000, 500, null), 1500)
  assert.equal(examEndsAt(1000, 500, { closes: 1200, offset: 0 }), 1200)
  assert.equal(examEndsAt(1000, 500, { closes: 5000, offset: 0 }), 1500)
  assert.equal(examEndsAt(1000, 500, { closes: 1700, offset: 600 }), 1100)   // the device clock is 600 ms behind the server
})

test('countdown text', () => {
  assert.equal(fmtCountdown(25 * 60000), '25 min')
  assert.equal(fmtCountdown(3.5 * 3600000), '3 h 30 min')
  assert.equal(fmtCountdown(50 * 3600000), '2 days 2 h')
})

const exam = (extra = {}) => ({ kind: 'hall', subs: ['eng', 'mat'], qs: [{ id: 1, subject: 'eng', body: 'Q', options: ['a', 'b'], answer: 0 }, { id: 2, subject: 'mat', body: 'Q2', options: ['a', 'b'], answer: 1 }], i: 1, a: { 0: 1 }, endsAt: Date.now() + 9e5, events: [{ type: 'left_tab', at: 1 }], maxViolations: 3, closes: null, done: false, ...extra })

test('an exam in progress is restored with its answers, position, warnings and original end time', () => {
  const st = memory(); const m = exam()
  saveExam('u1', m, st)
  const r = loadExam('u1', st)
  assert.deepEqual(r.a, { 0: 1 }); assert.equal(r.i, 1); assert.equal(r.endsAt, m.endsAt); assert.equal(r.events.length, 1)
  assert.equal(r.kind, 'hall'); assert.equal(r.resumed, true); assert.equal(r.maxViolations, 3)
})

test('another student, a corrupt record, or a delivered exam is never restored', () => {
  const st = memory()
  saveExam('u1', exam(), st)
  assert.equal(loadExam('u2', st), null)
  st.setItem('jw_exam_inprogress', '{not json'); assert.equal(loadExam('u1', st), null)
  st.setItem('jw_exam_inprogress', JSON.stringify({ v: 1, uid: 'u1', kind: 'hall', subs: ['eng'], qs: [], endsAt: 5 })); assert.equal(loadExam('u1', st), null)
  saveExam('u1', exam({ done: true, saved: 'ok' }), st); assert.equal(loadExam('u1', st), null)
  saveExam('u1', exam(), st); clearExam(st); assert.equal(loadExam('u1', st), null)
})

test('a submitted exam whose save did not finish comes back asking to try again', () => {
  const st = memory()
  saveExam('u1', exam({ done: true, saved: 'saving', results: [], total: 120 }), st)
  const r = loadExam('u1', st)
  assert.equal(r.done, true); assert.equal(r.total, 120); assert.match(r.saved, /Try again/)
})

test('different students get different question order and option order (the pool is shuffled per student)', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, subject: 'eng', body: 'q' + i, options: ['a', 'b', 'c', 'd'], answer: 0 }))
  const seeded = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
  const a = sample(rows, 20, seeded(1)).map((r) => prepareQuestion(r, seeded(2)))
  const b = sample(rows, 20, seeded(7)).map((r) => prepareQuestion(r, seeded(9)))
  assert.notDeepEqual(a.map((q) => q.id), b.map((q) => q.id))
  assert.notDeepEqual(a.map((q) => q.options.join()), b.map((q) => q.options.join()))
  for (const q of a) assert.equal(q.options[q.answer], 'a')                   // the right answer follows its option
})
