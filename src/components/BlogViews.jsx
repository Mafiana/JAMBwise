import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as api from '../lib/api.js'
import Icon from './Icons.jsx'
import { ErrorLine, Spinner } from './ui.jsx'
import { readingMinutes, sanitizeHtml } from '../lib/blogHtml.js'
import { Pagination } from '../pages/app/admin/shared.jsx'

const PAGE = 9
const when = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** A post's formatted text. It is cleaned to the safe tags again here, whatever the database holds. */
export function BlogBody({ html }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  return <div className="blog-body" dangerouslySetInnerHTML={{ __html: clean }} />
}

/** A small heart with a count: the like button (when `onClick` is given) or just the number. */
export function Likes({ n, on, onClick, busy }) {
  const inner = <><Icon name="heart" size={18} /><span>{n}</span></>
  if (!onClick) return <span className={'blog-likes' + (on ? ' on' : '')} title={n === 1 ? '1 like' : `${n} likes`}>{inner}</span>
  return <button type="button" className={'blog-like' + (on ? ' on' : '')} aria-pressed={on} disabled={busy} onClick={onClick}>{inner}<span className="blog-like-t">{on ? 'Liked' : 'Like this post'}</span></button>
}

/** The published posts as cards, nine at a time with page numbers (Previous, 1 2 3, Next), a search box and category buttons. `base` is where a card links to ('/app/blog' for students, '/app/admin/blog' for staff). */
export function BlogList({ base }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [cats, setCats] = useState([])
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE)
  const [st, setSt] = useState({ loading: true, busy: false, error: '' })
  const ticket = useRef(0)

  const load = async (pg, query, category, sz) => {
    const mine = ++ticket.current
    setSt((s) => ({ ...s, loading: rows.length === 0, busy: true, error: '' }))
    try {
      const r = await api.getBlogPosts(sz, (pg - 1) * sz, { q: query, category })
      if (mine !== ticket.current) return   // a newer search or page has already replaced this one
      if (!r.rows.length && pg > 1) { setPage(1); return }   // that page no longer exists (posts were removed): go back to the first
      setRows(r.rows)
      setTotal(r.total)
      setSt({ loading: false, busy: false, error: '' })
    } catch (e) { if (mine === ticket.current) setSt({ loading: false, busy: false, error: e.message }) }
  }
  useEffect(() => { api.getBlogCategories().then(setCats) }, [])
  useEffect(() => { const t = setTimeout(() => { setQ(text); setPage(1) }, 350); return () => clearTimeout(t) }, [text])   // wait until the typing pauses
  useEffect(() => { load(page, q, cat, size) }, [page, q, cat, size])   // eslint-disable-line react-hooks/exhaustive-deps
  const pickCat = (c) => { setCat(c); setPage(1) }

  const filtering = Boolean(q.trim() || cat)
  if (st.loading) return <Spinner />
  if (st.error && !rows.length && !filtering) return <ErrorLine>{st.error}</ErrorLine>
  if (!rows.length && !filtering && !st.error) return <div className="card"><p style={{ margin: 0 }}>No posts yet. Check back soon.</p></div>
  return (
    <>
      <div className="blog-tools">
        <div className="blog-search">
          <Icon name="search" size={18} />
          <input type="search" value={text} placeholder="Search posts" aria-label="Search posts" maxLength={80} onChange={(e) => setText(e.target.value)} />
          {text && <button type="button" className="blog-clear" aria-label="Clear search" onClick={() => { setText(''); setQ(''); setPage(1) }}>×</button>}
        </div>
        {cats.length > 0 && (
          <div className="blog-chips" role="group" aria-label="Categories">
            <button type="button" className={'blog-chip' + (!cat ? ' on' : '')} aria-pressed={!cat} onClick={() => pickCat('')}>All</button>
            {cats.map((c) => <button key={c.category} type="button" className={'blog-chip' + (cat === c.category ? ' on' : '')} aria-pressed={cat === c.category} onClick={() => pickCat(cat === c.category ? '' : c.category)}>{c.category} <small>{c.n}</small></button>)}
          </div>
        )}
      </div>
      {!rows.length && <div className="card"><p style={{ margin: 0 }}>{st.error || 'No posts match your search.'}</p></div>}
      <div className="blog-grid" style={st.busy ? { opacity: 0.55, transition: 'opacity .15s' } : undefined} aria-busy={st.busy}>
        {rows.map((p) => (
          <Link key={p.id} className="blog-card" to={`${base}/${p.id}`}>
            {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span className="blog-ph" aria-hidden="true"><Icon name="blog" size={36} /></span>}
            <span className="blog-card-b">
              {p.category && <em className="blog-cat">{p.category}</em>}
              <b>{p.title}</b>{p.summary && <span>{p.summary}</span>}
              <small>{when(p.published_at)}{p.likes > 0 && <> · <Likes n={p.likes} on={p.liked} /></>}</small>
            </span>
          </Link>
        ))}
      </div>
      {rows.length > 0 && <ErrorLine>{st.error}</ErrorLine>}
      {total > PAGE && <Pagination page={page} pageSize={size} total={total} onPage={(n) => { setPage(n); window.scrollTo({ top: 0 }) }} onPageSize={(n) => { setSize(n); setPage(1) }} sizes={[9, 18, 36]} />}
    </>
  )
}

/** One post, laid out like an article, with a like button. */
export function BlogPost({ base }) {
  const { id } = useParams()
  const [st, setSt] = useState({ loading: true, post: null, error: '' })
  const [like, setLike] = useState({ liked: false, likes: 0, busy: false, error: '' })
  useEffect(() => {
    let alive = true
    setSt({ loading: true, post: null, error: '' })
    window.scrollTo({ top: 0 })
    api.getBlogPost(id).then((post) => {
      if (!alive) return
      setSt({ loading: false, post, error: '' })
      setLike({ liked: Boolean(post?.liked), likes: Number(post?.likes || 0), busy: false, error: '' })
    }, (e) => alive && setSt({ loading: false, post: null, error: e.message }))
    return () => { alive = false }
  }, [id])
  const toggle = async () => {
    const before = like
    setLike({ ...before, liked: !before.liked, likes: Math.max(0, before.likes + (before.liked ? -1 : 1)), busy: true, error: '' })   // show it at once
    try {
      const r = await api.toggleBlogLike(id)
      setLike({ liked: r.liked, likes: r.likes, busy: false, error: '' })
    } catch (e) { setLike({ ...before, busy: false, error: e.message }) }
  }
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
          {post.category && <em className="blog-cat">{post.category}</em>}
          <h1>{post.title}</h1>
          <p className="blog-meta">JAMBwise{post.published_at ? ` · ${when(post.published_at)}` : ''} · {readingMinutes(post.body)} min read</p>
          <BlogBody html={post.body} />
          {post.published && (
            <div className="blog-end">
              <Likes n={like.likes} on={like.liked} busy={like.busy} onClick={toggle} />
              <ErrorLine>{like.error}</ErrorLine>
            </div>
          )}
        </>
      )}
    </article>
  )
}
