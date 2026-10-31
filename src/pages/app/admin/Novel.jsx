import { useRef, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { fileToCover, novelQuestionsFromText } from '../../../lib/novel.js'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useAction } from '../../../hooks.js'
import StudentNovel from '../Novel.jsx'
import { TabLoader, useLoad } from './shared.jsx'

/** Admin: manage the novel (cover, file, questions). Teachers only see the student view. */
export default function Novel() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Manage /> : <StudentNovel />
}

function Manage() {
  const { data, error, loading, reload } = useLoad(api.getNovel)
  const act = useAction()
  const confirm = useConfirm()
  const coverRef = useRef(null), qRef = useRef(null)
  const [title, setTitle] = useState(null)
  const [cover, setCover] = useState(null)       // new cover (data URL), not saved until Save
  const [qs, setQs] = useState(null)             // { name, rows, skipped }
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const name = title ?? data.title ?? ''
  const shownCover = cover || data.cover
  const dirty = title !== null || cover || (qs && qs.rows.length)

  const pickCover = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    act.setError('')
    try { setCover(await fileToCover(f)) } catch (err) { act.setError(err.message) }
  }
  const pickQs = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    act.setError('')
    try {
      const r = novelQuestionsFromText(await f.text(), f.name)
      if (r.error) { setQs(null); return act.setError(r.error) }
      setQs({ name: f.name, ...r })
    } catch (err) { act.setError(err.message) }
  }
  const save = () => {
    if (name.trim().length < 2) return act.setError('Enter the novel title.')
    return act.run(async () => {
      await api.adminSaveNovel({ title: name.trim(), cover })
      if (qs?.rows.length) await api.adminImportNovelQuestions(qs.rows)
      setTitle(null); setCover(null); setQs(null)
      await reload()
    }, 'Novel saved')
  }
  const clear = async () => {
    if (!(await confirm({ title: 'Remove all novel questions?', message: `All ${data.questions} questions on the novel will be deleted. You can import them again.`, confirmLabel: 'Remove all' }))) return
    act.run(async () => { await api.adminClearNovelQuestions(); await reload() }, 'Questions removed')
  }

  return (
    <>
      <p className="sm">Students and teachers see this on their Novel page: the picture, then the Answer Questions button. Nothing changes until you press Save.</p>
      <ErrorLine>{act.error}</ErrorLine>
      <div className="card nv-admin">
        <div className="nv-cover nv-cover-ed">
          {shownCover ? <img src={shownCover} alt="Novel cover" draggable="false" /> : <span><Icon name="book" size={56} /></span>}
          <button type="button" className="nv-cam" onClick={() => coverRef.current?.click()} aria-label="Change the picture" title="Change the picture"><Icon name="camera" size={20} /></button>
          <input ref={coverRef} type="file" accept="image/*" onChange={pickCover} style={{ display: 'none' }} aria-label="Choose the novel picture" />
        </div>
        <div className="nv-form">
          <section className="nv-sec">
            <label htmlFor="nv-t">Title</label>
            <input id="nv-t" value={name} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="For example The Lekki Headmaster" />
          </section>

          <section className="nv-sec">
            <label>Questions (CSV or JSON)</label>
            <input ref={qRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={pickQs} style={{ display: 'none' }} aria-label="Choose the questions file" />
            <div className="nv-act">
              <button type="button" className="btn ghost" onClick={() => qRef.current?.click()}><Icon name="upload" size={16} /> Import questions</button>
              <span className="sm">{qs ? `${qs.name}: ${qs.rows.length} ready${qs.skipped.length ? `, ${qs.skipped.length} skipped` : ''} (not saved yet)` : `${data.questions} question${data.questions === 1 ? '' : 's'} saved`}</span>
              {data.questions > 0 && <button type="button" className="btn danger nv-rm" disabled={act.busy} onClick={clear}><Icon name="trash" size={16} /> Remove all</button>}
            </div>
            {qs?.skipped.length > 0 && <p className="sm nv-help">Skipped: {qs.skipped.slice(0, 3).map((s) => `line ${s.line} (${s.why})`).join('; ')}{qs.skipped.length > 3 ? '…' : ''}</p>}
          </section>

          <div className="nv-save">
            <button className="btn" disabled={act.busy || !dirty} onClick={save}><Icon name="check" size={16} /> {act.busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
