import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useMyMock, useProgress } from '../../hooks.js'
import Icon from '../../components/Icons.jsx'
import InstallApp from '../../components/InstallApp.jsx'
import { daysUntil, firstName, streak } from '../../lib/utils.js'

export default function Dashboard() {
  const { profile, user } = useAuth()
  const p = useProgress()
  const mockState = useMyMock(user.id)
  const days = daysUntil(profile.exam_date)
  const accuracy = p.total ? Math.round((p.correct / p.total) * 100) : 0
  const profileDone = profile.course && profile.school
  return (
    <>
      <h1>Hello, {firstName(profile.full_name)}</h1>
      <p className="mut">
        {days > 0 ? `${days} days to your exam. ` : 'Set your exam date in the Study Planner. '}
        A little practice every day beats cramming.
      </p>
      {!profileDone && (
        <p className="notice">Finish your profile so JAMBwise knows your course and target university. <Link to="/app/profile">Open profile</Link></p>
      )}
      {p.error && <p className="err">{p.error}</p>}
      <InstallApp />
      <div className="stat-grid">
        <div className="card st"><span className="ic gold"><Icon name="flame" /></span><b>{streak(p.attemptDays)}</b><span>day streak</span></div>
        <div className="card st"><span className="ic"><Icon name="book" /></span><b>{p.total}</b><span>questions done</span></div>
        <div className="card st"><span className="ic"><Icon name="target" /></span><b>{accuracy}%</b><span>accuracy</span></div>
        <div className="card st"><span className="ic gold"><Icon name="trophy" /></span><b>{mockState.loading ? '–' : mockState.mock ? 'Done' : 'Not yet'}</b><span>CBT mock</span></div>
      </div>
      <h3>Start now</h3>
      <div className="grid">
        <Link className="card action" to="/app/practice"><span className="ic"><Icon name="practice" /></span><div><b>Practice</b><span className="mut">One subject, instant answers</span></div></Link>
        <Link className="card action" to="/app/mock"><span className="ic"><Icon name="mock" /></span><div><b>CBT Mock</b><span className="mut">English plus 3 subjects, timed</span></div></Link>
      </div>
    </>
  )
}
