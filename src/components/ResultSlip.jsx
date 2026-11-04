import { useAuth } from '../context/AuthContext.jsx'
import Icon from './Icons.jsx'
import { SUBJECTS } from '../lib/constants.js'
import { buildMockSlipPdf, buildResultSlipPdf, subjectScore } from '../lib/slipPdf.js'
import { downloadBytes } from '../lib/download.js'
import { stampForFile } from '../lib/reportPdf.js'

const whenText = (d) => {
  const x = new Date(d)
  return `${x.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${x.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}
const dateText = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })

/** The student result slip for the CBT Mock (shown straight away) or ExamHall (once the admin has released results), with a PDF download. */
export default function ResultSlip({ taken, exam = 'ExamHall' }) {
  const { profile } = useAuth()
  const subjects = (taken.subjects || []).map((s) => ({ name: SUBJECTS[s.subject]?.name || s.subject.toUpperCase(), correct: s.correct, total: s.total }))
  const slip = {
    name: profile.full_name, reg_number: profile.reg_number, course: profile.course, school: profile.school,
    exam, date: dateText(taken.date), total: taken.total, subjects, photo: profile.avatar,
  }
  if (exam === 'CBT Mock') {
    const mock = { name: profile.full_name, reg_number: profile.reg_number, email: profile.email, exam, when: whenText(taken.date), total: taken.total, subjects }
    const save = () => downloadBytes(`JAMBwise-CBT-Mock-result-${profile.reg_number}-${stampForFile()}.pdf`, buildMockSlipPdf(mock))
    return (
      <section className="slip mock" aria-label="CBT Mock results">
        <header className="slip-head c"><b className="slip-logo">JAMBwise</b><span className="sm">Practice platform. Not an official JAMB result.</span></header>
        <div className="slip-body">
          <h3 className="slip-title">CBT Mock Results</h3>
          <dl className="slip-dl mock-dl">
            <dt>Name:</dt><dd>{mock.name}</dd>
            <dt>JAMBwise Number:</dt><dd>{mock.reg_number}</dd>
            <dt>Exam:</dt><dd>CBT Mock</dd>
            <dt>Email:</dt><dd>{mock.email || '-'}</dd>
            <dt>Exam Date/Time:</dt><dd>{mock.when}</dd>
          </dl>
          <table className="slip-t mock-t">
            <thead><tr><th>Subject</th><th>Score</th></tr></thead>
            <tbody>{subjects.map((s) => <tr key={s.name}><td>{s.name}</td><td>{subjectScore(s)}</td></tr>)}</tbody>
          </table>
          <p className="slip-total">Total Score: <b>{mock.total}</b> <span className="sm">out of 400</span></p>
          <p className="sm">JAMBwise is independent and not affiliated with JAMB. Each subject is out of 100.</p>
        </div>
        <button type="button" className="btn" onClick={save}><Icon name="download" size={16} /> Download result slip (PDF)</button>
      </section>
    )
  }
  const download = () => downloadBytes(`JAMBwise-${exam.replace(/\s+/g, "-")}-result-${profile.reg_number}-${stampForFile()}.pdf`, buildResultSlipPdf(slip))
  return (
    <section className="slip" aria-label={`${exam} result slip`}>
      <header className="slip-head">
        <b className="slip-logo">JAMBwise</b>
        <span>{exam} Result Slip</span>
        <span className="sm">Practice exam, not an official JAMB result</span>
      </header>
      <div className="slip-body">
        <h4>Candidate details</h4>
        <div className="slip-who">
        {profile.avatar ? <img className="slip-photo" src={profile.avatar} alt={`Photo of ${slip.name}`} /> : <div className="slip-photo none">No photo</div>}
        <dl className="slip-dl">
          <dt>Name</dt><dd>{slip.name}</dd>
          <dt>JAMBwise number</dt><dd>{slip.reg_number}</dd>
          <dt>Exam</dt><dd>{exam}</dd>
          <dt>Date written</dt><dd>{slip.date}</dd>
          <dt>Course of study</dt><dd>{slip.course || 'Not given'}</dd>
          <dt>Target university</dt><dd>{slip.school || 'Not given'}</dd>
        </dl>
        </div>
        <h4>Subjects and scores</h4>
        <table className="slip-t">
          <thead><tr><th>Subject</th><th>Correct</th><th>Score (of 100)</th></tr></thead>
          <tbody>
            {subjects.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.correct} of {s.total}</td><td><b>{subjectScore(s)}</b></td></tr>)}
          </tbody>
          <tfoot><tr><td colSpan="2">Total score (out of 400)</td><td><b className="slip-agg">{slip.total}</b></td></tr></tfoot>
        </table>
        <p className="sm">JAMBwise is independent and not affiliated with JAMB. This slip cannot be used for admission or any official purpose.</p>
      </div>
      <button type="button" className="btn" onClick={download}><Icon name="download" size={16} /> Download result slip (PDF)</button>
    </section>
  )
}
