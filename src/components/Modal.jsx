import { useEffect, useRef } from 'react'

/** A dialog that centres on large screens and slides up from the bottom on phones. Esc, the backdrop and the X close it. */
export default function Modal({ title, onClose, children, wide = false, label = 'Close' }) {
  const box = useRef(null)
  const close = useRef(onClose)
  close.current = onClose   // always the latest onClose, without re-running the effect below
  // runs once when the dialog opens. (It used to re-run on every keystroke because callers pass a new onClose each render,
  // which moved the cursor out of the text box after every letter.)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    box.current?.querySelector('textarea, input, select, .modal-actions button')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal form' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby="md-t" ref={box}>
        <div className="modal-head">
          <h3 id="md-t">{title}</h3>
          <button type="button" className="x" onClick={onClose} aria-label={label}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
