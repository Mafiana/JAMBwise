import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useExam } from '../../context/ExamContext.jsx'
import Icon from '../../components/Icons.jsx'
import ReportQuestion from '../../components/ReportQuestion.jsx'
import { ErrorLine, Loader } from '../../components/ui.jsx'
import { PRACTICE_SIZE, SUBJECTS, SUBJECT_KEYS } from '../../lib/constants.js'
import { useAction } from '../../hooks.js'
import { SubjectBadge } from '../../components/SubjectIcon.jsx'
import { useConfirm } from '../../components/Confirm.jsx'

/** Left panel during practice: which subject, how far along, one dot per question, and the ways out. */
function Side({ s }) {
  const { endPractice } = useExam()
  const nav = useNavigate()
  const confirm = useConfirm()
  const answered = (s.marks || []).filter((m) => m != null).length
  const leave = async (toDash) => {
    if (!s.done && !(await confirm({ title: 'Quit this practice?', message: answered > 0 ? 'Warning: your answers in this session will not be saved.' : 'Warning: you are about to leave this practice session.', confirmLabel: 'Quit practice', cancelLabel: 'Keep practising' }))) return
    endPractice()
    if (toDash) nav('/app/dashboard')
  }
  return (
    <aside className="pside" aria-label="Practice panel">
      <button className="btn ghost pback" onClick={() => leave(true)}><Icon name="back" size={16} /> Back to dashboard</button>
      <div className="phead"><SubjectBadge k={s.subject} size={22} /><div><b>{SUBJECTS[s.subject].name}</b><span className="sm">{s.done ? 'Finished' : `Question ${s.i + 1} of ${s.qs.length}`}</span></div></div>
      <div className="pstat"><span><b>{s.score}</b> correct</span><span><b>{answered - s.score}</b> wrong</span></div>
      <div className="pdots" aria-label="Question progress">
        {s.qs.map((_, n) => {
          const m = (s.marks || [])[n]
          return <i key={n} className={m === 1 ? 'ok' : m === 0 ? 'no' : n === s.i && !s.done ? 'cur' : ''} title={`Question ${n + 1}`}>{n + 1}</i>
        })}
      </div>
      <button className="btn danger pquit" onClick={() => leave(false)}>Quit practice</button>
    </aside>
  )
}

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
      <div className="report-row"><ReportQuestion key={q.id} q={q} /></div>
    </div>
  )
}

export default function Practice() {
  const { level } = useAuth()
  const { practice, startPractice, endPractice } = useExam()
  const nav = useNavigate()
  const { busy, error, run } = useAction()
  const wrap = (node) => <div className="pwrap"><Side s={practice} />{node}</div>

  const start = (k) => {
    if (SUBJECTS[k].level > level) return nav('/app/billing')
    return run(() => startPractice(k))
  }

  if (!practice)
    return (
      <>
        <div className="row" style={{ justifyContent: 'space-between' }}><h1>Practice</h1><button className="btn ghost" onClick={() => nav('/app/dashboard')}><Icon name="back" size={16} /> Back to dashboard</button></div>
        <p className="mut">{PRACTICE_SIZE} random questions per session. Wrong answers come with a short explanation.</p>
        <ErrorLine>{error}</ErrorLine>
        <div className="grid">
          {SUBJECT_KEYS.map((k) => {
            const locked = SUBJECTS[k].level > level
            return (
              <button key={k} className="card sub" onClick={() => start(k)} disabled={busy}>
                <span className="ic"><SubjectBadge k={k} size={24} locked={locked} /></span>
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
    return wrap(
      <div className="card c">
        <div className="score-big">{practice.score}<span className="mut" style={{ fontSize: 28 }}> / {practice.qs.length}</span></div>
        <h2>correct</h2>
        <p className="mut">{pct >= 0.7 ? 'Great work!' : 'Review the ones you missed and try again.'}</p>
        {practice.saved === 'saving' && <Loader size="sm" label="Saving your result…" />}
        {practice.saved === 'queued' && <p className="notice" role="status"><Icon name="offline" size={16} /> You are offline. Your result is saved on this phone and will sync when you are back online.</p>}
        {practice.saved && !['saving', 'ok', 'queued'].includes(practice.saved) && <ErrorLine>{practice.saved}</ErrorLine>}
        <ErrorLine>{error}</ErrorLine>
        <button className="btn" disabled={busy} onClick={() => run(() => startPractice(practice.subject))}>Try again</button>{' '}
        <button className="btn ghost" onClick={endPractice}>Choose subject</button>{' '}<button className="btn ghost" onClick={() => { endPractice(); nav('/app/dashboard') }}>Back to dashboard</button>
      </div>
    )
  }
  return wrap(<Question s={practice} />)
}
