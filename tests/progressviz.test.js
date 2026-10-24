import test from 'node:test'
import assert from 'node:assert/strict'
import { levelFor, activityGrid, heat, badges, radarPoints, standing } from '../src/lib/progressViz.js'

test('levels advance with questions answered', () => {
  assert.equal(levelFor(0).name, 'Rookie')
  assert.equal(levelFor(49).toNext, 1)
  assert.equal(levelFor(50).name, 'Explorer')
  assert.equal(levelFor(5000).name, 'Legend')
  assert.equal(levelFor(5000).next, null)
})
test('activity grid is 12 weeks of 7 days and counts sessions', () => {
  const now = new Date('2026-10-22T10:00:00')
  const g = activityGrid(['2026-10-22T08:00:00', '2026-10-22T09:00:00'], 12, now)
  assert.equal(g.weeks.length, 12)
  assert.ok(g.weeks.every((w) => w.length === 7))
  assert.equal(g.max, 2)
})
test('heat buckets stay in 0..4', () => {
  assert.equal(heat(0, 5), 0)
  for (let n = 1; n <= 5; n++) assert.ok(heat(n, 5) >= 1 && heat(n, 5) <= 4)
})
test('badges report earned and progress', () => {
  const b = badges({ total: 120, accuracy: 80, streakDays: 3, mocks: 0, bestMock: null, subjectsTried: 2, sessions: 5 })
  assert.equal(b.length, 8)
  assert.ok(b.find((x) => x.id === 'first').earned)
  assert.ok(!b.find((x) => x.id === 'week').earned)
})
test('radar points and standing', () => {
  const p = radarPoints([100, 100, 100], 10, 0, 0)
  assert.equal(p.length, 3)
  assert.ok(Math.abs(Math.hypot(p[0].x, p[0].y) - 10) < 0.01)
  assert.equal(standing(80), 'Strong'); assert.equal(standing(60), 'Getting there'); assert.equal(standing(10), 'Needs work')
})
