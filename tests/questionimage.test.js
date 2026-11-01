import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitSize, IMAGE_MAX_SIDE, IMAGE_MAX_CHARS } from '../src/lib/questionImage.js'
import { prepareQuestion } from '../src/lib/utils.js'

test('fitSize shrinks the long side to the limit and keeps the shape', () => {
  assert.deepEqual(fitSize(3000, 1500), { w: IMAGE_MAX_SIDE, h: IMAGE_MAX_SIDE / 2 })
  assert.deepEqual(fitSize(1500, 3000), { w: IMAGE_MAX_SIDE / 2, h: IMAGE_MAX_SIDE })
})

test('fitSize never enlarges a small picture and never returns 0', () => {
  assert.deepEqual(fitSize(400, 300), { w: 400, h: 300 })
  assert.deepEqual(fitSize(10000, 1), { w: IMAGE_MAX_SIDE, h: 1 })
})

test('the size limit matches the database limit', () => {
  assert.equal(IMAGE_MAX_CHARS, 300000)
})

test('prepareQuestion carries the picture flag', () => {
  const row = { id: 7, subject: 'phy', body: 'See the circuit', options: ['a', 'b', 'c', 'd'], answer: 1, has_image: true }
  assert.equal(prepareQuestion(row).has_image, true)
  assert.equal(prepareQuestion({ ...row, has_image: undefined }).has_image, false)
})
