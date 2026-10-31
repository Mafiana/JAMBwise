import { useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { useLoad, TabLoader } from './shared.jsx'

const PLAN_LABEL = { all: 'All paid plans', student: 'Student plan', pro: 'Pro plan' }

// Random 8-character code; leaves out look-alike characters (0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode() {
  const r = new Uint32Array(8)
  crypto.getRandomValues(r)
  return 'JW' + Array.from(r.slice(0, 6), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('')
}

function status(c) {
  if (!c.active) return 'Off'
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return 'Expired'
  if (c.max_uses != null && c.used_count >= c.max_uses) return 'Fully used'
  return 'Active'
}

function NewCode({ reload }) {
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ code: '', percent: '20', plan: 'all', expires: '', max: '' })
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const t = f.code.trim()
    if (!t) return
    try { await navigator.clipboard.writeText(t) } catch {
      const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      el.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api.adminSaveCoupon({
        code: f.code.trim().toUpperCase(),
        percent: Number(f.percent),
        plan: f.plan,
        expires: f.expires ? f.expires + 'T23:59:59' : null,
        maxUses: f.max.trim() ? Number(f.max) : null,
      })
      setF({ code: '', percent: '20', plan: 'all', expires: '', max: '' })
      await reload()
    }, 'Discount code created')
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>New discount code</h3>
      <p className="sm">Students type the code on the Plans page. The discount is worked out on the server, so it cannot be faked. 15–20% is a good level; stay at or below 25%.</p>
      <label htmlFor="cc-code">Code</label>
      <input id="cc-code" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} maxLength={20} placeholder="e.g. JAMB20" required />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button type="button" className="btn" onClick={() => { setF((x) => ({ ...x, code: randomCode() })); setCopied(false) }}>Generate code</button>
        <button type="button" className="btn" onClick={copy} disabled={!f.code.trim()} aria-label="Copy code" title="Copy code" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <label htmlFor="cc-pct">Discount (%)</label>
      <input id="cc-pct" type="number" min="1" max="90" step="1" value={f.percent} onChange={set('percent')} required />
      <label htmlFor="cc-plan">Plan</label>
      <select id="cc-plan" value={f.plan} onChange={set('plan')}>
        {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label htmlFor="cc-end">Last day (optional)</label>
      <input id="cc-end" type="date" value={f.expires} onChange={set('expires')} />
      <label htmlFor="cc-max">Maximum uses (optional)</label>
      <input id="cc-max" type="number" min="1" step="1" value={f.max} onChange={set('max')} placeholder="No limit" />
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy || !f.code.trim()}>{busy ? 'Saving…' : 'Create code'}</button>
    </form>
  )
}

function CodeRow({ c, reload }) {
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const st = status(c)
  return (
    <div className="ln" style={{ flexWrap: 'wrap', gap: 10 }}>
      <b style={{ minWidth: 100, letterSpacing: '.05em' }}>{c.code}</b>
      <span>{c.percent}% off</span>
      <span className="sm">{PLAN_LABEL[c.plan]}</span>
      <span className="sm">Used {c.used_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</span>
      <span className="sm">{c.expires_at ? 'Ends ' + new Date(c.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No end date'}</span>
      <span className={st === 'Active' ? 'sm ok' : 'sm'}>{st}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy} onClick={() => run(async () => { await api.adminSetCouponActive(c.id, !c.active); await reload() }, c.active ? 'Code switched off' : 'Code switched on')}>{c.active ? 'Turn off' : 'Turn on'}</button>
        <button className="btn danger" disabled={busy} onClick={async () => {
          if (await confirm({ title: 'Delete this code?', message: `${c.code} will stop working straight away. Past payments are not affected.`, confirmLabel: 'Delete', danger: true })) {
            run(async () => { await api.adminDeleteCoupon(c.id); await reload() }, 'Code deleted')
          }
        }}>Delete</button>
      </span>
      <ErrorLine>{error}</ErrorLine>
    </div>
  )
}

export default function Coupons() {
  const { data, error, loading, reload } = useLoad(api.adminCoupons)
  if (loading) return <TabLoader />
  return (
    <>
      <NewCode reload={reload} />
      <div className="card">
        <h3>Your codes</h3>
        {!data ? <ErrorLine>{error}</ErrorLine> : data.length === 0 ? <p className="sm">No codes yet.</p> : data.map((c) => <CodeRow key={c.id} c={c} reload={reload} />)}
      </div>
    </>
  )
}
