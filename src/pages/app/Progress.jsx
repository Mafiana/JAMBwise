import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icons.jsx'
import SubjectIcon, { SUBJECT_COLOR, SubjectBadge } from '../../components/SubjectIcon.jsx'
import { SUBJECTS, SUBJECT_KEYS } from '../../lib/constants.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { activityGrid, badges, heat, levelFor, radarPoints, standing } from '../../lib/progressViz.js'
import { breakdown } from '../../lib/scoresheet.js'
import { firstName, streak } from '../../lib/utils.js'
import { useMyExam, useProgress } from '../../hooks.js'

const SHORT = { eng: 'ENG', mat: 'MAT', phy: 'PHY', chm: 'CHM', bio: 'BIO', gov: 'GOV', eco: 'ECO', com: 'COM', agr: 'AGR', acc: 'ACC', mkt: 'MKT', lit: 'LIT', irk: 'IRK', crk: 'CRK', hec: 'HEC', cst: 'CST', geo: 'GEO' }
const tone = (pct) => (pct >= 75 ? 'hi' : pct >= 55 ? 'mid' : 'lo')

/** A ring that fills to the student's overall accuracy. */
function Ring({ pct, label }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="pg-ring" role="img" aria-label={`${pct} percent accuracy`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <circle cx="60" cy="60" r={r} className="pg-ring-bg" />
        {pct > 0 && <circle cx="60" cy="60" r={r} className="pg-ring-fg" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 60 60)" />}
      </svg>
      <div><b>{pct}%</b><span>{label}</span></div>
    </div>
  )
}

/** The "skill web": one spoke per subject practised, reaching further the better the accuracy. */
function Radar({ rows }) {
  const size = 280, cx = 140, cy = 140, R = 88
  const pts = radarPoints(rows.map((r) => r.pct), R, cx, cy)
  const label = radarPoints(rows.map(() => 100), R + 22, cx, cy)
  const ring = (f) => radarPoints(rows.map(() => f), R, cx, cy).map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <svg className="pg-radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={'Accuracy by subject: ' + rows.map((r) => `${SUBJECTS[r.k].name} ${r.pct} percent`).join(', ')}>
      {[25, 50, 75, 100].map((f) => <polygon key={f} points={ring(f)} className="pg-grid" />)}
      {pts.map((p, i) => <line key={i} x1={cx} y1={cy} x2={radarPoints([100], R, cx, cy)[0] && radarPoints(rows.map(() => 100), R, cx, cy)[i].x} y2={radarPoints(rows.map(() => 100), R, cx, cy)[i].y} className="pg-grid" />)}
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="pg-area" />
      {pts.map((p, i) => <circle key={rows[i].k} cx={p.x} cy={p.y} r="4" fill={SUBJECT_COLOR[rows[i].k]} className="pg-dot" />)}
      {label.map((p, i) => <text key={rows[i].k} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="pg-lbl">{SHORT[rows[i].k]}</text>)}
    </svg>
  )
}

/** A calendar of the last 12 weeks, greener on busier days. */
function Heatmap({ stamps }) {
  const g = useMemo(() => activityGrid(stamps, 12), [stamps])
  const active = g.weeks.flat().filter((c) => c.count > 0).length
  return (
    <>
      <div className="pg-heat" role="img" aria-label={`Practised on ${active} of the last 12 weeks' days`}>
        <div className="pg-days" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
        {g.weeks.map((col, i) => (
          <div className="pg-col" key={i}>
            {col.map((c) => <i key={c.date} className={'h' + (c.future ? ' fut' : heat(c.count, g.max))} title={c.future ? '' : `${c.date}: ${c.count} session${c.count === 1 ? '' : 's'}`} />)}
          </div>
        ))}
      </div>
      <div className="pg-legend sm"><span>Less</span>{[0, 1, 2, 3, 4].map((n) => <i key={n} className={'h' + n} />)}<span>More</span><b>{active} active days</b></div>
    </>
  )
}

/** Mock scores over time, with the 400 scale. */
function Trend({ mocks }) {
  const W = 320, H = 150, L = 34, B = 22, T = 10, Rr = 10
  const last = mocks.slice(-10)
  const x = (i) => L + (last.length === 1 ? (W - L - Rr) / 2 : (i * (W - L - Rr)) / (last.length - 1))
  const y = (v) => T + (1 - v / 400) * (H - T - B)
  const line = last.map((m, i) => `${x(i)},${y(m.score)}`).join(' ')
  return (
    <svg className="pg-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Mock scores: ' + last.map((m) => m.score).join(', ')}>
      {[0, 100, 200, 300, 400].map((v) => (
        <g key={v}><line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} className="pg-grid" /><text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="pg-lbl sm2">{v}</text></g>
      ))}
      <line x1={L} x2={W - Rr} y1={y(250)} y2={y(250)} className="pg-goal" />
      <text x={W - Rr} y={y(250) - 5} textAnchor="end" className="pg-lbl sm2 goal">250 goal</text>
      {last.length > 1 && <polyline points={line} className="pg-line" />}
      {last.map((m, i) => <g key={i}><circle cx={x(i)} cy={y(m.score)} r="4.5" className="pg-pt" /><text x={x(i)} y={y(m.score) - 9} textAnchor="middle" className="pg-lbl sm2 val">{m.score}</text></g>)}
    </svg>
  )
}

export default function Progress() {
  const p = useProgress()
  const { user, profile } = useAuth()
  const { mock: hall } = useMyExam(user.id, 'hall')
  const attempts = p.attempts || []
  const accuracy = p.total ? Math.round((p.correct / p.total) * 100) : 0
  const run = useMemo(() => streak(p.attemptDays), [p.attemptDays])
  const best = p.mocks.length ? Math.max(...p.mocks.map((m) => m.score)) : null
  const rows = useMemo(() => SUBJECT_KEYS.filter((k) => p.bySubject[k]?.total).map((k) => ({ k, pct: Math.round((p.bySubject[k].correct / p.bySubject[k].total) * 100), n: p.bySubject[k].total })), [p.bySubject])
  const sorted = useMemo(() => rows.slice().sort((a, b) => b.pct - a.pct), [rows])
  const untouched = SUBJECT_KEYS.filter((k) => !p.bySubject[k]?.total)
  const sessions = attempts.filter((a) => a.kind === 'practice').length + p.mocks.length
  const lvl = levelFor(p.total)
  const badgeList = useMemo(() => badges({ total: p.total, accuracy, streakDays: run, mocks: p.mocks.length, bestMock: best, subjectsTried: rows.length, sessions }), [p.total, accuracy, run, p.mocks.length, best, rows.length, sessions])
  const earned = badgeList.filter((b) => b.earned).length
  const focus = rows.filter((r) => r.n >= 10).sort((a, b) => a.pct - b.pct)[0]
  const mood = !p.total ? 'Your journey starts with one question.' : accuracy >= 75 ? 'You are flying. Keep that accuracy up!' : accuracy >= 55 ? 'Good progress. A little more practice and you will break through.' : 'Every miss is a lesson. Read the explanations and go again.'

  return (
    <div className="prog">
      <h1>My Progress</h1>
      {p.error && <p className="err">{p.error}</p>}

      <section className="pg-hero">
        <Ring pct={accuracy} label="accuracy" />
        <div className="pg-hero-tx">
          <span className="pg-level"><Icon name="trophy" size={16} /> {lvl.name}</span>
          <h2>Keep going, {firstName(profile.full_name)}!</h2>
          <p>{mood}</p>
          <div className="pg-xp" role="img" aria-label={lvl.next ? `${lvl.pct} percent of the way to ${lvl.next}` : 'Top level reached'}><i style={{ width: lvl.pct + '%' }} /></div>
          <span className="sm">{lvl.next ? `${lvl.toNext} more question${lvl.toNext === 1 ? '' : 's'} to reach ${lvl.next}` : 'You reached the top level. Legend!'}</span>
        </div>
      </section>

      <div className="pg-tiles">
        <div className="pg-tile t1"><Icon name="book" /><b>{p.total}</b><span>questions answered</span></div>
        <div className="pg-tile t2"><Icon name="flame" /><b>{run}</b><span>day streak</span></div>
        <div className="pg-tile t3"><Icon name="target" /><b>{rows.length}</b><span>subjects practised</span></div>
        <div className="pg-tile t4"><Icon name="mock" /><b>{best ?? '–'}</b><span>best mock, of 400</span></div>
      </div>

      {focus && focus.pct < 75 && (
        <section className="pg-focus">
          <SubjectBadge k={focus.k} />
          <div><b>Focus next: {SUBJECTS[focus.k].name}</b><span className="sm"> You are at {focus.pct}% there. A short session will lift it.</span></div>
          <Link className="btn" to="/app/practice">Practise now</Link>
        </section>
      )}

      <div className="pg-two">
        <section className="card">
          <h3>Skill web</h3>
          {rows.length >= 3 ? <Radar rows={rows} /> : <p className="mut">Practise at least three subjects to see your skill web fill in.</p>}
        </section>
        <section className="card">
          <h3>Subject by subject</h3>
          {sorted.length === 0 ? <p className="mut">Nothing yet. <Link to="/app/practice">Start a practice session</Link>.</p> : sorted.map((r) => (
            <div className="pg-row" key={r.k}>
              <SubjectBadge k={r.k} size={18} />
              <div className="pg-row-main">
                <div><b>{SUBJECTS[r.k].name}</b><span className="sm"> {r.n} question{r.n === 1 ? '' : 's'}</span></div>
                <div className="meter" role="img" aria-label={`${r.pct} percent correct`}><i className={tone(r.pct)} style={{ width: r.pct + '%' }} /></div>
              </div>
              <div className="pg-row-end"><b>{r.pct}%</b><span className={'pg-tag ' + tone(r.pct)}>{standing(r.pct)}</span></div>
            </div>
          ))}
          {untouched.length > 0 && sorted.length > 0 && (
            <p className="sm pg-untouched">Not tried yet: {untouched.slice(0, 5).map((k) => SUBJECTS[k].name).join(', ')}{untouched.length > 5 ? ` and ${untouched.length - 5} more` : ''}.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h3>Your last 12 weeks</h3>
        <Heatmap stamps={p.attemptDays} />
      </section>

      <section className="card">
        <h3>Mock score trend</h3>
        {p.mocks.length ? <Trend mocks={p.mocks} /> : <p className="mut">No mocks yet. Take your first one from <Link to="/app/mock">CBT Mock</Link> to start your trend line.</p>}
      </section>

      <section className="card">
        <h3>Badges <span className="sm">{earned} of {badgeList.length} earned</span></h3>
        <div className="pg-badges">
          {badgeList.map((b) => (
            <div key={b.id} className={'pg-badge' + (b.earned ? ' on' : '')}>
              <span className="pg-badge-ic"><Icon name={b.earned ? 'trophy' : 'lock'} size={20} /></span>
              <b>{b.title}</b>
              <span className="sm">{b.text}</span>
              {!b.earned && <span className="pg-bar" role="img" aria-label={b.hint}><i style={{ width: Math.round(b.progress * 100) + '%' }} /></span>}
            </div>
          ))}
        </div>
      </section>

      <h3>ExamHall</h3>
      <div className="card">
        {hall ? (
          <>
            <p className="mut" style={{ margin: 0 }}>
              {hall.queued ? 'You have submitted ExamHall. It will sync when you are back online.' : `You submitted ExamHall on ${new Date(hall.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.`}{' '}
              {hall.released ? '' : 'Your result has not been released yet. It will show here once your administrator releases it.'}
            </p>
            {hall.released && hall.total != null && (
              <>
                <div className="score-big">{hall.total}<span className="mut" style={{ fontSize: 28 }}> / 400</span></div>
                <p className="sm">{breakdown(hall)}</p>
              </>
            )}
          </>
        ) : (
          <p className="mut" style={{ margin: 0 }}>You have not taken ExamHall yet. It can only be written once. Open it from <Link to="/app/examhall">ExamHall</Link> when you are ready.</p>
        )}
      </div>
    </div>
  )
}
