import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import RichEditor from '../../../components/RichEditor.jsx'
import { BlogBody } from '../../../components/BlogViews.jsx'
import * as api from '../../../lib/api.js'
import { BLOG_MAX_CHARS, isEmptyPost, makeSummary, sanitizeHtml } from '../../../lib/blogHtml.js'
import { fileToImage } from '../../../lib/questionImage.js'
import { useAction } from '../../../hooks.js'
import { TabLoader, useLoad } from './shared.jsx'

function Form({ post }) {
  const nav = useNavigate()
  const { busy, error, setError, run } = useAction()
  const [title, setTitle] = useState(post?.title || '')
  const [summary, setSummary] = useState(post?.summary || '')
  const [cover, setCover] = useState(post?.cover || null)
  const [category, setCategory] = useState(post?.category || '')
  const [notify, setNotify] = useState(false)
  const [known, setKnown] = useState([])
  const [preview, setPreview] = useState(false)
  const [dirty, setDirty] = useState(false)
  const html = useRef(post?.body || '')
  const coverPick = useRef(null)
  const live = Boolean(post?.published)

  useEffect(() => {   // the categories already in use, offered as suggestions
    api.adminBlogPosts().then((rows) => setKnown([...new Set(rows.map((r) => r.category).filter(Boolean))].sort()), () => {})
  }, [])
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const onBody = useCallback((h) => { html.current = h; setDirty(true) }, [])
  const pickCover = async (file) => {
    if (!file) return
    try { setCover(await fileToImage(file, { maxSide: 720, maxChars: 120000 })); setDirty(true); setError('') } catch (e) { setError(e.message) }
  }
  const save = (publish) => {
    if (!title.trim()) return setError('Write a title.')
    const clean = sanitizeHtml(html.current)
    if (isEmptyPost(clean)) return setError('Write the post.')
    if (clean.length > BLOG_MAX_CHARS) return setError('This post is too large. Remove or shrink some pictures.')
    return run(async () => {
      await api.adminSaveBlogPost({ id: post?.id ?? null, title: title.trim(), summary: summary.trim() || makeSummary(clean), cover, body: clean, publish, category, notify: live && publish && notify })
      setDirty(false)
      nav('/app/admin/blog')
    }, publish ? (live ? 'Post updated' : 'Post published') : 'Draft saved')
  }

  return (
    <>
      <div className="row" style={{ marginTop: 0 }}>
        <Link className="linkish" to="/app/admin/blog"><Icon name="back" size={16} /> All posts</Link>
        <span>{live ? <span className="tag">Published</span> : <span className="tag muted">Draft</span>}</span>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{post ? 'Edit post' : 'New post'}</h3>
        <label htmlFor="bl-t">Title</label>
        <input id="bl-t" value={title} maxLength={160} placeholder="For example: How to plan your last month before JAMB" onChange={(e) => { setTitle(e.target.value); setDirty(true) }} />
        <label htmlFor="bl-s">Short summary <span className="sm">(shown on the post card; leave empty to use the first lines of the post)</span></label>
        <textarea id="bl-s" rows={2} maxLength={300} value={summary} onChange={(e) => { setSummary(e.target.value); setDirty(true) }} />
        <label htmlFor="bl-c">Category <span className="sm">(optional; students can filter by it, for example Study tips or News)</span></label>
        <input id="bl-c" list="bl-cats" value={category} maxLength={40} placeholder="Choose one or type a new one" onChange={(e) => { setCategory(e.target.value); setDirty(true) }} />
        <datalist id="bl-cats">{known.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Cover picture <span className="sm">(optional)</span></label>
        <div className="bl-cover">
          {cover ? <img src={cover} alt="Cover preview" /> : <span className="bl-cover-none sm">No cover picture</span>}
          <div className="row-btns">
            <button type="button" className="btn ghost" onClick={() => coverPick.current.click()}><Icon name="image" size={16} /> {cover ? 'Change picture' : 'Add picture'}</button>
            {cover && <button type="button" className="btn ghost" onClick={() => { setCover(null); setDirty(true) }}>Remove</button>}
            <input ref={coverPick} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickCover(f) }} />
          </div>
        </div>
        <label>Post</label>
        <div hidden={preview}><RichEditor initialHtml={post?.body || ''} onChange={onBody} onError={setError} /></div>
        {preview && (
          <article className="blog-post bl-preview">
            {cover && <img className="blog-cover" src={cover} alt="" />}
            <h1>{title || 'Untitled post'}</h1>
            <BlogBody html={html.current} />
          </article>
        )}
        <ErrorLine>{error}</ErrorLine>
        {live && <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Tell students and teachers this post was updated (they get a bell notification when you press Save changes)</label>}
        <div className="row-btns" style={{ marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={() => setPreview((p) => !p)}><Icon name="eye" size={16} /> {preview ? 'Back to editing' : 'Preview'}</button>
          {live ? (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => save(false)}>Unpublish (save as draft)</button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => save(false)}>Save draft</button>
              <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Publishing…' : 'Publish'}</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/** Admin: write a new post or edit an existing one. */
export default function BlogEditor() {
  const { id } = useParams()
  const fetchPost = useCallback(() => (id ? api.adminBlogPost(id) : Promise.resolve(null)), [id])
  const { data, error, loading } = useLoad(fetchPost)
  if (loading) return <TabLoader />
  if (id && !data) return <ErrorLine>{error || 'That post no longer exists.'}</ErrorLine>
  return <Form key={id || 'new'} post={data} />
}
