import { useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { naira } from '../../../lib/utils.js'
import { useLoad, TabLoader } from './shared.jsx'

function Row({ p, reload }) {
  const { busy, error, run } = useAction()
  const [naira_, setNaira] = useState(String(p.price_kobo / 100))
  const [saved, setSaved] = useState(false)
  const kobo = Math.round(Number(naira_) * 100)
  const valid = Number.isFinite(kobo) && kobo >= 0 && kobo <= 100000000 && naira_.trim() !== ''
  return (
    <div className="ln" style={{ flexWrap: 'wrap', gap: 12 }}>
      <b style={{ minWidth: 80 }}>{p.name}</b>
      {p.id === 'free' ? <span className="sm">Always free</span> : (
        <>
          <label htmlFor={`pr-${p.id}`} className="sm" style={{ margin: 0 }}>Price per 30 days (₦)</label>
          <input id={`pr-${p.id}`} type="number" min="0" step="50" value={naira_} onChange={(e) => { setNaira(e.target.value); setSaved(false) }} style={{ maxWidth: 140, margin: 0 }} />
          <button className="btn" disabled={busy || !valid || kobo === p.price_kobo} onClick={() => run(async () => { await api.adminSavePlan(p.id, { name: p.name, price_kobo: kobo }); setSaved(true); await reload() }, 'Price saved')}>Save</button>
          {saved && <span className="sm ok" role="status">Saved. Now {naira(kobo)}.</span>}
          <ErrorLine>{error}</ErrorLine>
        </>
      )}
    </div>
  )
}

export default function PriceSettings() {
  const { data, error, loading, reload } = useLoad(api.getPlans)
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  return (
    <div className="card">
      <h3>Plan prices</h3>
      <p className="sm">The homepage, Billing page and Paystack checkout all read these prices. Changing a price affects new payments only; people already subscribed keep what they paid for.</p>
      {data.map((p) => <Row key={p.id} p={p} reload={reload} />)}
    </div>
  )
}
