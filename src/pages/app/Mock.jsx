import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useExam } from '../../context/ExamContext.jsx'
import { ErrorLine, Lock, Portrait } from '../../components/ui.jsx'
import Icon from '../../components/Icons.jsx'
import ExamCalculator from '../../components/ExamCalculator.jsx'
import ReportQuestion from '../../components/ReportQuestion.jsx'
import { PICKABLE, SUBJECTS } from '../../lib/constants.js'
import { fmtTime } from '../../lib/utils.js'
import { isDesktop, useAction, useMyMock, useNow } from '../../hooks.js'

/** Shown instead of the picker once the student has submitted their mock: it can only be written once. */
function AlreadyTaken({ taken }) {
  return (
    <>
      <h1>CBT Mock</h1>
      <div className="card c taken">
        <span className="ok-ring" aria-hidden="true"><Icon name="check" size={30} /></span>
        <h3>You have already submitted your CBT mock</h3>
        {taken.queued
          ? <p className="mut">Your answers were saved on this phone and will be sent as soon as you are back online.</p>
          : <p className="mut">Submitted on {new Date(taken.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        <p className="sm">Scores are not shown to students. Your result will be released to you by the administrator.</p>
        <p className="sm">The CBT mock can only be written once, so it cannot be started again. You can keep improving with <Link to="/app/practice">Practice</Link>. If something went wrong during your exam, <Link to="/app/help">contact support</Link>.</p>
      </div>
    </>
  )
}

function Picker() {
  const { profile, saveProfile, user } = useAuth()
  const { startMock } = useExam()
  const { loading: checking, mock: taken } = useMyMock(user.id)
  const { busy, error, run } = useAction()
  const chosen = profile.subjects || []
  const toggle = (k) => {
    const next = chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length < 3 ? [...chosen, k] : chosen
    if (next !== chosen) run(() => saveProfile({ subjects: next }))
  }
  if (checking) return <><h1>CBT Mock</h1><p className="mut" role="status">Checking your mock status…</p></>
  if (taken) return <AlreadyTaken taken={taken} />
  return (
    <>
      <h1>CBT Mock</h1>
      <p className="mut">
        English plus your 3 subjects in the real UTME format: a subject-tab screen, a question palette and a countdown at the real pace of 40 seconds a question. Scored out of 400.
      </p>
      <div className="chips">
        {PICKABLE.map((k) => (
          <button key={k} className={'chip ' + (chosen.includes(k) ? 'on' : '')} onClick={() => toggle(k)} aria-pressed={chosen.includes(k)}>
            {SUBJECTS[k].name}
          </button>
        ))}
      </div>
      <p className="sm">Choose exactly 3 subjects with English.</p>
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={chosen.length !== 3 || busy} onClick={() => run(() => startMock(chosen))}>
        {busy ? 'Preparing your exam…' : 'Start mock'}
      </button>
    </>
  )
}

function Running({ m }) {
  const { profile } = useAuth()
  const { answerMock, gotoMock, submitMock } = useExam()
  const now = useNow(true)
  const [calcOpen, setCalcOpen] = useState(isDesktop) // pops up by itself on a computer, as in the real exam
  const left = Math.max(0, Math.ceil((m.endsAt - now) / 1000))
  const cur = m.qs[m.i]
  const first = m.qs.findIndex((z) => z.subject === cur.subject)
  const inSubject = m.qs.filter((z) => z.subject === cur.subject).length
  const last = m.i === m.qs.length - 1
  const unanswered = m.qs.length - Object.keys(m.a).length
  const submit = () => {
    if (unanswered === 0 || window.confirm(`You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`)) submitMock()
  }
  return (
    <div className={'exam' + (calcOpen ? ' calc-on' : '')}>
      <div className="card bar exam-head">
        <Portrait profile={profile} />
        <div className="exam-who"><b>{profile.full_name}</b><br /><span className="sm">{profile.reg_number}</span></div>
        <div className="exam-tools">
          <button type="button" className="btn ghost calc-btn" aria-pressed={calcOpen} onClick={() => setCalcOpen((o) => !o)}><Icon name="calc" size={16} /> Calculator</button>
          <span className="tag" aria-label="Time left">{fmtTime(left)}</span>
        </div>
      </div>
      {calcOpen && <ExamCalculator onClose={() => setCalcOpen(false)} />}
      <div className="chips">
        {m.subs.map((s) => (
          <button key={s} className={'chip ' + (s === cur.subject ? 'on' : '')} onClick={() => gotoMock(m.qs.findIndex((z) => z.subject === s))}>
            {SUBJECTS[s].name}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="mut">Question {m.i - first + 1} of {inSubject}</div>
        <h3>{cur.body}</h3>
        {cur.options.map((o, j) => (
          <button key={j} className={'opt ' + (m.a[m.i] === j ? 'sel' : '')} onClick={() => answerMock(j)} aria-pressed={m.a[m.i] === j}>
            <span className="k">{'ABCD'[j]}</span><span>{o}</span>
          </button>
        ))}
        <div className="row">
          <button className="btn ghost" onClick={() => gotoMock(m.i - 1)} disabled={m.i === 0}>Previous</button>
          {last ? <button className="btn" onClick={submit}>Submit exam</button> : <button className="btn" onClick={() => gotoMock(m.i + 1)}>Next</button>}
        </div>
        <div className="report-row"><ReportQuestion key={cur.id ?? m.i} q={cur} /></div>
      </div>
      <div className="pal">
        {m.qs.map((z, i) =>
          z.subject !== cur.subject ? null : (
            <button key={i} className={`pn ${m.a[i] != null ? 'dn' : ''} ${i === m.i ? 'cur' : ''}`} onClick={() => gotoMock(i)} aria-label={`Question ${i - first + 1}`}>
              {i - first + 1}
            </button>
          ),
        )}
      </div>
      {!last && <p className="sm">Use the palette to jump around. <button className="btn ghost" onClick={submit}>Submit now</button></p>}
    </div>
  )
}

/** The box students see when they submit. There is no score here, and no way to skip it: the only way out is the red button. */
function SubmittedModal({ m }) {
  const { endMock, retryMockSave } = useExam()
  const navigate = useNavigate()
  const exit = () => { endMock(); navigate('/app/dashboard') }
  const saving = m.saved === 'saving'
  const failed = m.saved && !['saving', 'ok', 'queued'].includes(m.saved)
  const dup = failed && /already/i.test(m.saved)
  return (
    <div className="modal-back">
      <div className="modal submitted" role="dialog" aria-modal="true" aria-labelledby="sub-t" aria-live="polite">
        {saving && (<>
          <span className="ok-ring wait" aria-hidden="true" />
          <h3 id="sub-t">Submitting your exam…</h3>
          <p className="mut">Please wait a moment. Do not close this page.</p>
        </>)}
        {!saving && !failed && (<>
          <span className="ok-ring" aria-hidden="true"><Icon name="check" size={34} /></span>
          <h3 id="sub-t">Successfully submitted</h3>
          <p className="mut">Your CBT mock has been recorded. It can only be written once, and your result will be released to you by the administrator.</p>
          {m.saved === 'queued' && <p className="notice" role="status"><Icon name="offline" size={16} /> You are offline. Your answers are saved on this phone and will be sent when you are back online.</p>}
          <button className="btn exit" autoFocus onClick={exit}>Exit CBT MOCK Lab</button>
        </>)}
        {failed && (<>
          <span className="ok-ring bad" aria-hidden="true"><Icon name="alert" size={32} /></span>
          <h3 id="sub-t">{dup ? 'Already submitted' : 'Could not submit yet'}</h3>
          <p className="mut">{m.saved}</p>
          {dup ? <button className="btn exit" autoFocus onClick={exit}>Exit CBT MOCK Lab</button> : <button className="btn" autoFocus onClick={retryMockSave}>Try again</button>}
        </>)}
      </div>
    </div>
  )
}

function Result({ m }) {
  return (
    <>
      <SubmittedModal m={m} />
      <div className="card c"><p className="mut">Your CBT mock has been submitted.</p></div>
    </>
  )
}

export default function Mock() {
  const { level } = useAuth()
  const { mock } = useExam()
  if (level < 1) return <Lock title="CBT Mock Exam" plan="Student" />
  if (!mock) return <Picker />
  return mock.done ? <Result m={mock} /> : <Running m={mock} />
}
