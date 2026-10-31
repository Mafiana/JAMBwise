import { useState } from 'react'
import { ErrorLine } from './ui.jsx'
import Icon from './Icons.jsx'
import * as api from '../lib/api.js'
import { useAction } from '../hooks.js'

const KINDS = [['feedback', 'Feedback', 'chat', 'What do you like, and what could be better?'], ['feature', 'Feature idea', 'bulb', 'What would you like JAMBwise to do?'], ['bug', 'Bug', 'bug', 'What went wrong? Tell us what you were doing.']]

/** Students and teachers: a star rating, a kind of message and the message itself. Admins read these under Feedback. */
export default function RateSuggest() {
  const { busy, error, setError, run } = useAction()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [kind, setKind] = useState('feedback')
  const [message, setMessage] = useState('')
  const hint = KINDS.find((k) => k[0] === kind)[3]
  const send = () => {
    if (!rating && !message.trim()) return setError('Please give a star rating or write a message.')
    return run(async () => {
      await api.submitFeedback({ rating: rating || null, kind, message: message.trim() })
      setRating(0); setHover(0); setMessage(''); setKind('feedback')
    }, 'Thank you! Your message has been sent')
  }
  return (
    <div className="card rate-card">
      <h2 className="rate-h"><Icon name="star" size={26} /> Rate &amp; suggest</h2>
      <p className="mut">How is JAMBwise working for you? Rate it, suggest a feature, or report a bug.</p>
      <div className="stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={'star' + (n <= (hover || rating) ? ' on' : '')} onMouseEnter={() => setHover(n)} onClick={() => setRating(rating === n ? 0 : n)}>★</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="What is this about?">
        {KINDS.map(([k, label, icon]) => (
          <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}><Icon name={icon} size={16} /> {label}</button>
        ))}
      </div>
      <label htmlFor="rs-m" className="sr-only">Your message</label>
      <textarea id="rs-m" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={hint} />
      <ErrorLine>{error}</ErrorLine>
      <button type="button" className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
    </div>
  )
}
