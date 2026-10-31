import Icon from './Icons.jsx'

const NAV = [['home', 'Dashboard'], ['practice', 'Practice'], ['mock', 'CBT Mock'], ['hall', 'ExamHall'], ['planner', 'Study Planner'], ['book', 'Syllabus'], ['book', 'Novel']]
const SUBJ = [['Use of English', 86], ['Mathematics', 74], ['Physics', 68], ['Chemistry', 79]]
const BARS = [48, 55, 52, 63, 71, 68, 82]

/** A laptop and a phone showing a sample JAMBwise dashboard, drawn in HTML and CSS (no picture file, and it follows light and dark mode). Decorative only. */
export default function HeroMockup() {
  return (
    <div className="mk" aria-hidden="true">
      <div className="mk-laptop">
        <div className="mk-screen">
          <aside className="mk-side">
            <div className="mk-brand"><span>J</span> JAMBwise</div>
            {NAV.map(([ic, name], i) => <div key={name} className={'mk-nav' + (i === 0 ? ' on' : '')}><Icon name={ic} size={12} /> {name}</div>)}
          </aside>
          <div className="mk-main">
            <div className="mk-hi">Good day, Ada 👋<small>Your UTME is in 42 days</small></div>
            <div className="mk-stats">
              <div><small>Last mock</small><b>312<i>/400</i></b></div>
              <div><small>Questions done</small><b>1,240</b></div>
              <div><small>Study streak</small><b>9 days</b></div>
              <div><small>Best subject</small><b>English</b></div>
            </div>
            <div className="mk-row">
              <div className="mk-card">
                <small>Mock score trend</small>
                <div className="mk-bars">{BARS.map((h, i) => <span key={i} style={{ height: h + '%' }} />)}</div>
              </div>
              <div className="mk-card">
                <small>Subject accuracy</small>
                {SUBJ.map(([n, v]) => <div className="mk-sub" key={n}><span>{n}</span><em><u style={{ width: v + '%' }} /></em></div>)}
              </div>
            </div>
          </div>
        </div>
        <div className="mk-base" />
      </div>
      <div className="mk-phone">
        <div className="mk-pscreen">
          <div className="mk-pbrand"><span>J</span> JAMBwise</div>
          <div className="mk-ring">
            <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" className="t" /><circle cx="50" cy="50" r="42" className="v" pathLength="100" strokeDasharray="78 100" /></svg>
            <b>312</b><small>of 400</small>
          </div>
          <div className="mk-pl">Practice a subject</div>
          {SUBJ.slice(0, 2).map(([n, v]) => <div className="mk-pitem" key={n}><span>{n.replace('Use of ', '')}</span><b>{v}%</b></div>)}
          <div className="mk-go">Start CBT mock</div>
        </div>
      </div>
    </div>
  )
}
