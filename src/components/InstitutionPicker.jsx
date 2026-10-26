import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorLine, Loader } from './ui.jsx'
import * as api from '../lib/api.js'
import { DEFAULT_INSTITUTIONS } from '../lib/constants.js'

/** "Choose your institution" drop-down on the home page. Choosing one and pressing the button opens that institution's login page. */
export default function InstitutionPicker({ idPrefix = 'ip' }) {
  const nav = useNavigate()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [slug, setSlug] = useState('')
  useEffect(() => {
    let alive = true
    api.getInstitutions()
      .then((r) => { if (alive) setList(r.list) })
      .catch((e) => { if (alive) { setList(DEFAULT_INSTITUTIONS); setError(e.message) } })   // offline: the built-in list still lets people pick
    return () => { alive = false }
  }, [])
  if (!list) return <Loader size="sm" label="Loading institutions…" />
  const chosen = list.find((i) => i.slug === slug)
  const go = (e) => { e.preventDefault(); if (chosen) nav('/institution/' + chosen.slug) }
  return (
    <form className="parentform instform" onSubmit={go} aria-label="Institution login">
      <label htmlFor={idPrefix + '-sel'}>Choose your institution</label>
      <select id={idPrefix + '-sel'} value={slug} onChange={(e) => setSlug(e.target.value)}>
        <option value="">Select an institution…</option>
        {list.map((i) => <option key={i.slug} value={i.slug}>{i.name}{i.location && i.location !== 'Online' ? ' – ' + i.location : ''}</option>)}
      </select>
      {chosen && (
        <p className="inst-pick sm" role="status">
          <b>{chosen.name}</b>{chosen.location ? ' · ' + chosen.location : ''}{chosen.note ? <><br />{chosen.note}</> : null}
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={!chosen}>Go to {chosen ? chosen.name : 'institution'} login</button>
    </form>
  )
}
