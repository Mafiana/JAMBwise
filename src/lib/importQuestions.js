// Reads a CSV or JSON file of questions for the admin bulk import. Pure functions (no React, no network),
// so they are covered by `npm test`. The server checks every row again before saving.

export const SUBJECT_CODES = ['eng', 'mat', 'phy', 'chm', 'bio', 'gov', 'eco', 'com', 'agr', 'acc', 'mkt', 'lit', 'irk', 'crk']
const SUBJECT_ALIASES = {
  eng: 'eng', english: 'eng', 'use of english': 'eng', 'english language': 'eng',
  mat: 'mat', math: 'mat', maths: 'mat', mathematics: 'mat',
  phy: 'phy', physics: 'phy',
  chm: 'chm', chem: 'chm', chemistry: 'chm',
  bio: 'bio', biology: 'bio',
  gov: 'gov', government: 'gov',
  eco: 'eco', economics: 'eco',
  com: 'com', commerce: 'com',
  agr: 'agr', agric: 'agr', agriculture: 'agr', 'agricultural science': 'agr',
  acc: 'acc', accounts: 'acc', accounting: 'acc', 'principles of accounts': 'acc',
  mkt: 'mkt', marketing: 'mkt',
  lit: 'lit', literature: 'lit', 'literature in english': 'lit', 'literature-in-english': 'lit',
  irk: 'irk', 'islamic religious knowledge': 'irk', islamic: 'irk', 'islamic studies': 'irk',
  crk: 'crk', 'christian religious knowledge': 'crk', christian: 'crk', 'christian religious studies': 'crk', crs: 'crk',
}

export const LIMITS = { file: 2 * 1024 * 1024, rows: 2000, body: 1000, option: 300, explanation: 1000 }

export const TEMPLATE_HEADERS = ['subject', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'explanation']

/** A starter file the admin can download, open in Excel or Google Sheets, and fill in. */
export const TEMPLATE_CSV = [
  TEMPLATE_HEADERS.join(','),
  'mat,"What is the value of 3 + 4 x 2?",14,11,10,24,B,"Multiply first (4 x 2 = 8), then add 3 to get 11."',
  'eng,"Choose the word that is opposite in meaning to ""generous"".",kind,stingy,gentle,rich,B,',
].join('\r\n') + '\r\n'

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, commas/new lines inside quotes, CRLF and a BOM. */
export function parseCsv(text, delimiter = ',') {
  const src = String(text).replace(/^﻿/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

/** Excel in some regions saves CSV with ; or tabs. Pick whichever appears most in the header line. */
function detectDelimiter(text) {
  const head = String(text).replace(/^﻿/, '').split(/\r?\n/, 1)[0] || ''
  const count = (d) => head.split(d).length - 1
  return [',', ';', '\t'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0]
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (h) => clean(h).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export function normaliseSubject(v, fallback = '') {
  const k = clean(v).toLowerCase()
  return SUBJECT_ALIASES[k] || (k === '' ? fallback : '')
}

/** "B", "b", "option b" and 2 all mean the second option in CSV (letters A-D, or numbers 1-4). Returns 0-3 or -1. */
export function parseAnswer(v, { zeroBased = false } = {}) {
  const s = clean(v).toLowerCase().replace(/^(option|answer|ans)\s*/, '').replace(/[.)]$/, '')
  if (/^[a-d]$/.test(s)) return 'abcd'.indexOf(s)
  if (/^[0-9]$/.test(s)) {
    const n = Number(s) - (zeroBased ? 0 : 1)
    return n >= 0 && n <= 3 ? n : -1
  }
  return -1
}

/** Checks one finished row and returns an error message, or '' if it is fine. */
export function rowError(r) {
  if (!SUBJECT_CODES.includes(r.subject)) return 'Subject is missing or not recognised'
  if (!r.body) return 'Question is empty'
  if (r.body.length > LIMITS.body) return `Question is longer than ${LIMITS.body} characters`
  if (r.options.length !== 4 || r.options.some((o) => !o)) return 'All four options (A to D) are needed'
  if (r.options.some((o) => o.length > LIMITS.option)) return `An option is longer than ${LIMITS.option} characters`
  if (new Set(r.options.map((o) => o.toLowerCase())).size < 4) return 'Two options are the same'
  if (!(r.answer >= 0 && r.answer <= 3)) return 'Answer must be A, B, C or D'
  if (r.explanation.length > LIMITS.explanation) return `Explanation is longer than ${LIMITS.explanation} characters`
  return ''
}

function fromCsv(text, fallbackSubject) {
  const rows = parseCsv(text, detectDelimiter(text))
  if (!rows.length) return { error: 'The file is empty.' }
  const head = rows[0].map(norm)
  const col = (...names) => head.findIndex((h) => names.includes(h))
  const idx = {
    subject: col('subject', 'subject_code'),
    body: col('question', 'body', 'q', 'question_text'),
    a: col('option_a', 'a', 'optiona'), b: col('option_b', 'b', 'optionb'), c: col('option_c', 'c', 'optionc'), d: col('option_d', 'd', 'optiond'),
    answer: col('answer', 'correct', 'correct_answer', 'ans'),
    explanation: col('explanation', 'e', 'reason', 'solution'),
  }
  const missing = [['question', idx.body], ['option_a', idx.a], ['option_b', idx.b], ['option_c', idx.c], ['option_d', idx.d], ['answer', idx.answer]].filter(([, i]) => i < 0).map(([n]) => n)
  if (missing.length) return { error: `The first row must be a header row. Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the layout.` }
  if (idx.subject < 0 && !fallbackSubject) return { error: 'Add a "subject" column, or choose a subject to import into.' }
  const out = rows.slice(1).map((r, n) => {
    const get = (i) => (i >= 0 ? clean(r[i]) : '')
    const rawSubject = idx.subject >= 0 ? get(idx.subject) : ''
    return {
      line: n + 2,
      subject: normaliseSubject(rawSubject, fallbackSubject),
      body: get(idx.body),
      options: [get(idx.a), get(idx.b), get(idx.c), get(idx.d)],
      answer: parseAnswer(get(idx.answer)),
      explanation: get(idx.explanation),
    }
  })
  return { rows: out }
}

function fromJson(text, fallbackSubject) {
  let data
  try { data = JSON.parse(String(text).replace(/^﻿/, '')) } catch (e) { return { error: 'This is not valid JSON: ' + e.message } }
  if (data && !Array.isArray(data) && Array.isArray(data.questions)) data = data.questions
  if (!Array.isArray(data)) return { error: 'The JSON file must be a list of questions: [ { ... }, { ... } ]' }
  const out = data.map((o, n) => {
    const x = o && typeof o === 'object' ? o : {}
    let options = x.options ?? x.o ?? x.choices
    if (!Array.isArray(options)) options = [x.option_a ?? x.a, x.option_b ?? x.b, x.option_c ?? x.c, x.option_d ?? x.d]
    const rawAnswer = x.answer ?? x.a
    return {
      line: n + 1,
      subject: normaliseSubject(x.subject, fallbackSubject),
      body: clean(x.question ?? x.body ?? x.q),
      options: options.map(clean),
      // numbers in JSON are positions 0-3 (the same as the files in supabase/questions); letters always work
      answer: typeof rawAnswer === 'number' ? (rawAnswer >= 0 && rawAnswer <= 3 && Number.isInteger(rawAnswer) ? rawAnswer : -1) : parseAnswer(rawAnswer, { zeroBased: true }),
      explanation: clean(x.explanation ?? x.e),
    }
  })
  return { rows: out }
}

/**
 * Turns file text into rows ready to preview.
 * Returns { format, rows: [{ line, subject, body, options, answer, explanation, error }] } or { error }.
 * `error` on a row means it will be skipped; rows repeated inside the file are marked too.
 */
export function parseQuestionFile(text, filename = '', fallbackSubject = '') {
  const t = String(text)
  const isJson = /\.json$/i.test(filename) || (!/\.(csv|txt)$/i.test(filename) && /^\s*[[{]/.test(t))
  const res = isJson ? fromJson(t, fallbackSubject) : fromCsv(t, fallbackSubject)
  if (res.error) return res
  if (!res.rows.length) return { error: 'No questions were found in the file.' }
  if (res.rows.length > LIMITS.rows) return { error: `That file has ${res.rows.length} questions. Please import at most ${LIMITS.rows} at a time.` }
  const seen = new Set()
  const rows = res.rows.map((r) => {
    let error = rowError(r)
    const key = r.subject + '\u0000' + r.body.toLowerCase()
    if (!error && seen.has(key)) error = 'Repeated in this file'
    seen.add(key)
    return { ...r, error }
  })
  return { format: isJson ? 'JSON' : 'CSV', rows }
}

/** The shape the database function expects. */
export const toPayload = (r) => ({ subject: r.subject, body: r.body, options: r.options, answer: r.answer, explanation: r.explanation || null })

/** Splits an array into groups of `size` (the server takes at most 500 per call). */
export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
