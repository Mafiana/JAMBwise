import test from 'node:test'
import assert from 'node:assert/strict'
import { profileCompletion } from '../src/lib/profileCompletion.js'

test('an empty profile is only partly complete', () => {
  const c = profileCompletion({ full_name: 'Ada', subjects: [] })
  assert.equal(c.pct, 20)
  assert.deepEqual(c.missing, ['Photo', 'Course', 'Target university', 'Subjects'])
})
test('subjects count in thirds', () => {
  assert.equal(profileCompletion({ full_name: 'Ada', subjects: ['mat'] }).pct, 27)
  assert.equal(profileCompletion({ full_name: 'Ada', subjects: ['mat', 'phy'] }).pct, 33)
})
test('a full profile is 100 and blank spaces do not count', () => {
  const full = { full_name: 'Ada', avatar: 'data:x', course: 'Law', school: 'UI', subjects: ['mat', 'phy', 'chm'] }
  assert.equal(profileCompletion(full).pct, 100)
  assert.equal(profileCompletion({ ...full, course: '   ' }).pct, 80)
})
