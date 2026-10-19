import { useState } from 'react'
import { FAQ } from '../lib/constants.js'
import Icon from './Icons.jsx'

/** Accordion: each question has a + that turns into an x when it opens. Only one is open at a time. */
export default function FaqList({ compact = false }) {
  const [open, setOpen] = useState(0)
  return (
    <div className={'faq' + (compact ? ' faq-compact' : '')}>
      {FAQ.map(([q, a], i) => {
        const isOpen = open === i
        return (
          <div className={'faq-item' + (isOpen ? ' open' : '')} key={q}>
            <h3 style={{ margin: 0, font: 'inherit' }}>
              <button type="button" className="faq-q" aria-expanded={isOpen} aria-controls={`faq-a-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span>{q}</span>
                <span className="faq-plus"><Icon name="plus" /></span>
              </button>
            </h3>
            <div className="faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
              <div><p>{a}</p></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
