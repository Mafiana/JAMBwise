import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { ErrorLine, Loader, PlanCard } from '../../components/ui.jsx'
import * as api from '../../lib/api.js'
import { useAction, usePlans } from '../../hooks.js'

/** After Paystack sends the student back, wait for our webhook to confirm the payment. */
function useReturnFromPaystack(reference, refreshProfile) {
  const [state, setState] = useState(reference ? 'checking' : 'none')
  useEffect(() => {
    if (!reference) return undefined
    let alive = true
    let tries = 0
    const tick = async () => {
      tries++
      try {
        const pay = await api.getPayment(reference)
        if (!alive) return
        if (pay?.status === 'paid') {
          await refreshProfile()
          if (alive) setState('paid')
          return
        }
        if (pay?.status === 'failed') return setState('failed')
      } catch { /* try again */ }
      if (tries >= 15) return setState('slow')
      setTimeout(tick, 2000)
    }
    tick()
    return () => { alive = false }
  }, [reference]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export default function Billing() {
  const { profile, plan, refreshProfile } = useAuth()
  const plans = usePlans()
  const [params] = useSearchParams()
  const ret = useReturnFromPaystack(params.get('reference') || params.get('trxref'), refreshProfile)
  const { busy, error, run } = useAction()
  const [target, setTarget] = useState('')
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState(null)   // { code, quotes: { student: quote, pro: quote } }
  const [codeMsg, setCodeMsg] = useState({ ok: false, text: '' })
  const [checking, setChecking] = useState(false)
  const apply = async () => {
    const c = code.trim().toUpperCase()
    if (!c) return
    setChecking(true); setCodeMsg({ ok: false, text: '' })
    try {
      const [student, pro] = await Promise.all([api.couponQuote(c, 'student'), api.couponQuote(c, 'pro')])
      const good = [['Student', student], ['Pro', pro]].filter(([, q]) => q.valid)
      if (!good.length) { setApplied(null); setCodeMsg({ ok: false, text: student.message }) }
      else { setApplied({ code: c, quotes: { student, pro } }); setCode(c); setCodeMsg({ ok: true, text: `${good[0][1].percent}% off applied${good.length === 1 ? ' to the ' + good[0][0] + ' plan' : ''}.` }) }
    } catch (e) { setApplied(null); setCodeMsg({ ok: false, text: e.message }) }
    setChecking(false)
  }
  const clearCode = () => { setApplied(null); setCode(''); setCodeMsg({ ok: false, text: '' }) }
  const quoteFor = (id) => (applied?.quotes[id]?.valid ? applied.quotes[id] : null)

  const pay = (id) => {
    setTarget(id)
    run(async () => {
      const { url } = await api.startCheckout(id, quoteFor(id) ? applied.code : '')
      window.location.href = url
    })
  }
  const expires = profile.plan_expires ? new Date(profile.plan_expires).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  return (
    <>
      <h1>Plans</h1>
      {ret === 'checking' && <Loader size="sm" label="Confirming your payment…" />}
      {ret === 'paid' && <p className="notice" role="status">Payment received. Your plan is active.</p>}
      {ret === 'slow' && <p className="notice" role="status">We have not heard back from Paystack yet. If you were charged, your plan will appear within a few minutes. Refresh this page to check.</p>}
      {ret === 'failed' && <p className="err">That payment did not go through. You have not been charged.</p>}
      {plan !== 'free' && expires && <p className="mut">Your <b>{plan}</b> plan is active until <b>{expires}</b>. Paying again adds 30 days.</p>}
      {profile.plan !== 'free' && plan === 'free' && <p className="err">Your paid plan expired on {expires}. Renew below to get your access back.</p>}
      <ErrorLine>{error}</ErrorLine>
      <div className="coupon-box">
        <label htmlFor="cp">Have a discount code?</label>
        <div className="coupon-row">
          <input id="cp" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (applied) setApplied(null); setCodeMsg({ ok: false, text: '' }) }} onKeyDown={(e) => e.key === 'Enter' && apply()} maxLength={20} placeholder="Enter your code" autoComplete="off" spellCheck={false} />
          <button type="button" className="btn" onClick={apply} disabled={checking || !code.trim()}>{checking ? 'Checking…' : 'Apply'}</button>
          {applied && <button type="button" className="linkish" onClick={clearCode}>Remove</button>}
        </div>
        {codeMsg.text && <p className={codeMsg.ok ? 'ok' : 'err'} role="status" style={{ margin: '6px 0 0' }}>{codeMsg.text}</p>}
      </div>
      <div className="grid">
        {plans.map((p0) => {
          const q = quoteFor(p0.id)
          const p = q ? { ...p0, kobo: q.final_kobo, was: q.list_kobo } : p0
          return (
          <PlanCard key={p.id} plan={p} current={plan === p.id} hot={p.id === 'student' && plan !== 'student'}>
            {p.id === 'free' ? (
              <button className="btn" disabled>{plan === 'free' ? 'Current plan' : 'Free forever'}</button>
            ) : (
              <button className="btn" onClick={() => pay(p.id)} disabled={busy}>
                {busy && target === p.id ? 'Opening Paystack…' : plan === p.id ? 'Renew for 30 days' : `Pay for ${p.name}`}
              </button>
            )}
          </PlanCard>
          )
        })}
      </div>
      <p className="sm">Payments are processed by Paystack. Each payment gives 30 days of access and does not renew automatically.</p>
    </>
  )
}
