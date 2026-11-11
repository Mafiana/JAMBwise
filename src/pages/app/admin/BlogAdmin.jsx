import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { BlogList, BlogPost } from '../../../components/BlogViews.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { Empty, fmtDate, Pagination, TabLoader, useLoad } from './shared.jsx'

/** Admin: every post (drafts too), with buttons to write, edit, publish, hide and delete. */
function Manage() {
  const { data, error, loading, reload } = useLoad(api.adminBlogPosts)
  const act = useAction()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [pageSize])
  const rows = data || []
  const pageNo = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)))
  const pageRows = useMemo(() => rows.slice((pageNo - 1) * pageSize, pageNo * pageSize), [rows, pageNo, pageSize])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const toggle = (p) => act.run(async () => { await api.adminSetBlogPublished(p.id, !p.published); await reload() }, p.published ? 'Post hidden from students and teachers' : 'Post published')
  const del = async (p) => {
    if (!(await confirm({ title: 'Delete this post?', message: `"${p.title}" will be removed for good, for everyone.`, confirmLabel: 'Delete post' }))) return
    act.run(async () => { await api.adminDeleteBlogPost(p.id); await reload() }, 'Post deleted')
  }
  return (
    <>
      <div className="row" style={{ marginTop: 0 }}>
        <h3 style={{ margin: 0 }}><Icon name="blog" size={20} /> Blog posts</h3>
        <Link className="btn" to="/app/admin/blog/new"><Icon name="plus" size={16} /> New post</Link>
      </div>
      <ErrorLine>{act.error}</ErrorLine>
      <div className="card tw">
        <table>
          <thead><tr><th>Post</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {pageRows.map((p) => (
              <tr key={p.id}>
                <td style={{ minWidth: 220, overflowWrap: 'anywhere' }}><b>{p.title}</b>{p.summary && <><br /><span className="sm">{p.summary.length > 110 ? p.summary.slice(0, 110) + '…' : p.summary}</span></>}</td>
                <td>{p.published ? <span className="tag">Published</span> : <span className="tag muted">Draft</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.updated_at)}</td>
                <td>
                  <Link className="btn ghost" to={`/app/admin/blog/${p.id}`}>View</Link>{' '}
                  <Link className="btn ghost" to={`/app/admin/blog/edit/${p.id}`}>Edit</Link>{' '}
                  <button type="button" className="btn ghost" disabled={act.busy} onClick={() => toggle(p)}>{p.published ? 'Unpublish' : 'Publish'}</button>{' '}
                  <button type="button" className="btn danger icon" disabled={act.busy} title="Delete post" aria-label={'Delete ' + p.title} onClick={() => del(p)}><Icon name="trash" size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No posts yet. Press New post to write the first one.</Empty>}
        {rows.length > 0 && <Pagination page={pageNo} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={setPageSize} sizes={[10, 20, 50]} />}
      </div>
    </>
  )
}

/** Admins manage the blog; teachers read it like students do. */
export default function Blog() {
  const { isAdmin } = useAuth()
  if (isAdmin) return <Manage />
  return (
    <>
      <h3 style={{ marginTop: 0 }}><Icon name="blog" size={20} /> Blog</h3>
      <BlogList base="/app/admin/blog" />
    </>
  )
}

/** One post, for teachers and admins. */
export function BlogRead() {
  return <BlogPost base="/app/admin/blog" />
}
