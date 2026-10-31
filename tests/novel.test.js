import test from 'node:test'
import assert from 'node:assert/strict'

test('novelQuestionsFromText reads a questions file without a subject column', async () => {
  const { novelQuestionsFromText } = await import('../src/lib/novel.js')
  const json = JSON.stringify([
    { q: 'Who wrote the novel?', o: ['A', 'B', 'C', 'D'], a: 1, e: 'B did.' },
    { q: 'Who wrote the novel?', o: ['A', 'B', 'C', 'D'], a: 1 },
    { q: 'Broken', o: ['A', 'A', 'C', 'D'], a: 0 },
  ])
  const r = novelQuestionsFromText(json, 'novel.json')
  assert.equal(r.rows.length, 1)
  assert.deepEqual(r.rows[0], { body: 'Who wrote the novel?', options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'B did.' })
  assert.equal(r.skipped.length, 2)
  const csv = 'question,option_a,option_b,option_c,option_d,answer,explanation\nWhere is it set?,Lagos,Kano,Enugu,Jos,C,Set in Enugu.'
  const c = novelQuestionsFromText(csv, 'q.csv')
  assert.equal(c.rows.length, 1)
  assert.equal(c.rows[0].answer, 2)
  assert.ok(novelQuestionsFromText('not json {', 'x.json').error)
})
