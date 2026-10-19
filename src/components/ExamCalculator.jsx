import { useCallback, useEffect, useRef, useState } from 'react'
import { CALC_START, keyFromEvent, press } from '../lib/calc.js'

// Same key layout as the calculator inside the real JAMB CBT. "=" is two keys wide.
const KEYS = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['/', '/'], ['C', 'C'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['*', '×'], ['sqrt', '√'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['-', '-'], ['sq', 'x²'],
  ['0', '0'], ['.', '.'], ['+', '+'], ['=', '='],
]
const LABEL = { '/': 'divide', '*': 'multiply', '-': 'minus', '+': 'plus', '=': 'equals', C: 'clear', sqrt: 'square root', sq: 'square', '.': 'point' }

/** Small floating calculator. Drag it by the title bar. Works with the keyboard when you are not typing in a box. */
export default function ExamCalculator({ onClose }) {
  const [st, setSt] = useState(CALC_START)
  const [pos, setPos] = useState(null) // null = default corner (set by CSS)
  const box = useRef(null)
  const drag = useRef(null)

  const key = useCallback((k) => setSt((s) => press(s, k)), [])

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      const k = keyFromEvent(e)
      if (!k) return
      if (k === '=' && t && /^(BUTTON|A)$/.test(t.tagName)) return // Enter on a focused button should still press that button
      e.preventDefault()
      key(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])

  const startDrag = (e) => {
    if (e.target.closest('button')) return
    const r = box.current.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const moveDrag = (e) => {
    const d = drag.current
    if (!d) return
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - d.w)
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - d.h)
    setPos({ x, y })
  }
  const endDrag = () => { drag.current = null }

  return (
    <div ref={box} className="calc" role="dialog" aria-label="Calculator" style={pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined}>
      <div className="calc-title" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span>Calculator</span>
        <button type="button" className="calc-x" onClick={onClose} aria-label="Close calculator">X</button>
      </div>
      <div className="calc-screen" role="status" aria-live="polite" aria-label="Display">{st.display}</div>
      <div className="calc-keys">
        {KEYS.map(([k, label]) => (
          <button type="button" key={k} className={'calc-k' + (k === '=' ? ' eq' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => key(k)} aria-label={LABEL[k] || label}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
