import { useMemo, useState } from 'react'
import Icon from './Icons.jsx'
import { useConfirm } from './Confirm.jsx'
import RichText from './RichText.jsx'
import { PRACTICE_SIZE } from '../lib/constants.js'
import { prepareQuestion, shuffle } from '../lib/utils.js'

/** Questions on the novel: 30 random ones, answered one at a time. Explanations show after each answer; scores are not saved. */
export default function NovelQuiz({ rows, onExit }) {
  const confirm = useConfirm()
  const [round, setRound] = useState(0)
  const qs = useMemo(() => shuffle(rows).slice(0, PRACTICE_SIZE).map((r) => prepareQuestion(r)), [rows, round])   // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const done = i >= qs.length
  const leave = async () => { if (await confirm({ title: 'Exit the questions?', message: 'Your answers so far will not be saved.', confirmLabel: 'Yes, exit', cancelLabel: 'Keep going' })) onExit() }
  const restart = () => { setRound((r) => r + 1); setI(0); setPicked(null); setScore(0) }

  if (done) {
    const pct = Math.round((score / qs.length) * 100)
    return (
      <div className="card nv-q">
        <h2>Your score</h2>
        <p className="nv-score">{score} / {qs.length} <span className="sm">({pct}%)</span></p>
        <div className="row-btns">
          <button className="btn" onClick={restart}><Icon name="refresh" size={16} /> Try other questions</button>
          <button className="btn ghost" onClick={onExit}>Back to the novel</button>
        </div>
      </div>
    )
  }
  const q = qs[i]
  const answered = picked !== null
  return (
    <div className="card nv-q">
      <div className="nv-qtop"><span className="sm">Question {i + 1} of {qs.length}</span><button className="btn danger" onClick={leave}><Icon name="close" size={16} /> Exit</button></div>
      <h3><RichText text={q.body} /></h3>
      <div className="nv-opts">
        {q.options.map((o, k) => {
          const cls = !answered ? '' : k === q.answer ? ' ok' : k === picked ? ' bad' : ''
          return (
            <button key={k} className={'nv-opt' + cls} disabled={answered} onClick={() => { setPicked(k); if (k === q.answer) setScore((s) => s + 1) }}>
              <b>{'ABCD'[k]}</b> <span><RichText text={o} /></span>
            </button>
          )
        })}
      </div>
      {answered && (
        <>
          <p className={picked === q.answer ? 'nv-right' : 'nv-wrong'}>{picked === q.answer ? 'Correct.' : `Not quite. The answer is ${'ABCD'[q.answer]}.`}</p>
          {q.explanation && <p className="sm"><RichText text={q.explanation} /></p>}
          <button className="btn" onClick={() => { setI(i + 1); setPicked(null) }}>{i + 1 === qs.length ? 'See my score' : 'Next question'} <Icon name="arrow" size={16} /></button>
        </>
      )}
    </div>
  )
}
