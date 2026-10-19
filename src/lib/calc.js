// Logic for the exam calculator (the same keys as the real JAMB CBT calculator). No React, so `npm test` covers it.
// State: { display, acc, op, fresh }. `fresh` means the next digit starts a new number.

export const CALC_START = { display: '0', acc: null, op: null, fresh: true }
const MAX_DIGITS = 14

const fmt = (n) => {
  if (!Number.isFinite(n)) return 'Error'
  return String(Number(n.toPrecision(12))) // 0.1 + 0.2 shows 0.3, not 0.30000000000000004
}

const compute = (a, op, b) => {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (op === '/') return b === 0 ? NaN : a / b
  return b
}

/** key: '0'-'9', '.', '+', '-', '*', '/', '=', 'C', 'sqrt', 'sq', 'back' */
export function press(state, key) {
  const s = state.display === 'Error' && key !== 'C' ? CALC_START : state
  if (key === 'C') return CALC_START
  if (/^[0-9]$/.test(key)) {
    if (s.fresh) return { ...s, display: key, fresh: false }
    if (s.display.replace(/[-.]/g, '').length >= MAX_DIGITS) return s
    return { ...s, display: s.display === '0' ? key : s.display + key }
  }
  if (key === '.') {
    if (s.fresh) return { ...s, display: '0.', fresh: false }
    return s.display.includes('.') ? s : { ...s, display: s.display + '.' }
  }
  if (key === 'back') {
    if (s.fresh) return s
    const d = s.display.slice(0, -1)
    return { ...s, display: d === '' || d === '-' ? '0' : d, fresh: d === '' || d === '-' ? true : false }
  }
  if (key === 'sqrt' || key === 'sq') {
    const v = Number(s.display)
    const r = key === 'sqrt' ? (v < 0 ? NaN : Math.sqrt(v)) : v * v
    const display = fmt(r)
    return display === 'Error' ? { ...CALC_START, display } : { ...s, display, fresh: true }
  }
  if (key === '=') {
    if (!s.op) return { ...s, fresh: true }
    const display = fmt(compute(s.acc, s.op, Number(s.display)))
    return { display, acc: null, op: null, fresh: true }
  }
  if (['+', '-', '*', '/'].includes(key)) {
    if (s.op && !s.fresh) {
      const display = fmt(compute(s.acc, s.op, Number(s.display)))
      if (display === 'Error') return { ...CALC_START, display }
      return { display, acc: Number(display), op: key, fresh: true }
    }
    return { ...s, acc: Number(s.display), op: key, fresh: true }
  }
  return s
}

/** Maps a keyboard key to a calculator key, or '' if it is not one. */
export function keyFromEvent(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return ''
  const k = e.key
  if (/^[0-9]$/.test(k) || ['+', '-', '*', '/', '.'].includes(k)) return k
  if (k === 'x' || k === 'X') return '*'
  if (k === ',') return '.'
  if (k === 'Enter' || k === '=') return '='
  if (k === 'Backspace') return 'back'
  if (k === 'c' || k === 'C' || k === 'Delete') return 'C'
  return ''
}
