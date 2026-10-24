// Builds the admin Scoresheet (CBT Mock or ExamHall) from students and their exam attempts. Pure functions, covered by `npm test`.
// A mock is saved as one row per subject; the row that carries mock_score (out of 400) is the one that counts.

const WINDOW_MS = 60 * 1000 // rows of one mock are saved together, so they are seconds apart at most

export const EXAMS = {
  mock: { label: 'CBT Mock' },
  hall: { label: 'ExamHall' },
}

/** Returns [{ user_id, total, date, subjects: [{ subject, correct, total }] }]: the newest exam of that kind for each student. */
export function latestMocks(attempts, kind = 'mock') {
  const mocks = (attempts || []).filter((a) => a.kind === kind)
  const byUser = new Map()
  for (const a of mocks) (byUser.get(a.user_id) || byUser.set(a.user_id, []).get(a.user_id)).push(a)
  const out = []
  for (const [user_id, rows] of byUser) {
    const scored = rows.filter((r) => r.mock_score != null).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (!scored.length) continue
    const head = scored[0]
    const t = new Date(head.created_at).getTime()
    const subjects = rows
      .filter((r) => r === head || (r.mock_score == null && Math.abs(new Date(r.created_at).getTime() - t) <= WINDOW_MS))
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .map((r) => ({ subject: r.subject, correct: r.correct, total: r.total }))
    out.push({ user_id, total: head.mock_score, date: head.created_at, subjects })
  }
  return out
}

/**
 * Rows for the table and the PDF, best score first. Equal scores share a rank (1, 2, 2, 4).
 * `students` are the admin_students() rows; students who have not written the mock are left out.
 */
export function buildScoresheet(students, attempts, kind = 'mock') {
  const who = new Map((students || []).map((s) => [s.id, s]))
  const rows = latestMocks(attempts, kind)
    .filter((m) => who.has(m.user_id))
    .map((m) => {
      const s = who.get(m.user_id)
      return { id: m.user_id, name: s.full_name || 'Student', reg: s.reg_number || '', email: s.email || '', school: s.school || '', total: m.total, date: m.date, subjects: m.subjects }
    })
    .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)))
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1 })
  return rows
}

export function scoreStats(rows) {
  const n = rows.length
  return {
    count: n,
    average: n ? Math.round(rows.reduce((t, r) => t + r.total, 0) / n) : 0,
    highest: n ? Math.max(...rows.map((r) => r.total)) : 0,
    over300: rows.filter((r) => r.total >= 300).length,
  }
}

/** "ENG 15/20  MAT 12/20 ..." */
export const breakdown = (r) => r.subjects.map((x) => `${x.subject.toUpperCase()} ${x.correct}/${x.total}`).join('   ')
