import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import * as api from '../lib/api.js'
import { SUBJECTS, SUBJECT_KEYS } from '../lib/constants.js'

/** Renders nothing. Once the app is open it quietly downloads the question sets the student's plan allows, for offline use. */
export default function Prefetch() {
  const { user, level } = useAuth()
  const uid = user?.id
  useEffect(() => {
    if (!uid) return undefined
    const subjects = SUBJECT_KEYS.filter((k) => SUBJECTS[k].level <= level)
    const run = () => api.prefetchQuestions(subjects).catch(() => {})
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500)
    window.addEventListener('online', run)
    return () => { window.removeEventListener('online', run); window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle) }
  }, [uid, level])
  return null
}
