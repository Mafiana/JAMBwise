import { useConfirm } from './Confirm.jsx'
import { resetDemo, DEMO_ADMIN, DEMO_PARENT, DEMO_PIN, DEMO_STUDENT, DEMO_TEACHER } from '../lib/demo/accounts.js'

export default function DemoBanner() {
  const confirm = useConfirm()
  const reset = async () => {
    if (await confirm({ title: 'Reset the demo?', message: 'This clears everything you added and restores the sample data.', confirmLabel: 'Reset demo' })) {
      resetDemo()
      window.location.href = '/'
    }
  }
  return (
    <div className="demo" role="note">
      <b>Demo mode.</b> Nothing is sent to a server; data stays in this browser. Log in as admin <code>{DEMO_ADMIN.email}</code>, teacher <code>{DEMO_TEACHER.email}</code> or student{' '}
      <code>{DEMO_STUDENT.email}</code>, password <code>{DEMO_ADMIN.password}</code>. PIN to try on the homepage: <code>{DEMO_PIN}</code>. Parent access: ID <code>{DEMO_PARENT.reg}</code>, code <code>{DEMO_PARENT.code}</code>.{' '}
      <button type="button" className="linkish" onClick={reset}>Reset demo</button>
    </div>
  )
}
