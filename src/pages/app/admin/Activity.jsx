import { ErrorLine } from '../../../components/ui.jsx'
import * as api from '../../../lib/api.js'
import { Empty, fmtDateTime, useLoad, TabLoader } from './shared.jsx'

const LABEL = {
  'pin.create': 'Made a PIN', 'pin.bulk': 'Made PINs in bulk', 'student.edit': 'Edited a student', 'student.suspend': 'Suspended a student',
  'student.plan': 'Changed a plan', 'student.reset': 'Reset progress', 'mock.retake': 'Allowed a mock retake', 'student.delete': 'Deleted a student', 'admin.grant': 'Made an admin',
  'admin.revoke': 'Removed an admin', 'question.add': 'Added a question', 'question.edit': 'Edited a question', 'question.delete': 'Deleted a question', 'plan.price': 'Changed a price', 'ticket.reply': 'Replied to a ticket', 'ticket.resolve': 'Resolved a ticket',
}

export default function Activity() {
  const { data, error, loading } = useLoad(api.adminAudit)
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  return (
    <div className="card tw">
      <h3>Admin activity</h3>
      <p className="sm">The last 300 things admins did. This log is written by the server and cannot be edited.</p>
      <table>
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
        <tbody>{data.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.actor_email || '–'}</td><td>{LABEL[a.action] || a.action}</td><td>{a.detail}</td></tr>)}</tbody>
      </table>
      {data.length === 0 && <Empty>Nothing yet.</Empty>}
    </div>
  )
}
