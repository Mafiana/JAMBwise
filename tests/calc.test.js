import test from 'node:test'
import assert from 'node:assert/strict'
import { CALC_START, press, keyFromEvent } from '../src/lib/calc.js'

const run = (...keys) => keys.reduce(press, CALC_START).display

test('basic arithmetic', () => {
  assert.equal(run('1', '2', '+', '3', '='), '15')
  assert.equal(run('9', '-', '4', '='), '5')
  assert.equal(run('6', '*', '7', '='), '42')
  assert.equal(run('8', '/', '4', '='), '2')
})
test('chains left to right like a simple calculator', () => {
  assert.equal(run('2', '+', '3', '*', '4', '='), '20')
})
test('decimals and float noise', () => {
  assert.equal(run('0', '.', '1', '+', '0', '.', '2', '='), '0.3')
  assert.equal(run('.', '5', '+', '1', '='), '1.5')
  assert.equal(run('1', '.', '2', '.', '3'), '1.23')
})
test('square and square root', () => {
  assert.equal(run('9', 'sq'), '81')
  assert.equal(run('8', '1', 'sqrt'), '9')
  assert.equal(run('2', 'sqrt'), '1.41421356237')
  assert.equal(run('3', '+', '4', 'sq', '='), '19') // 3 + 16
})
test('errors: divide by zero and root of a negative', () => {
  assert.equal(run('5', '/', '0', '='), 'Error')
  assert.equal(run('5', '-', '9', '=', 'sqrt'), 'Error')
  assert.equal(run('5', '/', '0', '=', '7'), '7') // any key leaves the error
  assert.equal(run('5', '/', '0', '=', 'C'), '0')
})
test('negative results, back and clear', () => {
  assert.equal(run('2', '-', '5', '='), '-3')
  assert.equal(run('1', '2', '3', 'back'), '12')
  assert.equal(run('5', 'back'), '0')
  assert.equal(run('1', '2', 'C'), '0')
})
test('equals repeats nothing and digits after = start fresh', () => {
  assert.equal(run('2', '+', '2', '=', '='), '4')
  assert.equal(run('2', '+', '2', '=', '7'), '7')
})
test('digit limit', () => {
  assert.equal(run(...'123456789012345678'.split('')).length, 14)
})
test('keyboard mapping', () => {
  assert.equal(keyFromEvent({ key: '7' }), '7')
  assert.equal(keyFromEvent({ key: 'Enter' }), '=')
  assert.equal(keyFromEvent({ key: 'x' }), '*')
  assert.equal(keyFromEvent({ key: 'a' }), '')
  assert.equal(keyFromEvent({ key: 'c', ctrlKey: true }), '')
})
