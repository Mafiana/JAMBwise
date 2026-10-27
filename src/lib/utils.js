// Pure helpers (no React, no network) so they can be unit-tested with `npm test`.

export const PLAN_LEVEL = { free: 0, student: 1, pro: 2 }

/** Fisher-Yates shuffle that returns a new array. */
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const sample = (arr, n, rnd = Math.random) => shuffle(arr, rnd).slice(0, n)

/** Turns a database row into a question with shuffled options and the new index of the right answer. */
export function prepareQuestion(row, rnd = Math.random) {
  const opts = shuffle(
    row.options.map((text, i) => ({ text, ok: i === row.answer })),
    rnd,
  )
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    options: opts.map((o) => o.text),
    answer: opts.findIndex((o) => o.ok),
    explanation: row.explanation || '',
  }
}

export const fmtTime = (t) => Math.floor(t / 60) + ':' + String(Math.max(0, t) % 60).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Consecutive days with activity. A streak is still alive if the student practised yesterday but not yet today. */
export function streak(timestamps, now = new Date()) {
  const days = new Set(timestamps.map(dayKey))
  const d = new Date(now)
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** The plan a student can actually use right now: an expired paid plan counts as free. */
export function effectivePlan(profile, now = new Date()) {
  if (!profile) return 'free'
  if (profile.plan !== 'free' && profile.plan_expires && new Date(profile.plan_expires) <= now) return 'free'
  return profile.plan
}

export const planLevel = (profile, now) => PLAN_LEVEL[effectivePlan(profile, now)] ?? 0

export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return 0
  const target = new Date(dateStr + 'T00:00:00')
  const start = new Date(dayKey(now) + 'T00:00:00')
  return Math.max(0, Math.round((target - start) / 864e5))
}

/** Totals per subject, overall, and the mock history, from rows of the attempts table. */
export function summarize(attempts) {
  const bySubject = {}
  let correct = 0
  let total = 0
  const mocks = []
  for (const a of attempts) {
    const s = (bySubject[a.subject] ||= { correct: 0, total: 0 })
    s.correct += a.correct
    s.total += a.total
    correct += a.correct
    total += a.total
    if (a.mock_score != null && a.kind === 'mock') mocks.push({ date: dayKey(a.created_at), score: a.mock_score })
  }
  mocks.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  return { bySubject, correct, total, mocks }
}

/** Subject with the lowest accuracy among `subjects`. Subjects never attempted count as 100% so they do not win by default. */
export function weakest(bySubject, subjects) {
  const rate = (k) => (bySubject[k] && bySubject[k].total ? bySubject[k].correct / bySubject[k].total : 1)
  return subjects.slice().sort((a, b) => rate(a) - rate(b))[0]
}

/**
 * Scores a mock. Each subject is worth 100 marks (percentage correct), so four subjects give a total out of 400.
 * `questions` is [{subject, answer}], `answers` is {index: chosenOptionIndex}.
 */
export function scoreMock(subjects, questions, answers) {
  const results = subjects.map((s) => {
    let correct = 0
    let total = 0
    questions.forEach((q, i) => {
      if (q.subject !== s) return
      total++
      if (answers[i] === q.answer) correct++
    })
    return { subject: s, correct, total, score: total ? Math.round((correct / total) * 100) : 0 }
  })
  return { results, total: results.reduce((n, r) => n + r.score, 0) }
}

export const aggregate = (jamb, post) => {
  const j = Math.min(400, Math.max(0, Number(jamb) || 0))
  const p = Math.min(100, Math.max(0, Number(post) || 0))
  return Math.round((j / 8 + p / 2) * 100) / 100
}

/** "abcd efgh" or "ABCD-EFGH" becomes "ABCD-EFGH"; anything that is not 8 letters/digits returns null. */
export function normalizePin(raw) {
  const s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : null
}

export const naira = (kobo) => '₦' + Math.round(kobo / 100).toLocaleString('en-NG')

export const firstName = (name) => String(name || 'Student').trim().split(/\s+/)[0] || 'Student'

/** Numbers for the admin overview, worked out from the student list and payment list. */
export function buildOverview(students, payments, now = new Date()) {
  const t = now.getTime()
  const DAY = 864e5
  const live = (s) => s.plan !== 'free' && (!s.plan_expires || new Date(s.plan_expires).getTime() > t)
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(t - (13 - i) * DAY)))
  const signups = Object.fromEntries(days.map((d) => [d, 0]))
  const revenue = Object.fromEntries(days.map((d) => [d, 0]))
  for (const s of students) { const k = dayKey(s.created_at); if (k in signups) signups[k] += 1 }
  const paid = payments.filter((p) => p.status === 'paid')
  for (const p of paid) { const k = dayKey(p.paid_at || p.created_at); if (k in revenue) revenue[k] += p.amount_kobo }
  const expiring = students
    .filter((s) => live(s) && s.plan_expires && new Date(s.plan_expires).getTime() - t <= 7 * DAY)
    .sort((a, b) => new Date(a.plan_expires) - new Date(b.plan_expires))
  const total = students.length
  return {
    days,
    signups: days.map((d) => signups[d]),
    revenue: days.map((d) => revenue[d]),
    planMix: { free: students.filter((s) => !live(s)).length, student: students.filter((s) => live(s) && s.plan === 'student').length, pro: students.filter((s) => live(s) && s.plan === 'pro').length },
    active7d: students.filter((s) => s.last_active && t - new Date(s.last_active).getTime() <= 7 * DAY).length,
    new7d: students.filter((s) => t - new Date(s.created_at).getTime() <= 7 * DAY).length,
    conversion: total ? Math.round((students.filter(live).length / total) * 100) : 0,
    expiring,
    pending: payments.filter((p) => p.status === 'pending').length,
    revenue30d: paid.filter((p) => t - new Date(p.paid_at || p.created_at).getTime() <= 30 * DAY).reduce((n, p) => n + p.amount_kobo, 0),
  }
}

/** Builds CSV text. Cells that start with = + - @ are prefixed with ' so Excel never runs them as formulas. */
export function toCsv(rows, columns) {
  const cell = (v) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\r\n')
}

/** Friendly ticket number shown to students and admins, e.g. JW-T0042 */
export const ticketNo = (id) => 'JW-T' + String(id).padStart(4, '0')

export const TICKET_STATUS = { new: 'Open', read: 'Seen', answered: 'Answered', resolved: 'Resolved' }

/** Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20 */
export function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pages - 1, page + 1)
  if (from > 2) out.push('…')
  for (let i = from; i <= to; i++) out.push(i)
  if (to < pages - 1) out.push('…r')
  out.push(pages)
  return out
}


export const REPORT_REASONS = [
  ['wrong_answer', 'The marked answer is wrong'],
  ['unclear', 'The question is unclear or has a typo'],
  ['no_correct', 'None of the options is correct'],
  ['off_syllabus', 'It is not in the JAMB syllabus'],
  ['other', 'Something else'],
]

/**
 * Builds the ticket a student sends when they flag a question. `q` is the question as the student saw it
 * (options already shuffled), so the admin sees exactly what the student saw. Stays within the 2000-character ticket limit.
 */
export function questionReport({ q, subjectName, reason, note }) {
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s))
  const label = (REPORT_REASONS.find(([k]) => k === reason) || REPORT_REASONS[REPORT_REASONS.length - 1])[1]
  const lines = [
    `Question #${q.id} · ${subjectName}`,
    `Reason: ${label}`,
    '',
    cut(q.body, 600),
    ...q.options.map((o, i) => `${'ABCD'[i]}. ${cut(o, 120)}${i === q.answer ? '  (marked correct)' : ''}`),
  ]
  const n = String(note || '').trim()
  if (n) lines.push('', 'Student note: ' + cut(n, 500))
  return { subject: cut(`Report: Q#${q.id} (${subjectName})`, 120), body: lines.join('\n') }
}

/** What an admin wants to know about a student at a glance, from that student's attempts rows. */
export function studentReport(attempts) {
  const by = {}
  const mocks = []
  let correct = 0
  let total = 0
  for (const a of attempts) {
    const s = (by[a.subject] ||= { subject: a.subject, correct: 0, total: 0, sessions: 0 })
    s.correct += a.correct
    s.total += a.total
    s.sessions += 1
    correct += a.correct
    total += a.total
    if (a.mock_score != null) mocks.push({ date: a.created_at, score: a.mock_score, kind: a.kind })
  }
  mocks.sort((x, y) => (x.date < y.date ? 1 : -1))
  return {
    total, correct, sessions: attempts.length,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    mocks,
    bestMock: mocks.length ? Math.max(...mocks.map((m) => m.score)) : null,
    subjects: Object.values(by).map((s) => ({ ...s, pct: s.total ? Math.round((s.correct / s.total) * 100) : 0 })).sort((a, b) => b.total - a.total),
  }
}

/** A short two-note chime made in the browser (no sound file). Browsers only allow sound after the person has clicked or typed once on the page; before that it stays silent. */
let chimeCtx = null
if (typeof window !== 'undefined') {
  const unlock = () => { try { chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)(); chimeCtx.resume() } catch { /* no sound available */ } }
  ;['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }))
}
export function playChime() {
  try {
    if (!chimeCtx || chimeCtx.state !== 'running') return
    const t0 = chimeCtx.currentTime
    ;[[880, 0], [1175, 0.16]].forEach(([f, d]) => {
      const o = chimeCtx.createOscillator(); const g = chimeCtx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.45)
      o.connect(g); g.connect(chimeCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.5)
    })
  } catch { /* ignore */ }
}

/** Mail is what people send to support@jambwise.ng without a signed-in ticket: the contact form and the suspended-account box. */
export const isMail = (m) => !m.user_id || m.topic === 'suspended'
