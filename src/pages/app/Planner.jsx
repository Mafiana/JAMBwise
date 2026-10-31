import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import Icon from '../../components/Icons.jsx'
import { SubjectBadge } from '../../components/SubjectIcon.jsx'
import { useConfirm } from '../../components/Confirm.jsx'
import { ErrorLine, Lock } from '../../components/ui.jsx'
import { SUBJECTS } from '../../lib/constants.js'
import { daysUntil, weakest } from '../../lib/utils.js'
import { useAction, useProgress } from '../../hooks.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Monday of this week as YYYY-MM-DD, so ticks reset every week. */
function weekKey(now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const load = (key) => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ticks just won't be remembered */ } }

export default function Planner() {
  const { level, profile, saveProfile, user } = useAuth()
  const p = useProgress()
  const { busy, error, run } = useAction()
  const [date, setDate] = useState(profile.exam_date || '')
  const [hours, setHours] = useState(profile.study_hours || 3)
  const [saved, setSaved] = useState(false)
  const confirm = useConfirm()
  const key = `jw_plan_${user?.id}_${weekKey()}`
  const [done, setDone] = useState(() => load(key))
  if (level < 2) return <Lock title="Study Planner" plan="Pro" />

  const subs = profile.subjects || []
  const weak = weakest(p.bySubject, ['eng', ...subs])
  const left = daysUntil(profile.exam_date)
  const h = profile.study_hours || 3
  const hasDate = Boolean(profile.exam_date)
  const passed = hasDate && left === 0 && new Date(profile.exam_date + 'T23:59:59') < new Date()
  const plan = ['eng', subs[0], subs[1], subs[2], 'weak', 'eng', 'mock']
  const today = (new Date().getDay() + 6) % 7
  const kind = (x) => (x === 'weak' ? weak : x)
  const title = (x) => (x === 'mock' ? 'Full mock, then rest' : x === 'weak' ? 'Weak spot: ' + SUBJECTS[weak]?.name : x ? SUBJECTS[x]?.name : 'Pick subjects in My Profile')
  const target = plan[today]
  const tick = (i) => { const n = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]; setDone(n); store(key, n) }
  const step = (n) => { setHours((v) => Math.min(10, Math.max(1, (Number(v) || 3) + n))); setSaved(false) }
  const save = () =>
    run(async () => {
      await saveProfile({ exam_date: date || null, study_hours: Math.min(10, Math.max(1, Number(hours) || 3)) })
      setSaved(true)
    }, 'Plan saved')
  const remove = async () => {
    if (!(await confirm({ title: 'Delete your study plan?', message: 'This clears your exam date, resets your daily hours to 3 and unticks this week. Your subjects and practice history are not touched.', confirmLabel: 'Delete plan' }))) return
    await run(async () => {
      await saveProfile({ exam_date: null, study_hours: 3 })
      setDate(''); setHours(3); setSaved(false); setDone([]); store(key, [])
    }, 'Plan deleted')
  }
  const hasPlan = hasDate || h !== 3 || done.length > 0
  const weekHours = h * 6                       // six study days and the mock day
  const pct = Math.round((done.length / 7) * 100)
  const weeks = left > 0 ? Math.ceil(left / 7) : 0
  const badSubs = useMemo(() => subs.length < 3, [subs])

  return (
    <div className="planner">
      <h1>Study Planner</h1>

      <section className="plan-hero">
        <div className="plan-count">
          {left > 0 ? <><b>{left}</b><span>day{left === 1 ? '' : 's'} to your exam</span></> : hasDate && !passed ? <><b>Today</b><span>is exam day. Good luck!</span></> : passed ? <><b>Done</b><span>your exam date has passed</span></> : <><b>–</b><span>set your exam date</span></>}
        </div>
        <div className="plan-hero-tx">
          {left > 0 ? <p>About <b>{weeks}</b> weekly cycle{weeks === 1 ? '' : 's'} and <b>{left * h}</b> study hours left at {h}h a day.</p> : <p>Pick your exam date and daily hours below, and JAMBwise lays out your week.</p>}
          <div className="plan-week" role="img" aria-label={`${done.length} of 7 days done this week`}><i style={{ width: pct + '%' }} /></div>
          <span className="sm">{done.length} of 7 days done this week</span>
        </div>
      </section>

      {target && (
        <section className="plan-today">
          {target === 'mock' ? <span className="plan-mockic"><Icon name="mock" size={22} /></span> : <SubjectBadge k={kind(target)} size={24} />}
          <div><span className="sm">Today, {FULL[today]}</span><b>{title(target)}</b><span className="sm">{h} hour{h === 1 ? '' : 's'} of focused study</span></div>
          <Link className="btn" to={target === 'mock' ? '/app/mock' : '/app/practice'}>{target === 'mock' ? 'Start mock' : 'Practise'}</Link>
        </section>
      )}

      <section className="card">
        <h3>Your settings</h3>
        <div className="plan-set">
          <div>
            <label htmlFor="pd">Exam date</label>
            <input id="pd" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSaved(false) }} />
          </div>
          <div>
            <label htmlFor="ph">Study hours per day</label>
            <div className="plan-step">
              <button type="button" className="btn ghost" aria-label="One hour less" onClick={() => step(-1)}>−</button>
              <input id="ph" type="number" min="1" max="10" value={hours} onChange={(e) => { setHours(e.target.value); setSaved(false) }} />
              <button type="button" className="btn ghost" aria-label="One hour more" onClick={() => step(1)}>+</button>
            </div>
          </div>
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="row-btns">
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save plan'}</button>
          <button className="btn danger" onClick={remove} disabled={busy || !hasPlan}><Icon name="trash" size={16} /> Delete plan</button>
        </div>
      </section>

      <div className="plan-headrow"><h3>Your week</h3><span className="sm">about {weekHours}h in total</span></div>
      {badSubs && <p className="notice">You have not picked all 3 subjects yet. <Link to="/app/profile">Choose them in My Profile</Link> to fill the plan.</p>}
      <div className="plan-days">
        {DAYS.map((d, i) => {
          const x = plan[i]
          const isDone = done.includes(i)
          return (
            <div key={d} className={'plan-day' + (i === today ? ' now' : '') + (isDone ? ' done' : '')}>
              <span className="plan-dn">{d}{i === today && <em>Today</em>}</span>
              {x === 'mock' ? <span className="plan-mockic"><Icon name="mock" size={18} /></span> : x ? <SubjectBadge k={kind(x)} size={18} /> : <span className="plan-mockic"><Icon name="lock" size={18} /></span>}
              <div className="plan-dt"><b>{title(x)}</b><span className="sm">{h}h</span></div>
              <button type="button" className={'plan-tick' + (isDone ? ' on' : '')} aria-pressed={isDone} aria-label={`${isDone ? 'Untick' : 'Tick'} ${FULL[i]}`} onClick={() => tick(i)}><Icon name="check" size={16} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
