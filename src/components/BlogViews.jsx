import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as api from '../lib/api.js'
import Icon from './Icons.jsx'
import { ErrorLine, Spinner } from './ui.jsx'
import { readingMinutes, sanitizeHtml } from '../lib/blogHtml.js'

const PAGE = 9
const when = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** A post's formatted text. It is cleaned to the safe tags again here, whatever the database holds. */
export function BlogBody({ html }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  return <div className="blog-body" dangerouslySetInnerHTML={{ __html: clean }} />
}

/** The published posts as cards, nine at a time. `base` is where a card links to ('/app/blog' for students, '/app/admin/blog' for staff). */
export function BlogList({ base }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [st, setSt] = useState({ loading: true, more: false, error: '' })
  const load = async (offset) => {
    setSt((s) => ({ ...s, loading: offset === 0, more: offset > 0, error: '' }))
    try {
      const r = await api.getBlogPosts(PAGE, offset)
      setRows((old) => (offset === 0 ? r.rows : [...old, ...r.rows]))
      setTotal(r.total)
      setSt({ loading: false, more: false, error: '' })
    } catch (e) { setSt({ loading: false, more: false, error: e.message }) }
  }
  useEffect(() => { load(0) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  if (st.loading) return <Spinner />
  if (st.error && !rows.length) return <ErrorLine>{st.error}</ErrorLine>
  if (!rows.length) return <div className="card"><p style={{ margin: 0 }}>No posts yet. Check back soon.</p></div>
  return (
    <>
      <div className="blog-grid">
        {rows.map((p) => (
          <Link key={p.id} className="blog-card" to={`${base}/${p.id}`}>
            {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span className="blog-ph" aria-hidden="true"><Icon name="blog" size={36} /></span>}
            <span className="blog-card-b"><b>{p.title}</b>{p.summary && <span>{p.summary}</span>}<small>{when(p.published_at)}</small></span>
          </Link>
        ))}
      </div>
      <ErrorLine>{st.error}</ErrorLine>
      {rows.length < total && <div style={{ textAlign: 'center' }}><button className="btn ghost" disabled={st.more} onClick={() => load(rows.length)}>{st.more ? 'Loading…' : 'Load more posts'}</button></div>}
    </>
  )
}

/** One post, laid out like an article. */
export function BlogPost({ base }) {
  const { id } = useParams()
  const [st, setSt] = useState({ loading: true, post: null, error: '' })
  useEffect(() => {
    let alive = true
    setSt({ loading: true, post: null, error: '' })
    window.scrollTo({ top: 0 })
    api.getBlogPost(id).then((post) => alive && setSt({ loading: false, post, error: '' }), (e) => alive && setSt({ loading: false, post: null, error: e.message }))
    return () => { alive = false }
  }, [id])
  const { loading, post, error } = st
  if (loading) return <Spinner />
  return (
    <article className="blog-post">
      <Link className="blog-back" to={base}><Icon name="back" size={16} /> All posts</Link>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!error && !post && <div className="card"><p style={{ margin: 0 }}>This post is not available. It may have been removed.</p></div>}
      {post && (
        <>
          {!post.published && <div className="notice" role="status"><b>Draft.</b> Only you can see this post until you publish it.</div>}
          {post.cover && <img className="blog-cover" src={post.cover} alt="" />}
          <h1>{post.title}</h1>
          <p className="blog-meta">JAMBwise{post.published_at ? ` · ${when(post.published_at)}` : ''} · {readingMinutes(post.body)} min read</p>
          <BlogBody html={post.body} />
        </>
      )}
    </article>
  )
}
