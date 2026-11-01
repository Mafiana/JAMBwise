import { useEffect, useState } from 'react'
import * as api from '../lib/api.js'

/** The picture belonging to a question. Shows nothing when the question has none. */
export default function QuestionImage({ q }) {
  const id = q?.id
  const wanted = Boolean(q?.has_image) && id != null
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setSrc(null); setFailed(false)
    if (!wanted) return undefined
    let live = true
    api.getQuestionImage(id).then((d) => { if (live) { setSrc(d); setFailed(!d) } }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id, wanted])
  if (!wanted) return null
  if (src) return <img className="q-img" src={src} alt="Picture for this question" />
  return <div className="q-img-wait" role="status">{failed ? 'The picture could not be loaded.' : 'Loading picture…'}</div>
}
