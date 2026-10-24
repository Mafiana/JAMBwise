// Rules for the ExamHall integrity guards and the sitting window. Pure functions (covered by `npm test`) plus two small fullscreen helpers.

export const EVENT_LABEL = {
  started: 'Started the exam',
  resumed: 'Came back to an exam that was restored',
  submitted: 'Submitted the exam',
  left_tab: 'Left the exam tab or window',
  left_fullscreen: 'Left full screen',
  limit_reached: 'Warning limit reached, exam submitted automatically',
}

/** Only these count as "left the exam screen" (started / resumed / submitted are just log entries). */
export const isLeave = (e) => e.type === 'left_tab' || e.type === 'left_fullscreen'

/**
 * Adds one "left the exam screen" event. Several browser events fire for one action (switching tab also blurs the window, and may exit
 * full screen), so anything within `gapMs` of the last counted event is not counted again. Returns { events, counted }.
 */
export function mergeEvent(events, ev, gapMs = 2000) {
  const last = events[events.length - 1]
  if (last && ev.at - last.at < gapMs) return { events, counted: false }
  return { events: [...events, ev], counted: true }
}

/** 0 means "warn only": the exam is never submitted automatically. */
export const shouldAutoSubmit = (count, max) => max > 0 && count >= max

/** Where the student stands against the sitting window. `now` is the server's time in ms. */
export function windowState(w, now) {
  if (w?.opens != null && now < w.opens) return 'before'
  if (w?.closes != null && now >= w.closes) return 'closed'
  return 'open'
}

/** When the exam must end, in the device's clock: the full time, or the closing time if that comes first. */
export function examEndsAt(startMs, durationMs, w) {
  const close = w?.closes != null ? w.closes - (w.offset || 0) : Infinity
  return Math.min(startMs + durationMs, close)
}

export const fmtWhen = (ms) => new Date(ms).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "2 days 3 h", "4 h 10 min", "12 min" */
export function fmtCountdown(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60
  if (d) return `${d} day${d === 1 ? '' : 's'} ${h} h`
  if (h) return `${h} h ${mi} min`
  return `${mi} min`
}

// ── full screen (desktop only: phones either do not support it or treat it differently) ──
const desktop = () => { try { return window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches } catch { return false } }
export const canFullscreen = () => typeof document !== 'undefined' && desktop() && Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)
export const inFullscreen = () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
export const enterFullscreen = () => { try { return Promise.resolve(document.documentElement.requestFullscreen()).catch(() => {}) } catch { return Promise.resolve() } }
export const leaveFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) } catch { /* not in full screen */ } }
