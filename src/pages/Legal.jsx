import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/ui.jsx'
import Icon from '../components/Icons.jsx'
import { LEGAL, LEGAL_UPDATED } from '../lib/constants.js'

const slug = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function Legal({ kind }) {
  const doc = LEGAL[kind]
  const [active, setActive] = useState(slug(doc.sections[0][0]))

  useEffect(() => {
    window.scrollTo(0, 0)
    setActive(slug(doc.sections[0][0]))
    // highlight the contents link of the section being read
    const els = doc.sections.map(([h]) => document.getElementById(slug(h))).filter(Boolean)
    if (!('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (seen) setActive(seen.target.id)
    }, { rootMargin: '-15% 0px -70% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [kind, doc])

  const jump = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(id) }

  return (
    <>
      <header className="nav">
        <Logo />
        <span><ThemeToggle /><Link className="nl" to="/contact">Contact</Link><Link to="/">Back to home</Link></span>
      </header>

      <section className="legal-hero">
        <div className="wrap">
          <div className="legal-switch" role="tablist" aria-label="Legal documents">
            <Link to="/privacy" role="tab" aria-selected={kind === 'privacy'} className={kind === 'privacy' ? 'on' : ''}>Privacy Policy</Link>
            <Link to="/terms" role="tab" aria-selected={kind === 'terms'} className={kind === 'terms' ? 'on' : ''}>Terms and Conditions</Link>
          </div>
          <h1>{doc.title}</h1>
          <p className="lead mut">{doc.lead}</p>
          <p className="sm"><Icon name="clock" size={14} /> Last updated {LEGAL_UPDATED}</p>
          <div className="glance">
            {doc.glance.map(([icon, t, d]) => (
              <div className="card" key={t}><span className="ic sm"><Icon name={icon} /></span><b>{t}</b><p className="mut">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap legal-body">
        <nav className="toc" aria-label="On this page">
          <b>On this page</b>
          {doc.sections.map(([h], i) => {
            const id = slug(h)
            return <a key={id} href={'#' + id} onClick={jump(id)} className={active === id ? 'on' : ''}><i>{i + 1}</i>{h}</a>
          })}
        </nav>
        <article className="legal-doc">
          {doc.sections.map(([h, paras], i) => (
            <section key={h} id={slug(h)} className="legal-sec">
              <h2><i>{i + 1}</i>{h}</h2>
              {paras.map((p) => <p key={p}>{p}</p>)}
            </section>
          ))}
          <div className="legal-end card">
            <div><b>Still have a question?</b><p className="mut">We are happy to help with anything in this page.</p></div>
            <Link className="btn" to="/contact">Contact us</Link>
          </div>
        </article>
      </div>

      <footer className="site-foot">
        <div className="wrap">
          <div className="legal-line">© {new Date().getFullYear()} JAMBwise. <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/contact">Contact</Link></div>
        </div>
      </footer>
    </>
  )
}
