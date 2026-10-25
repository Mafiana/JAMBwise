import { Loader } from './ui.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api.js'
import Icon from './Icons.jsx'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

let turnstileLoading = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve(window.turnstile)
    s.onerror = () => { turnstileLoading = null; reject(new Error('The spam check could not load. Check your connection and refresh.')) }
    document.head.appendChild(s)
  })
  return turnstileLoading
}

/**
 * The spam check on the public contact form. With VITE_TURNSTILE_SITE_KEY set it shows Cloudflare Turnstile;
 * otherwise it shows a small spelled-out sum that the contact-submit Edge Function verifies.
 * `onChange` receives { token, answer } (sum), { turnstile } (Cloudflare) or null (not completed).
 * Change `resetKey` to get a fresh check, for example after the server rejects the last one.
 */
export default function Captcha({ onChange, resetKey = 0 }) {
  return SITE_KEY ? <Turnstile onChange={onChange} resetKey={resetKey} /> : <Sum onChange={onChange} resetKey={resetKey} />
}

function Sum({ onChange, resetKey }) {
  const [c, setC] = useState(null)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState('')
  const load = useCallback(async () => {
    setError(''); setAnswer(''); onChange(null)
    try { setC(await api.getCaptcha()) } catch (e) { setC(null); setError(e.message) }
  }, [onChange])
  useEffect(() => { load() }, [load, resetKey])
  const change = (e) => {
    const v = e.target.value.replace(/[^\d-]/g, '').slice(0, 3)
    setAnswer(v)
    onChange(c && v ? { token: c.token, answer: v } : null)
  }
  return (
    <div className="captcha">
      <label htmlFor="cc-a">Quick check, to keep spam out</label>
      {c ? (
        <div className="captcha-row">
          <span className="captcha-q">{c.question}</span>
          <input id="cc-a" inputMode="numeric" autoComplete="off" value={answer} onChange={change} placeholder="Your answer" aria-describedby="cc-h" />
          <button type="button" className="btn ghost" onClick={load} aria-label="Get a different question"><Icon name="arrow" size={16} /> New</button>
        </div>
      ) : error ? <p className="err" role="alert">{error}</p> : <Loader size="sm" label="Getting your question…" />}
      <p className="sm" id="cc-h" style={{ margin: '4px 0 0' }}>Type the answer as a number, for example 9.</p>
    </div>
  )
}

function Turnstile({ onChange, resetKey }) {
  const box = useRef(null)
  const widget = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let dead = false
    loadTurnstile().then((t) => {
      if (dead || !box.current) return
      widget.current = t.render(box.current, {
        sitekey: SITE_KEY,
        callback: (token) => onChange({ turnstile: token }),
        'expired-callback': () => onChange(null),
        'error-callback': () => onChange(null),
      })
    }).catch((e) => setError(e.message))
    return () => { dead = true; try { if (widget.current != null) window.turnstile?.remove(widget.current) } catch { /* already gone */ } }
  }, [onChange])
  useEffect(() => { if (resetKey && widget.current != null) { onChange(null); try { window.turnstile?.reset(widget.current) } catch { /* ignore */ } } }, [resetKey, onChange])
  return <div className="captcha">{error ? <p className="err" role="alert">{error}</p> : <div ref={box} />}</div>
}
