import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useExam } from '../../context/ExamContext.jsx'
import Icon from '../../components/Icons.jsx'
import { ErrorLine } from '../../components/ui.jsx'
import { PRACTICE_SIZE, SUBJECTS, SUBJECT_KEYS } from '../../lib/constants.js'
import { useAction } from '../../hooks.js'

function Question({ s }) {
  const { pick, nextQuestion } = useExam()
  const q = s.qs[s.i]
  const answered = s.sel != null
  return (
    <div className="card">
      <div className="q-meta"><span>{SUBJECTS[s.subject].name}</span><span>Question {s.i + 1} of {s.qs.length}</span></div>
      <div className="progress-line"><i style={{ width: ((s.i + (s.sel != null ? 1 : 0)) / s.qs.length) * 100 + '%' }} /></div>
      <h3>{q.body}</h3>
      {q.options.map((o, j) => (
        <button
          key={j}
          className={'opt ' + (answered ? (j === q.answer ? 'ok' : j === s.sel ? 'no' : '') : '')}
          onClick={() => pick(j)}
          disabled={answered}
        >
          <span className="k">{'ABCD'[j]}</span><span>{o}</span>
        </button>
      ))}
      {answered && s.sel !== q.answer && q.explanation && <p className="ex">💡 {q.explanation}</p>}
      {answered && <button className="btn" onClick={nextQuestion}>{s.i + 1 < s.qs.length ? 'Next question' : 'See result'}</button>}
    </div>
  )
}

export default function Practice() {
  const { level } = useAuth()
  const { practice, startPractice, endPractice } = useExam()
  const nav = useNavigate()
  const { busy, error, run } = useAction()

  const start = (k) => {
    if (SUBJECTS[k].level > level) return nav('/app/billing')
    return run(() => startPractice(k))
  }

  if (!practice)
    return (
      <>
        <h1>Practice</h1>
        <p className="mut">{PRACTICE_SIZE} random questions per session. Wrong answers come with a short explanation.</p>
        <ErrorLine>{error}</ErrorLine>
        <div className="grid">
          {SUBJECT_KEYS.map((k) => {
            const locked = SUBJECTS[k].level > level
            return (
              <button key={k} className="card sub" onClick={() => start(k)} disabled={busy}>
                <span className={'ic' + (locked ? '' : '')}><Icon name={locked ? 'lock' : 'book'} /></span>
                <b>{SUBJECTS[k].name}</b>
                <span className="mut">{locked ? 'Student plan' : 'Start practice'}</span>
              </button>
            )
          })}
        </div>
      </>
    )

  if (practice.done) {
    const pct = practice.score / practice.qs.length
    return (
      <div className="card c">
        <div className="score-big">{practice.score}<span className="mut" style={{ fontSize: 28 }}> / {practice.qs.length}</span></div>
        <h2>correct</h2>
        <p className="mut">{pct >= 0.7 ? 'Great work!' : 'Review the ones you missed and try again.'}</p>
        {practice.saved === 'saving' && <p className="sm">Saving your result…</p>}
        {practice.saved && practice.saved !== 'saving' && practice.saved !== 'ok' && <ErrorLine>{practice.saved}</ErrorLine>}
        <ErrorLine>{error}</ErrorLine>
        <button className="btn" disabled={busy} onClick={() => run(() => startPractice(practice.subject))}>Try again</button>{' '}
        <button className="btn ghost" onClick={endPractice}>Choose subject</button>
      </div>
    )
  }
  return <Question s={practice} />
}
