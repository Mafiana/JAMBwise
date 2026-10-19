import { Link } from 'react-router-dom'
import { SUBJECTS, SUBJECT_KEYS } from '../../lib/constants.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useMyMock, useProgress } from '../../hooks.js'

export default function Progress() {
  const p = useProgress()
  const { user } = useAuth()
  const { mock } = useMyMock(user.id)
  return (
    <>
      <h1>My Progress</h1>
      {p.error && <p className="err">{p.error}</p>}
      <div className="card">
        {SUBJECT_KEYS.map((k) => {
          const a = p.bySubject[k]
          const pct = a ? Math.round((a.correct / a.total) * 100) : 0
          return (
            <div className="ln" key={k}>
              <span>{SUBJECTS[k].name}</span>
              <div className="meter" role="img" aria-label={`${pct}% correct`}><i style={{ width: pct + '%' }} /></div>
              <b>{a ? pct + '%' : '–'}</b>
            </div>
          )
        })}
      </div>
      <h3>CBT mock</h3>
      <div className="card">
        {mock ? (
          <p className="mut" style={{ margin: 0 }}>
            {mock.queued ? 'You have submitted your CBT mock. It will sync when you are back online.' : `You submitted your CBT mock on ${new Date(mock.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.`}{' '}
            Scores are not shown to students. Your result will be released to you by the administrator.
          </p>
        ) : (
          <p className="mut" style={{ margin: 0 }}>You have not taken the CBT mock yet. It can only be written once. Take it from <Link to="/app/mock">CBT Mock</Link> when you are ready.</p>
        )}
      </div>
    </>
  )
}
