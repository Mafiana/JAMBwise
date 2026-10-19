import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

const Ctx = createContext(() => Promise.resolve(false))

/** `const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, danger })) ...` */
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null)
  const cancelRef = useRef(null)
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), [])
  const close = useCallback((answer) => {
    setAsk((a) => { a?.resolve(answer); return null })
  }, [])

  useEffect(() => {
    if (!ask) return undefined
    const onKey = (e) => { if (e.key === 'Escape') close(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'          // page behind the dialog should not scroll
    cancelRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [ask, close])

  const danger = ask?.danger !== false
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {ask && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-m">
            <span className={'modal-ic' + (danger ? ' bad' : '')}><Icon name={danger ? 'trash' : 'alert'} size={24} /></span>
            <h3 id="cf-t">{ask.title || 'Are you sure?'}</h3>
            <p id="cf-m" className="mut">{ask.message}</p>
            <div className="modal-actions">
              <button className="btn ghost" ref={cancelRef} onClick={() => close(false)}>{ask.cancelLabel || 'Cancel'}</button>
              <button className={'btn' + (danger ? ' danger' : '')} onClick={() => close(true)}>{ask.confirmLabel || 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
