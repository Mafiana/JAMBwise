// Keeps the exam in progress on the device so a refresh, a crash or a power cut does not lose it. The clock does not pause:
// `endsAt` is an absolute time, so a student who comes back late simply has less time left (or the exam is submitted at once).
const KEY = 'jw_exam_inprogress'
const VERSION = 1
const store = (s) => s || (typeof localStorage !== 'undefined' ? localStorage : null)

export function saveExam(uid, m, s) {
  try {
    const st = store(s)
    if (!st || !uid || !m) return
    if (m.saved === 'ok' || m.saved === 'queued') { st.removeItem(KEY); return }   // delivered: nothing to resume
    const { kind, subs, qs, i, a, endsAt, events, maxViolations, closes, done, results, total } = m
    st.setItem(KEY, JSON.stringify({ v: VERSION, uid, kind, subs, qs, i, a, endsAt, events: events || [], maxViolations, closes: closes ?? null, done: Boolean(done), results, total, saved: null }))
  } catch { /* storage full or blocked: the exam still runs, it just cannot be resumed */ }
}

/** Returns the saved exam for this student, ready to put back into state, or null. */
export function loadExam(uid, s) {
  try {
    const st = store(s)
    const r = JSON.parse(st?.getItem(KEY))
    if (!r || r.v !== VERSION || r.uid !== uid) return null
    if (!['mock', 'hall'].includes(r.kind) || !Array.isArray(r.qs) || !r.qs.length || !Array.isArray(r.subs) || !Number.isFinite(r.endsAt)) return null
    if (r.saved) return null                                    // already delivered: nothing to resume
    const m = { ...r, i: Math.min(Math.max(0, r.i | 0), r.qs.length - 1), a: r.a || {}, events: r.events || [], resumed: true, saved: null }
    delete m.v; delete m.uid
    if (m.done) m.saved = 'Your answers were submitted but may not have reached the server before the page closed. Tap Try again.'
    return m
  } catch { return null }
}

export function clearExam(s) { try { store(s)?.removeItem(KEY) } catch { /* nothing to clear */ } }
