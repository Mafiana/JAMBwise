import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/Icons.jsx'
import { pageList } from '../../../lib/utils.js'
import AdminLoader from '../../../components/AdminLoader.jsx'

/** Small loader for data inside an admin tab. */
export const TabLoader = () => <AdminLoader inline label="Loading…" />

/** Loads data once, and again whenever `reload()` is called. */
export function useLoad(fn) {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const reload = useCallback(async () => {
    try {
      const data = await fn()
      setState({ data, error: '', loading: false })
    } catch (e) {
      setState((s) => ({ ...s, error: e.message, loading: false }))
    }
  }, [fn])
  // a different request (for example another subject) starts from a clean loading state; later reloads keep the old data visible
  useEffect(() => { setState({ data: null, error: '', loading: true }); reload() }, [reload])
  return { ...state, reload }
}

const opts = { day: 'numeric', month: 'short', year: 'numeric' }
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-NG', opts) : '–')
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-NG', { ...opts, hour: '2-digit', minute: '2-digit' }) : '–')

export const PLAN_IDS = ['free', 'student', 'pro']

/** Tiny bar chart: one bar per value, with the label and value as a tooltip. */
export function Bars({ values, labels, format = String, label }) {
  const max = Math.max(1, ...values)
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span key={i} title={`${labels[i]}: ${format(v)}`}>
          <i style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  )
}

export const Empty = ({ children }) => <p className="sm adm-empty">{children}</p>

export function copyText(text) {
  try { return navigator.clipboard.writeText(text) } catch { return Promise.resolve() }
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [10, 20, 50] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-info">Showing <b>{from}–{to}</b> of <b>{total}</b></span>
      <div className="pager-nums">
        <button className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="chevl" size={16} /></button>
        {pageList(page, pages).map((n) => (typeof n === 'number'
          ? <button key={n} className={'pg' + (n === page ? ' on' : '')} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
          : <span key={n} className="pg gap">…</span>))}
        <button className="pg" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="chevr" size={16} /></button>
      </div>
      <label className="pager-size">Rows
        <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>{sizes.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
    </nav>
  )
}
