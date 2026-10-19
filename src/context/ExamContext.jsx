// Holds the practice session and the mock exam so they survive moving between pages
// (a student can glance at the dashboard in the middle of a mock without losing it).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../lib/api.js'
import { useAuth } from './AuthContext.jsx'
import { MOCK_PER_SUBJECT, PRACTICE_SIZE, SECONDS_PER_QUESTION } from '../lib/constants.js'
import { prepareQuestion, sample, scoreMock } from '../lib/utils.js'

const Ctx = createContext(null)

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
    setPending(api.pendingAttemptCount(uid))
  }, [uid, refreshAttempts])
  useEffect(() => {
    if (!uid) return undefined
    syncPending()
    window.addEventListener('online', syncPending)
    return () => window.removeEventListener('online', syncPending)
  }, [uid, syncPending])

  // a different student on the same device must never inherit an exam
  useEffect(() => { setPractice(null); setMock(null) }, [uid])

  // ── practice ──
  const startPractice = useCallback(async (subject) => {
    const rows = await api.getQuestions(subject)
    if (!rows.length) throw new Error('No questions are available for this subject on your plan.')
    const qs = sample(rows, PRACTICE_SIZE).map((r) => prepareQuestion(r))
    setPractice({ subject, qs, i: 0, score: 0, sel: null, done: false, saved: null })
  }, [])

  const pick = useCallback((j) => {
    setPractice((p) => {
      if (!p || p.sel != null) return p
      return { ...p, sel: j, score: p.score + (j === p.qs[p.i].answer ? 1 : 0) }
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
  const startMock = useCallback(async (picked) => {
    const subs = ['eng', ...picked]
    const qs = []
    for (const s of subs) {
      const rows = await api.getQuestions(s)
      if (rows.length < 5) throw new Error('Not enough questions yet for ' + s.toUpperCase() + '. Make sure your plan is active.')
      sample(rows, MOCK_PER_SUBJECT).forEach((r) => qs.push(prepareQuestion(r)))
    }
    setMock({
      subs, qs, i: 0, a: {}, done: false, saved: null,
      endsAt: Date.now() + qs.length * SECONDS_PER_QUESTION * 1000,
    })
  }, [])

  const answerMock = useCallback((j) => setMock((m) => (m && !m.done ? { ...m, a: { ...m.a, [m.i]: j } } : m)), [])
  const gotoMock = useCallback((i) => setMock((m) => (m && !m.done ? { ...m, i: Math.max(0, Math.min(m.qs.length - 1, i)) } : m)), [])

  // Saves the finished mock. One scored mock per student: the database refuses a second one.
  const saveMock = useCallback(async (m) => {
    setMock((x) => (x ? { ...x, saved: 'saving' } : x))
    try {
      // one row per subject; the overall mock score is stored on the first row only
      const res = await api.insertAttempts(m.results.map((r, idx) => ({
        user_id: uid, subject: r.subject, correct: r.correct, total: Math.max(1, r.total), kind: 'mock',
        mock_score: idx === 0 ? m.total : null,
      })))
      setMock((x) => (x ? { ...x, saved: res === 'queued' ? 'queued' : 'ok' } : x))
      if (res === 'queued') setPending(api.pendingAttemptCount(uid)); else refreshAttempts()
    } catch (e) {
      setMock((x) => (x ? { ...x, saved: e.message } : x))
    }
  }, [uid, refreshAttempts])

  const submitMock = useCallback(async () => {
    const m = mockRef.current
    if (!m || m.done) return
    const { results, total } = scoreMock(m.subs, m.qs, m.a)
    const done = { ...m, done: true, results, total, saved: 'saving' }
    mockRef.current = done                      // a second tap or the timer cannot submit twice
    setMock(done)
    await saveMock(done)
  }, [saveMock])

  /** Try again after a failed save (for example a dropped connection). */
  const retryMockSave = useCallback(() => { const m = mockRef.current; if (m?.done) saveMock(m) }, [saveMock])

  // the clock runs here, so the exam still ends on time if the student is on another page
  useEffect(() => {
    if (!mock || mock.done) return undefined
    const id = setInterval(() => {
      const m = mockRef.current
      if (m && !m.done && Date.now() >= m.endsAt) submitMock()
    }, 1000)
    return () => clearInterval(id)
  }, [mock?.done, mock?.endsAt, submitMock]) // eslint-disable-line react-hooks/exhaustive-deps

  const endMock = useCallback(() => setMock(null), [])

  const value = useMemo(() => ({
    version, refreshAttempts, pending, syncPending,
    practice, startPractice, pick, nextQuestion, endPractice,
    mock, startMock, answerMock, gotoMock, submitMock, retryMockSave, endMock,
  }), [version, refreshAttempts, pending, syncPending, practice, startPractice, pick, nextQuestion, endPractice, mock, startMock, answerMock, gotoMock, submitMock, retryMockSave, endMock])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useExam = () => useContext(Ctx)
