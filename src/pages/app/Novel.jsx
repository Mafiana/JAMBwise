import { lazy, Suspense, useState } from 'react'
import { ErrorLine, Loader } from '../../components/ui.jsx'
import Icon from '../../components/Icons.jsx'
import * as api from '../../lib/api.js'
import { useLoad } from './admin/shared.jsx'

const NovelQuiz = lazy(() => import('../../components/NovelQuiz.jsx'))

/** Novel page for students and teachers: the cover, then Answer Questions. */
export default function Novel() {
  const { data, error, loading } = useLoad(api.getNovel)
  const [mode, setMode] = useState('')       // '' | 'quiz'
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const quiz = async () => {
    setErr(''); setBusy(true)
    try { setRows(await api.getNovelQuestions()); setMode('quiz') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (loading) return <Loader label="Loading the novel…" />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const title = data.title || 'Novel'

  if (mode === 'quiz' && rows) return <Suspense fallback={<Loader />}><h1>{title}</h1><NovelQuiz rows={rows} onExit={() => setMode('')} /></Suspense>
  return (
    <>
      <h1>Novel</h1>
      <div className="nv-card">
        <div className="nv-cover">{data.cover ? <img src={data.cover} alt={`Cover of ${title}`} draggable="false" /> : <span><Icon name="book" size={56} /></span>}</div>
        <h2>{title}</h2>
        <div className="nv-btns">
          <button className="btn" disabled={busy || !data.questions} onClick={quiz}><Icon name="practice" size={18} /> {busy ? 'Opening…' : 'Answer Questions'}</button>
        </div>
        {!data.questions && <p className="sm">Questions on the novel are coming soon.</p>}
        <ErrorLine>{err}</ErrorLine>
      </div>
    </>
  )
}
