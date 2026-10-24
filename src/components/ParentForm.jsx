import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorLine } from './ui.jsx'
import Captcha from './Captcha.jsx'
import * as api from '../lib/api.js'
import { setParentSession } from '../lib/parentSession.js'
import { useAction } from '../hooks.js'

/** The parent box: the student's ID, the code the student made, and the parent's name. Used on the home page and on /parent. */
export default function ParentForm({ idPrefix = 'pf' }) {
  const nav = useNavigate()
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ reg: '', code: '', name: '', relationship: 'Mother', website: '' })
  const [captcha, setCaptcha] = useState(null)
  const [fresh, setFresh] = useState(0)
  const onCaptcha = useCallback((c) => setCaptcha(c), [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      try {
        const r = await api.parentLogin({ ...f, captcha })
        setParentSession({ token: r.token, expires_at: r.expires_at, name: f.name.trim() })
        nav('/parent')
      } catch (err) {
        if (err.captcha) setFresh((n) => n + 1)
        throw err
      }
    })
  }
  const id = (n) => idPrefix + '-' + n
  return (
    <form className="parentform" onSubmit={submit} aria-label="Parent access">
      <div className="pf-grid">
        <div>
          <label htmlFor={id('reg')}>Student ID</label>
          <input id={id('reg')} value={f.reg} onChange={set('reg')} placeholder="JW-2026-000123" autoComplete="off" spellCheck="false" maxLength={30} required />
        </div>
        <div>
          <label htmlFor={id('code')}>Parent code</label>
          <input id={id('code')} value={f.code} onChange={set('code')} placeholder="XXXX-XXXX" autoComplete="off" spellCheck="false" maxLength={20} required />
        </div>
        <div>
          <label htmlFor={id('name')}>Your name</label>
          <input id={id('name')} value={f.name} onChange={set('name')} placeholder="e.g. Mrs Okoro" autoComplete="name" maxLength={80} required />
        </div>
        <div>
          <label htmlFor={id('rel')}>You are the student's</label>
          <select id={id('rel')} value={f.relationship} onChange={set('relationship')}>
            <option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option>
          </select>
        </div>
      </div>
      <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
      <Captcha onChange={onCaptcha} resetKey={fresh} />
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy || !captcha}>{busy ? 'Checking…' : 'View progress'}</button>
    </form>
  )
}
