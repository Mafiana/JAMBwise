import { useEffect, useState } from 'react'
import * as api from '../lib/api.js'

const initials = (name) => String(name || '?').replace(/\./g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

/** "Trusted by students": real feedback the Admin chose to show. Renders nothing until there is some. */
export default function Testimonials() {
  const [items, setItems] = useState([])
  useEffect(() => {
    let live = true
    api.getTestimonials().then((rows) => { if (live) setItems(rows) })
    return () => { live = false }
  }, [])
  if (!items.length) return null
  return (
    <section className="wrap band" id="reviews" style={{ paddingTop: 16 }}>
      <div className="tm-panel">
        <div className="band-head">
          <h2>Trusted by students across Nigeria</h2>
          <p>Real words from students who practise on JAMBwise.</p>
        </div>
        <div className={'tm-grid n' + Math.min(items.length, 3)}>
          {items.map((t) => (
            <figure className="tm-card" key={t.id}>
              {t.photo ? <img className="tm-av" src={t.photo} alt={`Photo of ${t.name}`} loading="lazy" /> : <span className="tm-av" aria-hidden="true">{initials(t.name)}</span>}
              {t.rating ? <div className="tm-stars" role="img" aria-label={`${t.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= t.rating ? 'on' : ''}>★</span>)}</div> : null}
              <b className="tm-name">{t.name}</b>
              <span className="tm-role">{t.role}</span>
              <blockquote>{t.message}</blockquote>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
