import { resetDemo, DEMO_ADMIN, DEMO_PIN, DEMO_STUDENT } from '../lib/demo/accounts.js'

export default function DemoBanner() {
  const reset = () => {
    if (window.confirm('Reset the demo? This clears everything you added and restores the sample data.')) {
      resetDemo()
      window.location.href = '/'
    }
  }
  return (
    <div className="demo" role="note">
      <b>Demo mode.</b> Nothing is sent to a server; data stays in this browser. Log in as admin <code>{DEMO_ADMIN.email}</code> or student{' '}
      <code>{DEMO_STUDENT.email}</code>, password <code>{DEMO_ADMIN.password}</code>. PIN to try on the homepage: <code>{DEMO_PIN}</code>.{' '}
      <button type="button" className="linkish" onClick={reset}>Reset demo</button>
    </div>
  )
}
