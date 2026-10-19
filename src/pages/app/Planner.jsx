import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { ErrorLine, Lock } from '../../components/ui.jsx'
import { SUBJECTS } from '../../lib/constants.js'
import { daysUntil, weakest } from '../../lib/utils.js'
import { useAction, useProgress } from '../../hooks.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Planner() {
  const { level, profile, saveProfile } = useAuth()
  const p = useProgress()
  const { busy, error, run } = useAction()
  const [date, setDate] = useState(profile.exam_date || '')
  const [hours, setHours] = useState(profile.study_hours || 3)
  const [saved, setSaved] = useState(false)
  if (level < 2) return <Lock title="Study Planner" plan="Pro" />

  const subs = profile.subjects || []
  const weak = weakest(p.bySubject, ['eng', ...subs])
  const left = daysUntil(profile.exam_date)
  const h = profile.study_hours || 3
  const plan = ['eng', subs[0], subs[1], subs[2], 'weak', 'eng', 'mock']
  const label = (x) => (x === 'weak' ? 'Weak spot: ' + SUBJECTS[weak].name : x === 'mock' ? 'Full mock, then rest' : x ? SUBJECTS[x].name : 'Pick your subjects in My Profile')
  const save = () =>
    run(async () => {
      await saveProfile({ exam_date: date || null, study_hours: Math.min(10, Math.max(1, Number(hours) || 3)) })
      setSaved(true)
    })
  return (
    <>
      <h1>Study Planner</h1>
      <div className="card">
        <label htmlFor="pd">Exam date</label>
        <input id="pd" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSaved(false) }} />
        <label htmlFor="ph">Study hours per day</label>
        <input id="ph" type="number" min="1" max="10" value={hours} onChange={(e) => { setHours(e.target.value); setSaved(false) }} />
        <ErrorLine>{error}</ErrorLine>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save plan'}</button>
        {left > 0 && <p><b>{left} days</b> left, about {Math.ceil(left / 7)} weekly cycles.</p>}
      </div>
      <div className="card">
        {DAYS.map((d, i) => (
          <div className="ln" key={d}><b>{d}</b><span>{label(plan[i])}, {h}h</span></div>
        ))}
      </div>
    </>
  )
}
