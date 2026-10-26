import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

const Ctx = createContext(() => {})

/** `const flash = useDone(); flash('Saved')` shows a small "done" box in the middle of the screen for a couple of seconds. */
export const useDone = () => useContext(Ctx)

export function DoneProvider({ children }) {
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  const close = useCallback(() => { clearTimeout(timer.current); setMsg(null) }, [])
  const flash = useCallback((text = 'Done') => {
    clearTimeout(timer.current)
    setMsg({ text, n: Date.now() })
    timer.current = setTimeout(() => setMsg(null), 2200)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!msg) return undefined
    const key = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [msg, close])
  return (
    <Ctx.Provider value={flash}>
      {children}
      {msg && (
        <div className="done-back" onClick={close}>
          <div key={msg.n} className="done-box" role="status" aria-live="polite">
            <span className="done-tick"><Icon name="check" size={30} /></span>
            <b>Successful</b>
            <span>{msg.text}</span>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
