import { useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'

/** A copy-icon button. Puts `text` on the clipboard and for about two seconds shows a green tick and "Copied" (announced to screen readers too). */
export default function CopyButton({ text, label = 'text', className = '' }) {
  const [ok, setOk] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const go = async () => {
    try { await navigator.clipboard.writeText(text) } catch {
      // older browsers or a blocked clipboard: fall back to selecting a hidden box
      try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove() } catch { return }
    }
    setOk(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOk(false), 2000)
  }
  return (
    <button type="button" className={'copyb' + (ok ? ' done' : '') + (className ? ' ' + className : '')} onClick={go} aria-label={'Copy ' + label} title={'Copy ' + label}>
      <Icon name={ok ? 'check' : 'copy'} size={16} />
      <span className="copyb-t" role="status" aria-live="polite">{ok ? 'Copied' : ''}</span>
    </button>
  )
}
