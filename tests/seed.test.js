import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build, validate } from '../scripts/build-seed.mjs'

const SUBJECTS = ['eng', 'mat', 'phy', 'chm', 'bio', 'gov', 'eco', 'com', 'agr', 'acc', 'mkt', 'lit', 'irk', 'crk']

test('every question file is valid and has a healthy number of questions', () => {
  for (const s of SUBJECTS) {
    const list = JSON.parse(fs.readFileSync(new URL(`../supabase/questions/${s}.json`, import.meta.url), 'utf8'))
    assert.deepEqual(validate(s, list), [], s)
    assert.ok(list.length >= 35, `${s} has only ${list.length} questions`)
  }
})

test('validate catches bad data', () => {
  const bad = [
    { q: 'x', o: ['a', 'a', 'b', 'c'], a: 1, e: 'e' },
    { q: 'y', o: ['a', 'b', 'c'], a: 1, e: 'e' },
    { q: 'z', o: ['a', 'b', 'c', 'd'], a: 4, e: 'e' },
    { q: 'z', o: ['a', 'b', 'c', 'd'], a: 0, e: '' },
  ]
  assert.equal(validate("t", bad).length, 5)
})

test('the committed seed-questions.sql is up to date with the JSON files', () => {
  const onDisk = fs.readFileSync(new URL('../supabase/seed-questions.sql', import.meta.url), 'utf8')
  assert.equal(onDisk, build(), 'run `npm run seed` to regenerate supabase/seed-questions.sql')
})
