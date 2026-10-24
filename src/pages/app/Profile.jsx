import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { Avatar, ErrorLine } from '../../components/ui.jsx'
import { PICKABLE, SUBJECTS } from '../../lib/constants.js'
import { useAction } from '../../hooks.js'

/** Crops the picture to a 200x200 square JPEG so it is small enough to store with the profile. */
function toAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That image could not be opened.'))
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = 300; c.height = 300            // square, 1:1
        const m = Math.min(img.width, img.height)
        // tall photos are cropped from near the top, so the face is kept and not the middle of the body
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 6, m, m, 0, 0, 300, 300)
        resolve(c.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function Profile() {
  const { profile, saveProfile } = useAuth()
  const nav = useNavigate()
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({
    full_name: profile.full_name || '',
    course: profile.course || '',
    school: profile.school || '',
    subjects: profile.subjects || [],
    avatar: profile.avatar || null,
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggle = (k) =>
    setF({ ...f, subjects: f.subjects.includes(k) ? f.subjects.filter((x) => x !== k) : f.subjects.length < 3 ? [...f.subjects, k] : f.subjects })
  const photo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setF({ ...f, avatar: await toAvatar(file) })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }
  const save = () =>
    run(async () => {
      if (!f.full_name.trim()) throw new Error('Your name cannot be empty.')
      await saveProfile({
        full_name: f.full_name.trim(), course: f.course.trim(), school: f.school.trim(),
        subjects: f.subjects, avatar: f.avatar,
      })
      nav('/app/dashboard')
    })
  return (
    <>
      <h1>My Profile</h1>
      <p className="mut">Complete your profile so JAMBwise can track your preparation.</p>
      <div className="card">
        <div className="photo-row">
          <div className="photo-land">
            {f.avatar ? <img src={f.avatar} alt="Your profile photo" /> : <Avatar profile={{ ...profile, avatar: null, full_name: f.full_name }} />}
          </div>
          <div>
            <label className="btn ghost">{f.avatar ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/*" hidden onChange={photo} /></label>
            <p className="sm" style={{ margin: '6px 0 0' }}>A clear headshot works best.</p>
          </div>
        </div>
        <label htmlFor="pn">Full name</label>
        <input id="pn" value={f.full_name} onChange={set('full_name')} maxLength={100} />
        <label htmlFor="rn">JAMBwise registration number</label>
        <input id="rn" value={profile.reg_number} readOnly />
        <label htmlFor="pcs">Course you want to study</label>
        <input id="pcs" value={f.course} onChange={set('course')} maxLength={100} />
        <label htmlFor="pu">Target university</label>
        <input id="pu" value={f.school} onChange={set('school')} maxLength={100} />
        <label>Your 3 subjects (English is automatic)</label>
        <div className="chips">
          {PICKABLE.map((k) => (
            <button type="button" key={k} className={'chip ' + (f.subjects.includes(k) ? 'on' : '')} onClick={() => toggle(k)} aria-pressed={f.subjects.includes(k)}>
              {SUBJECTS[k].name}
            </button>
          ))}
        </div>
        <p className="sm">Your registration number is created automatically and cannot be changed.</p>
        <ErrorLine>{error}</ErrorLine>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </>
  )
}
