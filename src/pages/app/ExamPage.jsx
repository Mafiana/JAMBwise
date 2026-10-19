// The timed exam screen shared by CBT Mock and ExamHall. They are the same exam (same questions, calculator, timer, one attempt
// each); the only difference is that a student may see their CBT Mock result, while ExamHall results are visible to admins only.
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
import { breakdown } from '../../lib/scoresheet.js'
import { isDesktop, useAction, useMyExam, useNow } from '../../hooks.js'

const EXAMS = {
  mock: {
    title: 'CBT Mock', route: '/app/mock', exit: 'Exit CBT MOCK Lab', start: 'Start mock', showScore: true,
    intro: 'English plus your 3 subjects in the real UTME format: a subject-tab screen, a question palette and a countdown at the real pace of 40 seconds a question. Scored out of 400.',
  },
  hall: {
    title: 'ExamHall', route: '/app/examhall', exit: 'Exit ExamHall', start: 'Enter ExamHall', showScore: false,
    intro: 'The same timed exam as CBT Mock: English plus your 3 subjects, a question palette and a countdown at the real pace of 40 seconds a question. Your result is not shown to you here; it is released by your administrator.',
  },
}
const dateText = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })

/** Shown instead of the picker once the student has submitted this exam: it can only be written once. */
function AlreadyTaken({ cfg, taken }) {
  return (
    <>
      <h1>{cfg.title}</h1>
      <div className="card c taken">
        <span className="ok-ring" aria-hidden="true"><Icon name="check" size={30} /></span>
        <h3>You have already submitted {cfg.title === 'ExamHall' ? 'ExamHall' : 'your CBT mock'}</h3>
        {taken.queued
          ? <p className="mut">Your answers were saved on this phone and will be sent as soon as you are back online.</p>
          : <p className="mut">Submitted on {dateText(taken.date)}</p>}
        {cfg.showScore && taken.total != null && (
          <>
            <div className="score-big">{taken.total}<span className="mut" style={{ fontSize: 28 }}> / 400</span></div>
            <p className="sm">{breakdown(taken)}</p>
          </>
        )}
        {!cfg.showScore && <p className="sm">Scores are not shown to students. Your result will be released to you by the administrator.</p>}
        <p className="sm">This exam can only be written once, so it cannot be started again. You can keep improving with <Link to="/app/practice">Practice</Link>. If something went wrong during your exam, <Link to="/app/help">contact support</Link>.</p>
      </div>
    </>
  )
}

function Picker({ cfg, kind }) {
  const { profile, saveProfile, user } = useAuth()
  const { startMock } = useExam()
  const { loading: checking, mock: taken } = useMyExam(user.id, kind)
  const { busy, error, run } = useAction()
  const chosen = profile.subjects || []
  const toggle = (k) => {
    const next = chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length < 3 ? [...chosen, k] : chosen
    if (next !== chosen) run(() => saveProfile({ subjects: next }))
  }
  if (checking) return <><h1>{cfg.title}</h1><p className="mut" role="status">Checking your exam status…</p></>
  if (taken) return <AlreadyTaken cfg={cfg} taken={taken} />
  return (
    <>
      <h1>{cfg.title}</h1>
      <p className="mut">{cfg.intro}</p>
      <div className="chips">
        {PICKABLE.map((k) => (
          <button key={k} className={'chip ' + (chosen.includes(k) ? 'on' : '')} onClick={() => toggle(k)} aria-pressed={chosen.includes(k)}>
            {SUBJECTS[k].name}
          </button>
        ))}
      </div>
      <p className="sm">Choose exactly 3 subjects with English.</p>
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={chosen.length !== 3 || busy} onClick={() => run(() => startMock(chosen, kind))}>
        {busy ? 'Preparing your exam…' : cfg.start}
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

/** The box students see when they submit. CBT Mock offers "View my result"; ExamHall has only the red exit button. */
function SubmittedModal({ cfg, m }) {
  const { endMock, retryMockSave, ackMock } = useExam()
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
          <p className="mut">
            {cfg.showScore
              ? 'Your CBT mock has been recorded. It can only be written once, so you will not be able to start it again.'
              : 'Your ExamHall exam has been recorded. It can only be written once, and your result will be released to you by the administrator.'}
          </p>
          {m.saved === 'queued' && <p className="notice" role="status"><Icon name="offline" size={16} /> You are offline. Your answers are saved on this phone and will be sent when you are back online.</p>}
          {cfg.showScore && <button className="btn" autoFocus onClick={ackMock}>View my result</button>}
          <button className={'btn exit'} autoFocus={!cfg.showScore} onClick={exit}>{cfg.exit}</button>
        </>)}
        {failed && (<>
          <span className="ok-ring bad" aria-hidden="true"><Icon name="alert" size={32} /></span>
          <h3 id="sub-t">{dup ? 'Already submitted' : 'Could not submit yet'}</h3>
          <p className="mut">{m.saved}</p>
          {dup ? <button className="btn exit" autoFocus onClick={exit}>{cfg.exit}</button> : <button className="btn" autoFocus onClick={retryMockSave}>Try again</button>}
        </>)}
      </div>
    </div>
  )
}

function Result({ cfg, m }) {
  const { endMock } = useExam()
  const navigate = useNavigate()
  // ExamHall never shows a score. For CBT Mock the score appears after the student presses "View my result".
  if (!cfg.showScore || !m.ack) {
    return (<><SubmittedModal cfg={cfg} m={m} /><div className="card c"><p className="mut">Your exam has been submitted.</p></div></>)
  }
  return (
    <div className="card c">
      <div className="score-big">{m.total}<span className="mut" style={{ fontSize: 28 }}> / 400</span></div>
      <p className="mut">{m.total >= 300 ? 'Excellent, that is a 300+ score.' : m.total >= 200 ? 'Good. Keep pushing for 300.' : 'Keep practising. You will climb.'}</p>
      {m.results.map((r) => (
        <div className="ln" key={r.subject}><span>{SUBJECTS[r.subject].name}</span><b>{r.correct} of {r.total}</b></div>
      ))}
      {m.saved === 'queued' && <p className="notice" role="status"><Icon name="offline" size={16} /> You are offline. Your result is saved on this phone and will sync when you are back online.</p>}
      {m.saved && !['saving', 'ok', 'queued'].includes(m.saved) && <ErrorLine>{m.saved}</ErrorLine>}
      <p className="sm">This exam can only be written once.</p>
      <button className="btn exit" onClick={() => { endMock(); navigate('/app/dashboard') }}>{cfg.exit}</button>
    </div>
  )
}

/** `kind`: 'mock' (CBT Mock) or 'hall' (ExamHall). */
export default function ExamPage({ kind }) {
  const { level } = useAuth()
  const { mock } = useExam()
  const cfg = EXAMS[kind]
  if (level < 1) return <Lock title={cfg.title === 'ExamHall' ? 'ExamHall' : 'CBT Mock Exam'} plan="Student" />
  if (!mock) return <Picker cfg={cfg} kind={kind} />
  if ((mock.kind || 'mock') !== kind) {
    const other = EXAMS[mock.kind || 'mock']
    return (<><h1>{cfg.title}</h1><div className="card"><p style={{ marginTop: 0 }}>You are in the middle of <b>{other.title}</b>. Finish and submit it first.</p><Link className="btn" to={other.route}>Go back to {other.title}</Link></div></>)
  }
  return mock.done ? <Result cfg={cfg} m={mock} /> : <Running m={mock} />
}
