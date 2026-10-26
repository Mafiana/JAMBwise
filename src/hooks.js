import { useCallback, useEffect, useState } from 'react'
import * as api from './lib/api.js'
import { summarize } from './lib/utils.js'
import { useExam } from './context/ExamContext.jsx'
import { PLANS } from './lib/constants.js'
import { useDone } from './components/Done.jsx'

/** The signed-in student's attempts, refreshed whenever a practice or mock result is saved. */
export function useProgress() {
  const { version } = useExam()
  const [state, setState] = useState({ loading: true, error: '', attempts: [] })
  useEffect(() => {
    let alive = true
    api.getAttempts()
      .then((attempts) => alive && setState({ loading: false, error: '', attempts }))
      .catch((e) => alive && setState({ loading: false, error: e.message, attempts: [] }))
    return () => { alive = false }
  }, [version])
  return { ...state, ...summarize(state.attempts), attemptDays: state.attempts.map((a) => a.created_at) }
}

/** Whether the student has submitted an exam ('mock' or 'hall'): { loading, mock: null | { date, total? } | { queued } }. */
export function useMyExam(uid, kind) {
  const { version } = useExam()
  const [state, setState] = useState({ loading: true, mock: null })
  useEffect(() => {
    let alive = true
    api.getMyExam(uid, kind).then((mock) => alive && setState({ loading: false, mock }), () => alive && setState({ loading: false, mock: null }))
    return () => { alive = false }
  }, [uid, kind, version])
  return state
}

/** Plans with live prices from the database; falls back to the built-in prices if the request fails. */
export function usePlans() {
  const [prices, setPrices] = useState(null)
  useEffect(() => {
    let alive = true
    api.getPlans().then((rows) => alive && setPrices(Object.fromEntries(rows.map((r) => [r.id, r.price_kobo])))).catch(() => {})
    return () => { alive = false }
  }, [])
  return PLANS.map((p) => ({ ...p, kobo: prices?.[p.id] ?? p.kobo }))
}

/** Re-renders every second while `active`, for countdowns. */
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** Small helper for buttons that call the network: tracks busy state and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const flash = useDone()
  /** Runs `fn`; when it works and `doneMsg` is given, a "Successful" box shows for a moment. */
  const run = useCallback(async (fn, doneMsg) => {
    setBusy(true)
    setError('')
    try {
      const out = await fn()
      if (doneMsg) flash(doneMsg)
      return out
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [flash])
  return { busy, error, setError, run }
}

// ── installing the app (PWA) and connection status ──
let installEvent = null
const installListeners = new Set()
if (typeof window !== 'undefined') {
  // the browser fires this once, early: keep the event so an Install button can use it later
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; installListeners.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { installEvent = null; installListeners.forEach((f) => f()) })
}
const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

/** { installed, canInstall, ios, install() }: canInstall is true when the browser has offered a one-tap install. */
export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    installListeners.add(f)
    return () => installListeners.delete(f)
  }, [])
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return {
    installed: isStandalone(),
    canInstall: Boolean(installEvent),
    ios: /iphone|ipad|ipod/i.test(ua) && !isStandalone(),
    async install() {
      if (!installEvent) return 'unavailable'
      installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      installEvent = null
      installListeners.forEach((f) => f())
      return outcome
    },
  }
}

/** true while the device has a connection (the browser's own best guess). */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

/** True on a computer-sized screen with a mouse (not a phone or tablet). Used to open the exam calculator by itself. */
export function isDesktop() {
  try { return window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches } catch { return false }
}
