// Holds the practice session and the mock exam so they survive moving between pages
// (a student can glance at the dashboard in the middle of a mock without losing it).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../lib/api.js'
import { useAuth } from './AuthContext.jsx'
import { mockCountFor, PRACTICE_SIZE, SECONDS_PER_QUESTION } from '../lib/constants.js'
import { prepareQuestion, sampleFresh, scoreMock } from '../lib/utils.js'
import { canFullscreen, examEndsAt, fmtWhen, inFullscreen, leaveFullscreen, mergeEvent, shouldAutoSubmit, windowState } from '../lib/integrity.js'
import { clearExam, loadExam, saveExam } from '../lib/examStore.js'

const Ctx = createContext(null)

// Questions this student was already given, kept on this device per subject, so the next exam or practice round
// is reshuffled from questions they have not seen. Only the newest ones are remembered (older ones can come back).
const seenKey = (uid, subject) => `jw_seen:${uid}:${subject}`
function readSeen(uid, subject) {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(uid, subject)) || '[]')) } catch { return new Set() }
}
function writeSeen(uid, subject, ids, keep) {
  try { localStorage.setItem(seenKey(uid, subject), JSON.stringify(ids.slice(-keep))) } catch { /* storage full or blocked: the picks are still random */ }
}
/** Random picks that avoid what the student has seen; remembers the new picks. */
function pickFor(uid, subject, rows, n) {
  const seen = uid ? readSeen(uid, subject) : new Set()
  const picked = sampleFresh(rows, n, seen)
  if (uid) {
    const live = new Set(rows.map((r) => r.id))
    const old = [...seen].filter((id) => live.has(id) && !picked.some((p) => p.id === id))   // drop ids of deleted questions
    // once every question has been seen, start over with only this round remembered
    const all = seen.size + picked.filter((p) => !seen.has(p.id)).length >= rows.length
    writeSeen(uid, subject, all ? picked.map((p) => p.id) : [...old, ...picked.map((p) => p.id)], Math.max(rows.length, 1))
  }
  return picked
}

export function ExamProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id
  const [version, setVersion] = useState(0) // bumps whenever new results are saved, so progress screens refresh
  const [practice, setPractice] = useState(null)
  const [mock, setMock] = useState(null)
  const mockRef = useRef(null)
  mockRef.current = mock

  const refreshAttempts = useCallback(() => setVersion((v) => v + 1), [])

  // results earned offline wait on the device; send them as soon as the connection is back
  const [pending, setPending] = useState(0)
  const syncPending = useCallback(async () => {
    if (!uid) return
    try { if (await api.flushPendingAttempts(uid)) refreshAttempts() } catch { /* try again next time */ }
    try { await api.flushExamEvents(uid) } catch { /* try again next time */ }
    setPending(api.pendingAttemptCount(uid))
  }, [uid, refreshAttempts])
  useEffect(() => {
    if (!uid) return undefined
    syncPending()
    window.addEventListener('online', syncPending)
    return () => window.removeEventListener('online', syncPending)
  }, [uid, syncPending])

  // a different student on the same device must never inherit an exam; the same student gets their unfinished exam back
  useEffect(() => { setPractice(null); setMock(uid ? loadExam(uid) : null) }, [uid])

  // every change to the exam is kept on the device, so a refresh or a power cut loses nothing
  useEffect(() => { if (uid && mock) saveExam(uid, mock) }, [uid, mock])

  // ── practice ──
  const startPractice = useCallback(async (subject) => {
    const rows = await api.getQuestions(subject)
    if (!rows.length) throw new Error('No questions are available for this subject on your plan.')
    const qs = pickFor(uid, subject, rows, PRACTICE_SIZE).map((r) => prepareQuestion(r))
    setPractice({ subject, qs, i: 0, score: 0, sel: null, done: false, saved: null, marks: [] })
  }, [uid])

  const pick = useCallback((j) => {
    setPractice((p) => {
      if (!p || p.sel != null) return p
      const ok = j === p.qs[p.i].answer
      const marks = (p.marks || []).slice(); marks[p.i] = ok ? 1 : 0
      return { ...p, sel: j, marks, score: p.score + (ok ? 1 : 0) }
    })
  }, [])

  const nextQuestion = useCallback(async () => {
    const p = practice
    if (!p || p.sel == null) return
    if (p.i + 1 < p.qs.length) {
      setPractice({ ...p, i: p.i + 1, sel: null })
      return
    }
    setPractice({ ...p, done: true, saved: 'saving' })
    try {
      const res = await api.insertAttempts([{ user_id: uid, subject: p.subject, correct: p.score, total: p.qs.length, kind: 'practice' }])
      setPractice((x) => (x ? { ...x, saved: res === 'queued' ? 'queued' : 'ok' } : x))
      if (res === 'queued') setPending(api.pendingAttemptCount(uid)); else refreshAttempts()
    } catch (e) {
      setPractice((x) => (x ? { ...x, saved: e.message } : x))
    }
  }, [practice, uid, refreshAttempts])

  const endPractice = useCallback(() => setPractice(null), [])

  // ── mock ──
  /** kind: 'mock' (CBT Mock) or 'hall' (ExamHall). Both are the same exam; they differ in who may see the score. */
  const startMock = useCallback(async (picked, kind = 'mock') => {
    // ExamHall can be scheduled: check the window now (not only when the page was opened) against the SERVER's clock
    const win = kind === 'hall' ? await api.getExamWindow('hall') : null
    if (win) {
      const st = windowState(win, Date.now() + win.offset)
      if (st === 'before') throw new Error('ExamHall opens on ' + fmtWhen(win.opens - win.offset) + '. Please come back then.')
      if (st === 'closed') throw new Error('ExamHall closed on ' + fmtWhen(win.closes - win.offset) + '.')
    }
    const subs = ['eng', ...picked]
    const qs = []
    for (const s of subs) {
      const rows = await api.getQuestions(s)
      if (rows.length < 5) throw new Error('Not enough questions yet for ' + s.toUpperCase() + '. Make sure your plan is active.')
      pickFor(uid, s, rows, mockCountFor(s)).forEach((r) => qs.push(prepareQuestion(r)))
    }
    const endsAt = examEndsAt(Date.now(), qs.length * SECONDS_PER_QUESTION * 1000, win)   // never later than the closing time
    if (endsAt - Date.now() < 60 * 1000) throw new Error('ExamHall closes in less than a minute, so it cannot be started now.')
    setMock({
      kind, subs, qs, i: 0, a: {}, done: false, saved: null, endsAt,
      events: [], maxViolations: win ? win.maxViolations : 0, closes: win?.closes != null ? win.closes - win.offset : null,
    })
    api.logExamEvent(uid, { kind, type: 'started', at: new Date().toISOString() })
  }, [uid])

  const answerMock = useCallback((j) => setMock((m) => (m && !m.done ? { ...m, a: { ...m.a, [m.i]: j } } : m)), [])
  const gotoMock = useCallback((i) => setMock((m) => (m && !m.done ? { ...m, i: Math.max(0, Math.min(m.qs.length - 1, i)) } : m)), [])

  // Saves the finished mock. One scored mock per student: the database refuses a second one.
  const saveMock = useCallback(async (m) => {
    setMock((x) => (x ? { ...x, saved: 'saving' } : x))
    try {
      // one row per subject; the overall mock score is stored on the first row only
      const res = await api.insertAttempts(m.results.map((r, idx) => ({
        user_id: uid, subject: r.subject, correct: r.correct, total: Math.max(1, r.total), kind: m.kind || 'mock',
        mock_score: idx === 0 ? m.total : null,
      })))
      setMock((x) => (x ? { ...x, saved: res === 'queued' ? 'queued' : 'ok' } : x))
      clearExam()                                  // delivered (or safely queued): nothing left to resume
      leaveFullscreen()
      if (res === 'queued') setPending(api.pendingAttemptCount(uid)); else refreshAttempts()
    } catch (e) {
      setMock((x) => (x ? { ...x, saved: e.message } : x))
    }
  }, [uid, refreshAttempts])

  /** `why`: 'student' (pressed Submit), 'time' (the clock ran out) or 'warnings' (too many warnings). Recorded in the exam log. */
  const submitMock = useCallback(async (why = 'student') => {
    const m = mockRef.current
    if (!m || m.done) return
    api.logExamEvent(uid, { kind: m.kind, type: 'submitted', at: new Date().toISOString(), detail: { student: 'Submitted by the student', time: 'Time ran out', warnings: 'Warning limit reached' }[why] || '' })
    const { results, total } = scoreMock(m.subs, m.qs, m.a)
    const done = { ...m, done: true, results, total, saved: 'saving' }
    mockRef.current = done                      // a second tap or the timer cannot submit twice
    setMock(done)
    await saveMock(done)
  }, [saveMock, uid])

  /** Try again after a failed save (for example a dropped connection). */
  const retryMockSave = useCallback(() => { const m = mockRef.current; if (m?.done) saveMock(m) }, [saveMock])

  // the clock runs here, so the exam still ends on time if the student is on another page
  useEffect(() => {
    if (!mock || mock.done) return undefined
    const id = setInterval(() => {
      const m = mockRef.current
      if (m && !m.done && Date.now() >= m.endsAt) submitMock('time')
    }, 1000)
    return () => clearInterval(id)
  }, [mock?.done, mock?.endsAt, submitMock]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ExamHall integrity guards: leaving the tab, the window or full screen is recorded, warned about, and sent to the admin ──
  const record = useCallback((type) => {
    const m = mockRef.current
    if (!m || m.done || m.kind !== 'hall') return
    const at = Date.now()
    const { events, counted } = mergeEvent(m.events || [], { type, at })
    if (!counted) return
    const hit = shouldAutoSubmit(events.length, m.maxViolations)
    const next = { ...m, events, warn: { n: events.length, max: m.maxViolations, type, hit } }
    mockRef.current = next
    setMock(next)
    api.logExamEvent(uid, { kind: m.kind, type, at: new Date(at).toISOString(), detail: `Warning ${events.length}${m.maxViolations > 0 ? ' of ' + m.maxViolations : ''}` })
    if (hit) { api.logExamEvent(uid, { kind: m.kind, type: 'limit_reached', at: new Date().toISOString() }); submitMock('warnings') }
  }, [uid, submitMock])

  const guarding = Boolean(mock && !mock.done && mock.kind === 'hall')
  useEffect(() => {
    if (!guarding) return undefined
    const wasFs = { v: inFullscreen() }
    const onVisible = () => { if (document.hidden) record('left_tab') }
    const onBlur = () => record('left_tab')
    const onFs = () => {
      if (inFullscreen()) { wasFs.v = true; return }
      if (wasFs.v) { wasFs.v = false; record('left_fullscreen') }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [guarding, record])

  const ackWarn = useCallback(() => {
    const m = mockRef.current
    if (m?.resumed && !m.done) api.logExamEvent(uid, { kind: m.kind, type: 'resumed', at: new Date().toISOString() })
    setMock((x) => { if (!x) return x; const n = { ...x, warn: null, resumed: false }; mockRef.current = n; return n })
  }, [uid])
  /** ExamHall wants full screen on a computer. */
  const needsFullscreen = guarding && canFullscreen()

  const endMock = useCallback(() => { clearExam(); leaveFullscreen(); setMock(null) }, [])
  /** The student has seen the "Successfully submitted" box (CBT Mock only: it then shows the result). */
  const ackMock = useCallback(() => setMock((m) => (m ? { ...m, ack: true } : m)), [])

  const value = useMemo(() => ({
    version, refreshAttempts, pending, syncPending,
    practice, startPractice, pick, nextQuestion, endPractice,
    mock, startMock, answerMock, gotoMock, submitMock, retryMockSave, endMock, ackMock, ackWarn, needsFullscreen,
  }), [version, refreshAttempts, pending, syncPending, practice, startPractice, pick, nextQuestion, endPractice, mock, startMock, answerMock, gotoMock, submitMock, retryMockSave, endMock, ackMock, ackWarn, needsFullscreen])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useExam = () => useContext(Ctx)
