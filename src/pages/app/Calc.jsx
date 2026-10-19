import { useState } from 'react'
import { aggregate } from '../../lib/utils.js'

export default function Calc() {
  const [jamb, setJamb] = useState('')
  const [post, setPost] = useState('')
  const has = jamb !== '' || post !== ''
  return (
    <>
      <h1>Aggregate Calculator</h1>
      <div className="card">
        <label htmlFor="cj">JAMB score (0 to 400)</label>
        <input id="cj" type="number" min="0" max="400" value={jamb} onChange={(e) => setJamb(e.target.value)} />
        <label htmlFor="cp">Post-UTME score (0 to 100)</label>
        <input id="cp" type="number" min="0" max="100" value={post} onChange={(e) => setPost(e.target.value)} />
        <h2 aria-live="polite">{has ? aggregate(jamb, post).toFixed(2) + ' / 100' : '–'}</h2>
        <p className="sm">Formula: JAMB ÷ 8 + Post-UTME ÷ 2. Many universities use it, but confirm your school's own formula.</p>
      </div>
    </>
  )
}
