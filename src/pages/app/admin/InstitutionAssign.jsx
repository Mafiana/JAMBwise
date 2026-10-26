import { useEffect, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { INST_TITLES } from '../../../lib/constants.js'

/** Loads the institutions once for a form. `builtIn` is true while the database has no institutions table (run migrate-institutions.sql). */
export function useInstitutions() {
  const [state, setState] = useState({ list: [], builtIn: false, loading: true })
  useEffect(() => {
    let alive = true
    api.getInstitutions().then((r) => { if (alive) setState({ list: r.list, builtIn: r.builtIn, loading: false }) }).catch(() => { if (alive) setState({ list: [], builtIn: false, loading: false }) })
    return () => { alive = false }
  }, [])
  return state
}

/** "Institution" drop-down (and, for staff, their title) with a Save button, for one person. Admin only. */
export default function InstitutionAssign({ person, onSaved }) {
  const { list, builtIn, loading } = useInstitutions()
  const { busy, error, run } = useAction()
  const [inst, setInst] = useState(person.institution_id || '')
  const [title, setTitle] = useState(person.inst_title || 'Teacher')
  const [done, setDone] = useState('')
  const staff = Boolean(person.is_teacher)
  const changed = inst !== (person.institution_id || '') || (staff && inst && title !== (person.inst_title || 'Teacher'))
  if (loading) return null
  if (builtIn) return <p className="sm">Institutions are not switched on in the database yet. Run <code>supabase/migrate-institutions.sql</code> in the Supabase SQL Editor.</p>
  return (
    <div className="inst-assign">
      <label htmlFor={'ia-' + person.id}>Institution</label>
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <select id={'ia-' + person.id} value={inst} onChange={(e) => { setInst(e.target.value); setDone('') }} style={{ margin: 0, maxWidth: 280 }}>
          <option value="">None (JAMBwise sees them as before)</option>
          {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {staff && inst && (
          <select aria-label="Title" value={title} onChange={(e) => { setTitle(e.target.value); setDone('') }} style={{ margin: 0, maxWidth: 160 }}>
            {INST_TITLES.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
        <button type="button" className="btn" disabled={busy || !changed} onClick={() => run(async () => {
          await api.adminAssignInstitution(person.id, inst || null, staff && inst ? title : null)
          await onSaved?.()
          setDone(inst ? 'Saved. They now belong to ' + (list.find((i) => i.id === inst)?.name || 'that institution') + '.' : 'Removed from their institution.')
        }, 'Institution saved')}>Save institution</button>
      </div>
      {staff && <p className="sm">Staff assigned to an institution see only that institution's students and results.</p>}
      <ErrorLine>{error}</ErrorLine>
      {done && !error && <p className="sm ok" role="status">{done}</p>}
    </div>
  )
}
