import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ThemeToggle, Logo, PlanCard, ErrorLine } from '../components/ui.jsx'
import Icon from '../components/Icons.jsx'
import FaqList from '../components/FaqList.jsx'
import ContactBlock from '../components/ContactBlock.jsx'
import ParentForm from '../components/ParentForm.jsx'
import InstitutionPicker from '../components/InstitutionPicker.jsx'
import { HOW, SUBJECT_KEYS } from '../lib/constants.js'
import { useAction, usePlans } from '../hooks.js'

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

/** The access-key box: students type the PIN their tutor gave them and go straight in. */
function PinForm() {
  const { signInWithPin } = useAuth()
  const nav = useNavigate()
  const [pin, setPin] = useState('')
  const { busy, error, run } = useAction()
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await signInWithPin(pin)
      nav('/app/dashboard')
    })
  }
  return (
    <form className="pinbar" onSubmit={submit} aria-label="Access key">
      <label htmlFor="ap"><Icon name="key" /> Have an access key from your tutor?</label>
      <div className="pinrow">
        <input id="ap" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Enter PIN given by tutor" maxLength={12} autoComplete="off" spellCheck="false" />
        <button className="btn" disabled={busy || !pin.trim()}>{busy ? 'Checking…' : 'Get access'}</button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </form>
  )
}

const FEATURES = [
  { cls: 'b-big', icon: 'mock', title: 'CBT mock exams that feel like the real thing', text: 'English plus your three subjects on one timed screen, with a question palette and the real UTME pace of 40 seconds a question. Get a score out of 400 when you submit.', chips: ['Subject tabs', 'Question palette', 'Auto-submit at zero'] },
  { cls: 'b-mid', icon: 'practice', title: 'Practise by subject', text: 'Pick an answer, see the right one straight away, and read a short explanation when you miss.' },
  { cls: 'b-third', icon: 'calc', title: 'Aggregate calculator', text: 'Enter your JAMB and Post-UTME scores to see your aggregate.' },
  { cls: 'b-third', icon: 'chart', title: 'Progress you can see', text: 'Accuracy by subject, a daily streak and your mock history in one place.' },
  { cls: 'b-third', icon: 'planner', title: 'A plan that adapts', text: 'The Pro planner puts your weakest subject first, every week.' },
]

export default function Landing() {
  const { session } = useAuth()
  const plans = usePlans()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)   // the phone menu
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  useEffect(() => {
    if (!menu) return undefined
    const key = (e) => { if (e.key === 'Escape') setMenu(false) }
    const wide = () => { if (window.innerWidth > 720) setMenu(false) }
    document.addEventListener('keydown', key)
    window.addEventListener('resize', wide)
    return () => { document.removeEventListener('keydown', key); window.removeEventListener('resize', wide) }
  }, [menu])
  const go = (id) => (e) => { e.preventDefault(); setMenu(false); scrollTo(id) }
  // arriving from /#institutions (the back links on the institution login page) scrolls to that section
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return undefined
    const t = setTimeout(() => scrollTo(id), 80)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <div className={'site-nav' + (scrolled ? ' scrolled' : '')}>
        <header className="nav">
          <Logo />
          <span className="desk">
            <ThemeToggle />
            {session ? (
              <Link className="btn" to="/app/dashboard">Open app</Link>
            ) : (
              <>
                <Link to="/auth/login">Log in</Link>
                <Link className="btn" to="/auth/signup">Get started</Link>
              </>
            )}
          </span>
          <button type="button" className="burger" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="mnav" aria-label={menu ? 'Close menu' : 'Open menu'}>
            <Icon name={menu ? 'close' : 'menu'} size={24} />
          </button>
        </header>
        {menu && (
          <nav id="mnav" className="mnav" aria-label="Menu">
            <a href="#how" onClick={go('how')}>How it works</a>
            <a href="#pricing" onClick={go('pricing')}>Pricing</a>
            <a href="#faq" onClick={go('faq')}>FAQ</a>
            <a href="#contact" onClick={go('contact')}>Contact</a>
            <a href="#parents" onClick={go('parents')}>Parents</a>
            <a href="#institutions" onClick={go('institutions')}>Institutions</a>
            <a href="#contact" onClick={go('contact')}>Contact</a>
            <div className="mnav-acts">
              <ThemeToggle />
              {session ? <Link className="btn" to="/app/dashboard">Open app</Link> : <><Link className="btn ghost" to="/auth/login">Log in</Link><Link className="btn" to="/auth/signup">Get started</Link></>}
            </div>
          </nav>
        )}
      </div>

      <section className="hero-bg">
        <div className="hero">
          <div>
            <h1>Practise like it's the real CBT.</h1>
            <p className="lead">Timed UTME mocks, instant explanations and a weekly study plan, built for JAMB candidates in Nigeria.</p>
            <div className="hero-cta">
              <Link className="btn lg" to={session ? '/app/dashboard' : '/auth/signup'}>{session ? 'Continue practising' : 'Start free'}</Link>
              <a className="btn ghost lg" href="#how" onClick={go('how')}>See how it works</a>
            </div>
            <p className="fine">English and Maths are free forever. No card needed.</p>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 24 }}>
        <div className="stats">
          <div><b>{SUBJECT_KEYS.length}</b><span>subjects to practise</span></div>
          <div><b>600+</b><span>questions with explanations</span></div>
          <div><b>400</b><span>point mock score, like the UTME</span></div>
          <div><b>40s</b><span>per question, the real pace</span></div>
        </div>
      </section>

      <section className="wrap band">
        <div className="band-head">
          <h2>Everything you need to hit 300+</h2>
          <p>One place to practise, test yourself under exam conditions, and know exactly where to improve.</p>
        </div>
        <div className="bento">
          {FEATURES.map((f) => (
            <div className={'card ' + f.cls} key={f.title}>
              <span className="ic"><Icon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              {f.chips && <div className="mini">{f.chips.map((c) => <span key={c}>{c}</span>)}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="wrap band" id="how" style={{ paddingTop: 16 }}>
        <div className="band-head"><h2>From sign-up to your first mock in minutes</h2></div>
        <div className="steps">
          {HOW.map(([t, d]) => (
            <div className="step" key={t}><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="wrap band" id="pricing" style={{ paddingTop: 16 }}>
        <div className="band-head">
          <h2>Simple pricing, paid once a month</h2>
          <p>Start free. Upgrade when you are ready for every subject and full mocks. Each payment covers 30 days.</p>
        </div>
        <div className="plans">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} hot={p.id === 'student'}>
              <Link className={'btn' + (p.id === 'student' ? '' : ' ghost')} to={session ? '/app/billing' : '/auth/signup'}>
                {p.id === 'free' ? 'Start free' : `Choose ${p.name}`}
              </Link>
            </PlanCard>
          ))}
        </div>
        {!session && <div className="pin-under"><PinForm /></div>}
      </section>

      <section className="wrap band" id="parents" style={{ paddingTop: 16 }}>
        <div className="parent-box">
          <div>
            <span className="eyebrow">For parents and guardians</span>
            <h2>See how your child is doing</h2>
            <p className="lead mut">Ask your child for their Student ID and the parent code from their Settings page. You will see scores, subjects that need work, mock results and how often they practise. It is read-only, and they can switch it off whenever they like.</p>
          </div>
          <div className="card"><ParentForm idPrefix="hp" /></div>
        </div>
      </section>

      <section className="wrap band" id="institutions" style={{ paddingTop: 16 }}>
        <div className="parent-box">
          <div>
            <span className="eyebrow">For institutions</span>
            <h2>See how your students are doing</h2>
            <p className="lead mut">Proprietors, proprietresses, principals, teachers and school officials can follow how their own students are doing: practice scores, CBT Mock and ExamHall results, and the subjects that need work. Choose your institution to reach its login page. Each school sees only its own students, and students from the same school log in there too.</p>
          </div>
          <div className="card"><InstitutionPicker idPrefix="hi" /></div>
        </div>
      </section>

      <section className="wrap band" id="faq" style={{ paddingTop: 16 }}>
        <div className="faq-grid">
          <div className="band-head" style={{ marginBottom: 0 }}>
            <h2>Questions, answered</h2>
            <p>Can't find what you need? <a href="#contact" onClick={go('contact')}>Contact us</a> and we will reply by email.</p>
          </div>
          <FaqList />
        </div>
      </section>

      <section className="wrap band contact" id="contact" style={{ paddingTop: 16 }}>
        <div className="band-head">
          <h2>Contact us</h2>
          <p>Questions about a PIN, a payment or your account? Send us a message and we will reply by email, usually within a day.</p>
        </div>
        <ContactBlock />
      </section>

      <section className="wrap">
        <div className="cta">
          <h2>Your next mock is one click away.</h2>
          <p>Join free and take your first practice session today.</p>
          <Link className="btn lg" to={session ? '/app/dashboard' : '/auth/signup'}>{session ? 'Open your dashboard' : 'Create a free account'}</Link>
        </div>
      </section>

      <footer className="site-foot">
        <div className="wrap">
          <div className="foot">
            <div>
              <Logo />
              <p>Practice and CBT mocks for JAMB / UTME candidates in Nigeria. An independent platform, not affiliated with JAMB.</p>
            </div>
            <div><h4>Product</h4><a href="#how" onClick={go('how')}>How it works</a><a href="#pricing" onClick={go('pricing')}>Pricing</a><a href="#faq" onClick={go('faq')}>FAQ</a><a href="#parents" onClick={go('parents')}>For parents</a><a href="#institutions" onClick={go('institutions')}>For institutions</a></div>
            <div><h4>Account</h4><Link to="/auth/login">Log in</Link><Link to="/auth/signup">Sign up</Link><a href="#contact" onClick={go('contact')}>Contact us</a></div>
            <div><h4>Legal</h4><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms and conditions</Link></div>
          </div>
          <div className="legal-line">© {new Date().getFullYear()} JAMBwise.</div>
        </div>
      </footer>
    </>
  )
}
