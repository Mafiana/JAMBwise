import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, parseQuestionFile, parseAnswer, normaliseSubject, TEMPLATE_CSV, chunk, toPayload } from '../src/lib/importQuestions.js'

test('parseCsv: quotes, doubled quotes, commas and new lines inside cells, CRLF, BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,2,3')
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['1', '2', '3']])
})
test('parseAnswer: letters, numbers 1-4, "Option B", and zero-based JSON numbers', () => {
  assert.equal(parseAnswer('A'), 0); assert.equal(parseAnswer(' d '), 3); assert.equal(parseAnswer('option b'), 1); assert.equal(parseAnswer('c.'), 2)
  assert.equal(parseAnswer('1'), 0); assert.equal(parseAnswer('4'), 3); assert.equal(parseAnswer('0'), -1); assert.equal(parseAnswer('5'), -1)
  assert.equal(parseAnswer('0', { zeroBased: true }), 0); assert.equal(parseAnswer('3', { zeroBased: true }), 3); assert.equal(parseAnswer('4', { zeroBased: true }), -1)
  assert.equal(parseAnswer(''), -1); assert.equal(parseAnswer('E'), -1)
})
test('normaliseSubject: codes, names and nicknames; blank uses the fallback', () => {
  assert.equal(normaliseSubject('Mathematics'), 'mat'); assert.equal(normaliseSubject(' ENG '), 'eng'); assert.equal(normaliseSubject('Use of English'), 'eng')
  assert.equal(normaliseSubject('Agric'), 'agr'); assert.equal(normaliseSubject('Accounts'), 'acc'); assert.equal(normaliseSubject('Literature in English'), 'lit'); assert.equal(normaliseSubject('CRS'), 'crk'); assert.equal(normaliseSubject('Islamic Religious Knowledge'), 'irk'); assert.equal(normaliseSubject('Marketing'), 'mkt'); assert.equal(normaliseSubject('Latin'), ''); assert.equal(normaliseSubject('', 'bio'), 'bio'); assert.equal(normaliseSubject('Latin', 'bio'), '')
})
test('the downloadable template is itself a valid file', () => {
  const r = parseQuestionFile(TEMPLATE_CSV, 'questions.csv')
  assert.equal(r.format, 'CSV'); assert.equal(r.rows.length, 2); assert.ok(r.rows.every((x) => !x.error), JSON.stringify(r.rows))
  assert.equal(r.rows[0].subject, 'mat'); assert.equal(r.rows[0].answer, 1); assert.equal(r.rows[1].body, 'Choose the word that is opposite in meaning to "generous".')
})
test('CSV: semicolon files, header aliases, subject names and a default subject', () => {
  const csv = 'Question;A;B;C;D;Correct\nWhat is 2+2?;3;4;5;6;b\n'
  const r = parseQuestionFile(csv, 'x.csv', 'mat')
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].subject, 'mat'); assert.equal(r.rows[0].answer, 1); assert.equal(r.rows[0].error, '')
  assert.match(parseQuestionFile(csv, 'x.csv').error, /subject/i)
})
test('CSV: row problems are reported per row and do not stop the others', () => {
  const csv = ['subject,question,option_a,option_b,option_c,option_d,answer,explanation',
    'mat,Good one,1,2,3,4,C,why',
    'xyz,Bad subject,1,2,3,4,A,',
    'mat,,1,2,3,4,A,',
    'mat,Missing option,1,2,,4,A,',
    'mat,Same options,1,1,3,4,A,',
    'mat,Bad answer,1,2,3,4,E,',
    'MATHS,good one,5,6,7,8,A,'].join('\n')
  const r = parseQuestionFile(csv, 'q.csv')
  assert.deepEqual(r.rows.map((x) => x.error), ['', 'Subject is missing or not recognised', 'Question is empty', 'All four options (A to D) are needed', 'Two options are the same', 'Answer must be A, B, C or D', 'Repeated in this file'])
  assert.deepEqual(r.rows.map((x) => x.line), [2, 3, 4, 5, 6, 7, 8])
})
test('CSV: missing columns give a helpful message', () => {
  assert.match(parseQuestionFile('subject,question\nmat,Hi', 'q.csv').error, /Missing columns?: option_a, option_b, option_c, option_d, answer/)
  assert.match(parseQuestionFile('', 'q.csv').error, /empty/i)
  assert.match(parseQuestionFile('subject,question,option_a,option_b,option_c,option_d,answer\n', 'q.csv').error, /No questions/)
})
test('JSON: this app\'s own seed format (q / o / a / e), full format, and letters', () => {
  const j = JSON.stringify([
    { subject: 'phy', q: 'Unit of force?', o: ['Joule', 'Newton', 'Watt', 'Pascal'], a: 1, e: 'F = ma' },
    { subject: 'Biology', question: 'Powerhouse?', options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi'], answer: 'B' },
    { subject: 'bio', question: 'Flat file style', option_a: 'a1', option_b: 'b1', option_c: 'c1', option_d: 'd1', answer: 'd' },
  ])
  const r = parseQuestionFile(j, 'q.json')
  assert.equal(r.format, 'JSON'); assert.ok(r.rows.every((x) => !x.error), JSON.stringify(r.rows))
  assert.deepEqual(r.rows.map((x) => [x.subject, x.answer]), [['phy', 1], ['bio', 1], ['bio', 3]]); assert.equal(r.rows[0].explanation, 'F = ma')
})
test('JSON: {"questions": [...]} wrapper, invalid JSON, wrong shape, out-of-range numbers, unknown extension sniffed', () => {
  const one = { subject: 'eng', q: 'Q?', o: ['a', 'b', 'c', 'd'], a: 0 }
  assert.equal(parseQuestionFile(JSON.stringify({ questions: [one] }), 'q.json').rows.length, 1)
  assert.match(parseQuestionFile('[{oops', 'q.json').error, /not valid JSON/)
  assert.match(parseQuestionFile('{"a":1}', 'q.json').error, /list of questions/)
  assert.equal(parseQuestionFile(JSON.stringify([{ ...one, a: 4 }]), 'q.json').rows[0].error, 'Answer must be A, B, C or D')
  assert.equal(parseQuestionFile(JSON.stringify([one]), 'download').format, 'JSON')
  assert.equal(parseQuestionFile(JSON.stringify([null, 5]), 'q.json').rows.every((x) => x.error), true)
})
test('limits: too many rows, long fields', () => {
  const head = 'subject,question,option_a,option_b,option_c,option_d,answer\n'
  const many = head + Array.from({ length: 2001 }, (_, i) => `mat,Q${i},1,2,3,4,A`).join('\n')
  assert.match(parseQuestionFile(many, 'q.csv').error, /at most 2000/)
  const long = head + `mat,${'x'.repeat(1001)},1,2,3,4,A\nmat,ok,${'y'.repeat(301)},2,3,4,A`
  assert.deepEqual(parseQuestionFile(long, 'q.csv').rows.map((r) => !!r.error), [true, true])
})
test('every shipped question file survives a JSON round trip through the importer', async () => {
  const fs = await import('node:fs'); const dir = new URL('../supabase/questions/', import.meta.url)
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const r = parseQuestionFile(fs.readFileSync(new URL(f, dir), 'utf8'), f, f.replace('.json', ''))
    assert.ok(!r.error, f + ': ' + r.error)
    const bad = r.rows.filter((x) => x.error && x.error !== 'Two options are the same')
    assert.equal(bad.length, 0, f + ': ' + JSON.stringify(bad[0]))
  }
})
test('chunk and toPayload', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]); assert.deepEqual(chunk([], 3), [])
  assert.deepEqual(toPayload({ line: 3, subject: 'mat', body: 'b', options: ['1', '2', '3', '4'], answer: 2, explanation: '', error: '' }), { subject: 'mat', body: 'b', options: ['1', '2', '3', '4'], answer: 2, explanation: null })
})
