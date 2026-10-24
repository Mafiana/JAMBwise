import { useEffect, useRef, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { copyText, PLAN_IDS } from './shared.jsx'

export const makePassword = () => {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(10)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => al[n % al.length]).join('')
}

/** "Add student" / "Add teacher": makes the real account (Edge Function), then shows the login details once. */
export default function AddUser({ role, onClose, onDone }) {
  const teacher = role === 'teacher'
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ name: '', email: '', password: makePassword(), plan: 'free', days: 30, course: '', school: '' })
  const [made, setMade] = useState(null)
  const [copied, setCopied] = useState(false)
  const first = useRef(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => {
    first.current?.focus()
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api.adminCreateUser({ ...f, role, days: Number(f.days) || 30 })
      setMade({ email: f.email.trim().toLowerCase(), password: f.password, name: f.name.trim() })
      await onDone()
    })
  }
  const title = teacher ? 'Add teacher' : 'Add student'
  return (
    <div className="modal-back">
      <div className="modal form" role="dialog" aria-modal="true" aria-label={title}>
        {made ? (
          <>
            <h3>{teacher ? 'Teacher' : 'Student'} added</h3>
            <p className="sm">Give {made.name} these login details. The password is not shown again, so copy it now. They can change it in Settings after logging in.</p>
            <div className="card flat">
              <div className="ln"><span>Email</span><b>{made.email}</b></div>
              <div className="ln"><span>Password</span><b><code>{made.password}</code></b></div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={async () => { await copyText(`Email: ${made.email}\nPassword: ${made.password}`); setCopied(true) }}>{copied ? 'Copied' : 'Copy details'}</button>
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3>{title}</h3>
            <p className="sm">{teacher ? 'Makes a teacher account straight away.' : 'Makes a student account straight away. It appears in your students list and in the database.'}</p>
            <label htmlFor="au-n">Full name</label>
            <input id="au-n" ref={first} required maxLength={100} value={f.name} onChange={set('name')} />
            <label htmlFor="au-e">Email</label>
            <input id="au-e" type="email" required maxLength={200} value={f.email} onChange={set('email')} />
            <label htmlFor="au-p">Password (at least 8 characters)</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="au-p" required minLength={8} maxLength={72} value={f.password} onChange={set('password')} style={{ margin: 0 }} />
              <button type="button" className="btn danger" onClick={() => setF({ ...f, password: makePassword() })}>Generate</button>
            </div>
            {!teacher && (
              <>
                <label htmlFor="au-pl">Plan</label>
                <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                  <select id="au-pl" value={f.plan} onChange={set('plan')} style={{ margin: 0 }}>{PLAN_IDS.map((p) => <option key={p}>{p}</option>)}</select>
                  {f.plan !== 'free' && <input aria-label="Days of access" type="number" min="1" max="3650" value={f.days} onChange={set('days')} style={{ maxWidth: 90, margin: 0 }} />}
                  {f.plan !== 'free' && <span className="sm">days</span>}
                </div>
                <label htmlFor="au-c">Course (optional)</label>
                <input id="au-c" maxLength={100} value={f.course} onChange={set('course')} />
                <label htmlFor="au-s">Target university (optional)</label>
                <input id="au-s" maxLength={100} value={f.school} onChange={set('school')} />
              </>
            )}
            <ErrorLine>{error}</ErrorLine>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Creating…' : title}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
