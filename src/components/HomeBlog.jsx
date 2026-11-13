import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Icon from './Icons.jsx'

const when = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** "Blog" on the home page: the three newest posts as picture cards. It loads only when the visitor scrolls near it (the cover pictures are the heavy part)
 *  and shows nothing until there is a post. A visitor who is not signed in is asked to log in when they open one, then lands on the post. */
export default function HomeBlog() {
  const { profile } = useAuth()
  const box = useRef(null)
  const [near, setNear] = useState(false)
  const [posts, setPosts] = useState([])
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined }
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!near) return undefined
    let live = true
    api.getHomeBlog().then((rows) => { if (live) setPosts(rows) })
    return () => { live = false }
  }, [near])
  const staff = Boolean(profile && (profile.is_admin || profile.is_teacher))
  const base = staff ? '/app/admin/blog' : '/app/blog'
  return (
    <section className="wrap band" id="blog" ref={box} style={{ paddingTop: 16 }}>
      {posts.length > 0 && (
        <>
          <div className="hb-head">
            <h2>Blog</h2>
            <Link className="hb-all" to={base}>All posts →</Link>
          </div>
          <div className="hb-grid">
            {posts.map((p) => (
              <Link key={p.id} className="hb-card" to={`${base}/${p.id}`}>
                {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span className="hb-ph" aria-hidden="true"><Icon name="blog" size={44} /></span>}
                <span className="hb-body">
                  {p.category && <span className="hb-cat">{p.category}</span>}
                  <b>{p.title}</b>
                  <small>{when(p.published_at)}</small>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
