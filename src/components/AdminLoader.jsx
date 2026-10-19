/** Branded loader shown while the admin area opens. `inline` is the small version used inside a page. */
export default function AdminLoader({ inline = false, label = 'Opening admin panel…' }) {
  return (
    <div className={'aload' + (inline ? ' inline' : '')} role="status" aria-live="polite">
      <div className="aload-orb">
        <span className="aload-ring" />
        <span className="aload-ring r2" />
        <span className="aload-core">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" />
          </svg>
        </span>
      </div>
      <b>{label}</b>
      {!inline && <span className="aload-bar"><i /></span>}
      {!inline && <small>Checking your permissions</small>}
    </div>
  )
}
