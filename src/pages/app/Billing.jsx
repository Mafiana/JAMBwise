import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { ErrorLine, PlanCard } from '../../components/ui.jsx'
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

  const pay = (id) => {
    setTarget(id)
    run(async () => {
      const { url } = await api.startCheckout(id)
      window.location.href = url
    })
  }
  const expires = profile.plan_expires ? new Date(profile.plan_expires).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  return (
    <>
      <h1>Plans</h1>
      {ret === 'checking' && <p className="notice" role="status">Confirming your payment…</p>}
      {ret === 'paid' && <p className="notice" role="status">Payment received. Your plan is active.</p>}
      {ret === 'slow' && <p className="notice" role="status">We have not heard back from Paystack yet. If you were charged, your plan will appear within a few minutes. Refresh this page to check.</p>}
      {ret === 'failed' && <p className="err">That payment did not go through. You have not been charged.</p>}
      {plan !== 'free' && expires && <p className="mut">Your <b>{plan}</b> plan is active until <b>{expires}</b>. Paying again adds 30 days.</p>}
      {profile.plan !== 'free' && plan === 'free' && <p className="err">Your paid plan expired on {expires}. Renew below to get your access back.</p>}
      <ErrorLine>{error}</ErrorLine>
      <div className="grid">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} current={plan === p.id} hot={p.id === 'student' && plan !== 'student'}>
            {p.id === 'free' ? (
              <button className="btn" disabled>{plan === 'free' ? 'Current plan' : 'Free forever'}</button>
            ) : (
              <button className="btn" onClick={() => pay(p.id)} disabled={busy}>
                {busy && target === p.id ? 'Opening Paystack…' : plan === p.id ? 'Renew for 30 days' : `Pay for ${p.name}`}
              </button>
            )}
          </PlanCard>
        ))}
      </div>
      <p className="sm">Payments are processed by Paystack. Each payment gives 30 days of access and does not renew automatically.</p>
    </>
  )
}
