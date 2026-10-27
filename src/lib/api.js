// The only file (besides AuthContext) that talks to Supabase. Every function throws an Error with a
// message that is safe to show to a student.
import { supabase } from './supabase.js'
import { buildScoresheet, latestMocks } from './scoresheet.js'
import { isLeave } from './integrity.js'
import { DEFAULT_INSTITUTIONS } from './constants.js'

const NETWORK = /Failed to fetch|NetworkError|Load failed|network|timed? ?out/i
export const isNetworkError = (e) => Boolean(e?.network) || (typeof navigator !== 'undefined' && navigator.onLine === false) || NETWORK.test(String(e?.message || ''))

const fail = (error, fallback) => {
  const e = new Error(friendly(error) || fallback)
  e.network = NETWORK.test(String(error?.message || ''))
  throw e
}

function friendly(error) {
  const m = String(error?.message || '')
  const limited = m.match(/rate_limited:\s*(.*)$/s)    // the database's spam limits carry a message written for people
  if (limited) return limited[1].trim()
  if (/exam_not_open/.test(m)) return 'This exam has not opened yet. Please come back at the scheduled time.'
  if (/mock_already_taken/.test(m)) return 'You have already submitted this exam. It can only be written once.'
  if (/PGRST20[25]|42P01|42883|schema cache|does not exist/i.test(String(error?.code || '') + ' ' + m))
    return 'Your database is missing the latest admin update. In Supabase, open the SQL Editor and run supabase/migrate-admin-panel.sql, then reload.'
  if (/not allowed/i.test(m)) return 'You do not have permission to do that.'
  if (/jwt|token/i.test(m)) return 'Your session has expired. Please log in again.'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No internet connection. Check your network and try again.'
  return ''
}

/** Calls an Edge Function. A failed call throws an Error with a message that is safe to show; `captcha` is set when the CAPTCHA must be redone. */
async function callFn(name, body, fallback = 'Something went wrong. Please try again.') {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let reply = null
    try { reply = await error.context.json() } catch { /* not a JSON error */ }
    const e = new Error(reply?.error || friendly(error) || fallback)
    e.captcha = Boolean(reply?.captcha)
    e.ended = Boolean(reply?.ended)
    e.network = NETWORK.test(String(error?.message || ''))
    throw e
  }
  if (data?.error) { const e = new Error(data.error); e.captcha = Boolean(data.captcha); e.ended = Boolean(data.ended); throw e }
  return data
}

// ── public ──
export async function getPlans() {
  const { data, error } = await supabase.from('plans').select('id, name, price_kobo').order('price_kobo')
  if (error) fail(error, 'Could not load plans.')
  return data
}

export const activatePin = (pin) => callFn('pin-activate', { pin })

// ── student ──
export async function getProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single()
  if (error) {
    // opened with no signal: use the copy saved the last time, so the app still starts
    if (isNetworkError(error)) { try { const c = JSON.parse(localStorage.getItem('jw_profile:' + uid)); if (c) return c } catch { /* none saved */ } }
    fail(error, 'Could not load your profile.')
  }
  try { localStorage.setItem('jw_profile:' + uid, JSON.stringify(data)) } catch { /* storage full */ }
  return data
}

export async function updateProfile(uid, patch) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select().single()
  if (error) fail(error, 'Could not save your changes.')
  return data
}

export async function getAttempts() {
  const { data, error } = await supabase
    .from('attempts')
    .select('id, subject, correct, total, kind, mock_score, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) fail(error, 'Could not load your progress.')
  return data
}

// A result earned with no signal is kept on the device and sent later, so a bad connection never loses a student's work.
const PENDING = 'jw_pending_attempts'
const readPending = () => { try { return JSON.parse(localStorage.getItem(PENDING)) || [] } catch { return [] } }
const writePending = (rows) => { try { rows.length ? localStorage.setItem(PENDING, JSON.stringify(rows)) : localStorage.removeItem(PENDING) } catch { /* storage full or blocked */ } }

/** Returns 'saved', or 'queued' when the device was offline and the result will sync later. */
export async function insertAttempts(rows) {
  const { error } = await supabase.from('attempts').insert(rows)
  if (!error) return 'saved'
  if (isNetworkError(error)) {
    const at = new Date().toISOString()
    writePending([...readPending(), ...rows.map((r) => ({ created_at: at, ...r }))])
    return 'queued'
  }
  return fail(error, 'Your result could not be saved.')
}

/**
 * Has this student submitted this exam ('mock' = CBT Mock, 'hall' = ExamHall)? Returns null, { queued: true } (written offline, waiting
 * to sync) or { date }. For CBT Mock the result also carries { total, subjects }, because students may see that score. ExamHall scores
 * never reach the student: the server only tells them whether and when they submitted.
 */
export async function getMyExam(uid, kind = 'mock') {
  const waiting = readPending().some((r) => r.user_id === uid && r.kind === kind && r.mock_score != null)
  const { data, error } = kind === 'mock'
    ? await supabase.from('attempts').select('id, user_id, subject, correct, total, kind, mock_score, created_at').eq('user_id', uid).eq('kind', 'mock').order('created_at', { ascending: false }).limit(50)
    : await supabase.rpc('my_exam_result', { p_kind: kind })
  if (error && kind !== 'mock' && /my_exam_result|42883|PGRST202|schema cache/i.test(String(error.code || '') + ' ' + String(error.message || ''))) {
    // a database from before "release results": only the date is known
    const old = await supabase.rpc('my_exam_status', { p_kind: kind })
    if (!old.error) return old.data ? { date: old.data, released: false } : waiting ? { queued: true } : null
  }
  if (error) {
    if (waiting) return { queued: true }
    return fail(error, 'Could not check your exam status.')
  }
  if (kind === 'mock') {
    const m = latestMocks(data, 'mock')[0]
    return m ? { date: m.date, total: m.total, subjects: m.subjects } : waiting ? { queued: true } : null
  }
  if (data) return { date: data.date, released: Boolean(data.released), ...(data.released ? { total: data.total, subjects: data.subjects } : {}) }
  return waiting ? { queued: true } : null
}

const WINDOW_CACHE = 'jw_exam_window'
const DEFAULT_WINDOW = { opens: null, closes: null, maxViolations: 3, released: false, offset: 0 }
/**
 * When may students start this exam? { opens, closes (ms or null), maxViolations, offset } where `offset` is the server clock minus this
 * device's clock, so use Date.now() + offset. If the database has no schedule function yet, or the device is offline, the last known
 * schedule is used (and the database still refuses a submit before the opening time).
 */
export async function getExamWindow(kind) {
  const { data, error } = await supabase.rpc('exam_window', { p_kind: kind })
  if (error) {
    if (isNetworkError(error)) { try { const c = JSON.parse(localStorage.getItem(WINDOW_CACHE + kind)); if (c) return c } catch { /* nothing cached */ } }
    return DEFAULT_WINDOW
  }
  const w = {
    opens: data?.opens_at ? new Date(data.opens_at).getTime() : null,
    closes: data?.closes_at ? new Date(data.closes_at).getTime() : null,
    maxViolations: data?.max_violations ?? 3,
    released: Boolean(data?.results_released),
    offset: data?.server_now ? new Date(data.server_now).getTime() - Date.now() : 0,
  }
  try { localStorage.setItem(WINDOW_CACHE + kind, JSON.stringify(w)) } catch { /* private mode */ }
  return w
}

// "Left the exam screen" reports are sent as they happen; any that cannot be sent wait on the device and go with the next sync.
const PENDING_EVENTS = 'jw_pending_events'
const readEvents = () => { try { return JSON.parse(localStorage.getItem(PENDING_EVENTS)) || [] } catch { return [] } }
const writeEvents = (rows) => { try { rows.length ? localStorage.setItem(PENDING_EVENTS, JSON.stringify(rows)) : localStorage.removeItem(PENDING_EVENTS) } catch { /* storage full or blocked */ } }
const sendEvent = (e) => supabase.rpc('log_exam_event', { p_kind: e.kind, p_type: e.type, p_at: e.at, p_detail: e.detail || null })
export async function logExamEvent(uid, e) {
  const { error } = await sendEvent(e)
  if (error) writeEvents([...readEvents(), { uid, ...e }].slice(-200))
}
export async function flushExamEvents(uid) {
  const all = readEvents()
  const mine = all.filter((e) => e.uid === uid)
  if (!mine.length) return
  const left = []
  for (const e of mine) { const { error } = await sendEvent(e); if (error && isNetworkError(error)) { left.push(e); break } }
  writeEvents([...all.filter((e) => e.uid !== uid), ...left])
}

export const pendingAttemptCount = (uid) => readPending().filter((r) => r.user_id === uid).length

/** Sends results saved while offline. Returns how many were sent. */
export async function flushPendingAttempts(uid) {
  const all = readPending()
  const mine = all.filter((r) => r.user_id === uid)
  if (!mine.length) return 0
  const { error } = await supabase.from('attempts').insert(mine)
  if (error && isNetworkError(error)) return 0                 // still offline: keep them
  writePending(all.filter((r) => r.user_id !== uid))           // sent, or refused for good (for example the plan ended): do not retry forever
  return error ? 0 : mine.length
}

export async function deleteMyAttempts(uid) {
  const { error } = await supabase.from('attempts').delete().eq('user_id', uid)
  if (error) fail(error, 'Could not reset your progress.')
}

// Questions are kept on the device (per student) after each load, so practice and mocks still work on a weak or dropped
// connection. The cache is only used when the network fails or is very slow; online, the database is always asked first.
const qKey = (uid, subject) => `jw_q1:${uid}:${subject}`
const QUESTION_WAIT_MS = 7000
const readQ = (uid, subject) => { try { return JSON.parse(localStorage.getItem(qKey(uid, subject))) } catch { return null } }
const writeQ = (uid, subject, rows) => { try { localStorage.setItem(qKey(uid, subject), JSON.stringify({ at: Date.now(), rows })) } catch { /* storage full */ } }
const sessionUid = async () => (await supabase.auth.getSession())?.data?.session?.user?.id

async function fetchQuestions(subject) {
  const { data, error } = await supabase.from('questions').select('id, subject, body, options, answer, explanation').eq('subject', subject)
  if (error) fail(error, 'Could not load questions.')
  return data
}

export async function getQuestions(subject) {
  const uid = await sessionUid()
  const cached = uid ? readQ(uid, subject) : null
  const hasCache = Boolean(cached?.rows?.length)
  try {
    let timer
    const slow = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('The connection is too slow.'), { network: true })), hasCache ? QUESTION_WAIT_MS : 30000) })
    const rows = await Promise.race([fetchQuestions(subject), slow]).finally(() => clearTimeout(timer))
    if (uid) writeQ(uid, subject, rows)
    return rows
  } catch (e) {
    if (hasCache && isNetworkError(e)) return cached.rows
    throw e
  }
}

/** Quietly downloads the question sets a student can use, so they are ready if the connection drops. */
export async function prefetchQuestions(subjects) {
  if (typeof navigator !== 'undefined' && (navigator.onLine === false || navigator.connection?.saveData)) return 0
  const uid = await sessionUid()
  if (!uid) return 0
  let n = 0
  for (const subject of subjects) {
    const c = readQ(uid, subject)
    if (c && Date.now() - c.at < 12 * 3600 * 1000) continue      // fresh enough
    try { writeQ(uid, subject, await fetchQuestions(subject)); n++ } catch { return n }
  }
  return n
}

/** Called when a student signs out: nothing from their plan stays on a shared device. */
export function clearLocalStudentData() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('jw_q1:') || k.startsWith('jw_profile:')).forEach((k) => localStorage.removeItem(k))
  } catch { /* storage blocked */ }
}

export const startCheckout = (plan) => callFn('paystack-init', { plan, origin: window.location.origin })

export async function getPayment(reference) {
  const { data, error } = await supabase.from('payments').select('status, plan').eq('reference', reference).maybeSingle()
  if (error) fail(error, 'Could not check your payment.')
  return data
}

export const deleteAccount = () => callFn('delete-account', { confirm: 'DELETE' })

// ── admin (every one of these is checked again on the server) ──
export async function adminStats() {
  const { data, error } = await supabase.rpc('admin_stats')
  if (error) fail(error, 'Could not load stats.')
  return data?.[0] ?? { students: 0, paying: 0, revenue_kobo: 0, mocks: 0 }
}

export async function adminStudents() {
  const { data, error } = await supabase.rpc('admin_students')
  if (error) fail(error, 'Could not load students.')
  return data
}

export async function adminPins() {
  const { data, error } = await supabase.from('access_pins').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) fail(error, 'Could not load PINs.')
  return data
}

export async function adminMakePin(plan, name, days) {
  const { data, error } = await supabase.rpc('admin_make_pin', { p_plan: plan, p_name: name, p_days: days })
  if (error) fail(error, 'Could not make a PIN.')
  return data
}

export async function adminDeletePin(pin) {
  const { error } = await supabase.from('access_pins').delete().eq('pin', pin)
  if (error) fail(error, 'Could not delete the PIN.')
}

export async function adminSetStudent(id, { name, course, school, suspended }) {
  const { error } = await supabase.rpc('admin_set_student', {
    target: id, p_name: name, p_course: course, p_school: school, p_suspended: suspended,
  })
  if (error) fail(error, 'Could not save the student.')
}

export async function adminSetPlan(id, plan, days = 30) {
  const { error } = await supabase.rpc('admin_set_plan', { target: id, p_plan: plan, p_days: days })
  if (error) fail(error, 'Could not change the plan.')
}

/** role: 'student' | 'teacher' | 'admin' */
export async function adminSetStaffRole(id, role) {
  const { error } = await supabase.rpc('admin_set_staff_role', { target: id, p_role: role })
  if (error) fail(error, 'Could not change the role.')
}

/** Show (true) or hide (false) ExamHall scores to the students who wrote it. */
export async function adminSetResultsReleased(kind, released) {
  const { error } = await supabase.rpc('admin_set_results_released', { p_kind: kind, p_released: released })
  if (error) fail(error, 'Could not change this.')
}

export async function adminSetRole(id, makeAdmin) {
  const { error } = await supabase.rpc('admin_set_role', { target: id, p_admin: makeAdmin })
  if (error) fail(error, 'Could not change the role.')
}

export async function adminResetProgress(id) {
  const { error } = await supabase.rpc('admin_reset_progress', { target: id })
  if (error) fail(error, 'Could not reset progress.')
}

export async function adminAllowRetake(id, kind = 'mock') {
  const { error } = await supabase.rpc('admin_allow_retake', { target: id, p_kind: kind })
  if (error) fail(error, 'Could not allow a retake.')
}

/**
 * Every student's CBT Mock and ExamHall scores, best first: { mock: [...], hall: [...], schedule: { hall }, flagged: { mock, hall } }.
 * Each row has `events` (the "left the exam screen" log). `flagged` lists students with events who have no score yet.
 */
export async function adminScoresheet() {
  const [students, a, ev, win] = await Promise.all([
    adminStudents(),
    supabase.from('attempts').select('id, user_id, subject, correct, total, kind, mock_score, created_at').in('kind', ['mock', 'hall']).order('created_at', { ascending: false }).limit(10000),
    Promise.all(['mock', 'hall'].map((k) => supabase.rpc('admin_exam_events', { p_kind: k }))),
    getExamWindow('hall'),
  ])
  if (a.error) fail(a.error, 'Could not load the scoresheet.')
  const events = { mock: ev[0].error ? [] : ev[0].data || [], hall: ev[1].error ? [] : ev[1].data || [] }   // an older database has no log yet
  const out = { schedule: { hall: win }, flagged: {} }
  for (const k of ['mock', 'hall']) {
    const rows = buildScoresheet(students, a.data, k)
    const by = new Map()
    for (const e of events[k]) (by.get(e.user_id) || by.set(e.user_id, []).get(e.user_id)).push(e)
    rows.forEach((r) => { r.events = by.get(r.id) || [] })
    const scored = new Set(rows.map((r) => r.id))
    out[k] = rows
    out.flagged[k] = students.filter((s) => (by.get(s.id) || []).some(isLeave) && !scored.has(s.id)).map((s) => ({ id: s.id, name: s.full_name || 'Student', reg: s.reg_number || '', events: by.get(s.id) }))
  }
  return out
}

/** Saves the ExamHall (or CBT Mock) sitting window. Pass null for "no limit". `opens`/`closes` are Date or ISO strings. */
export async function adminSetExamWindow(kind, opens, closes, maxViolations) {
  const { error } = await supabase.rpc('admin_set_exam_window', {
    p_kind: kind, p_opens: opens ? new Date(opens).toISOString() : null, p_closes: closes ? new Date(closes).toISOString() : null, p_max: maxViolations,
  })
  if (error) fail(error, 'Could not save the schedule.')
}

/**
 * One student's exam log for the admin: { mock: [...], hall: [...] }, oldest first. Each entry is { type, at, detail }.
 * Exams written before logging existed still show their submission, taken from the saved score.
 */
export async function adminStudentExamLog(id) {
  const [ev, att] = await Promise.all([
    Promise.all(['mock', 'hall'].map((k) => supabase.rpc('admin_exam_events', { p_kind: k, p_user: id }))),
    supabase.from('attempts').select('kind, mock_score, created_at').eq('user_id', id).in('kind', ['mock', 'hall']),
  ])
  const out = {}
  ;['mock', 'hall'].forEach((k, i) => {
    const list = (ev[i].error ? [] : ev[i].data || []).map((e) => ({ type: e.type, at: e.occurred_at, detail: e.detail || '' }))
    if (!list.some((e) => e.type === 'submitted')) {
      for (const a of att.data || []) if (a.kind === k && a.mock_score != null) list.push({ type: 'submitted', at: a.created_at, detail: `Score ${a.mock_score} / 400` })
    }
    out[k] = list.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  })
  return out
}

export const adminDeleteUser = (id) => callFn('admin-delete-user', { target: id })
/** Creates a student or teacher account. `u`: { name, email, password, role: 'student' | 'teacher', plan?, days?, course?, school? } */
export const adminCreateUser = (u) => callFn('admin-create-user', u, 'Could not create the account.')
export const adminSetPassword = (id, password) => callFn('admin-set-password', { target: id, password }, 'Could not change the password.')

/** Everything about one student in one go: results, payments and tickets (admins may read all three). */
export async function adminStudentDetail(id) {
  const [a, p, m] = await Promise.all([
    supabase.from('attempts').select('id, subject, correct, total, kind, mock_score, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(1000),
    supabase.from('payments').select('reference, plan, amount_kobo, status, paid_at, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(200),
    supabase.from('messages').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(200),
  ])
  for (const r of [a, p, m]) if (r.error) fail(r.error, 'Could not load this student.')
  return { attempts: a.data, payments: p.data, tickets: m.data }
}

export async function adminMakePins(plan, days, count) {
  const { data, error } = await supabase.rpc('admin_make_pins', { p_plan: plan, p_days: days, p_count: count })
  if (error) fail(error, 'Could not make the PINs.')
  return data
}

export async function adminPayments() {
  const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(1000)
  if (error) fail(error, 'Could not load payments.')
  return data
}

export async function adminQuestions(subject) {
  const { data, error } = await supabase.from('questions').select('id, subject, body, options, answer, explanation').eq('subject', subject).order('id', { ascending: false }).limit(1000)
  if (error) fail(error, 'Could not load questions.')
  return data
}

export async function adminSaveQuestion(q) {
  const row = { subject: q.subject, body: q.body, options: q.options, answer: q.answer, explanation: q.explanation || null }
  const { error } = q.id ? await supabase.from('questions').update(row).eq('id', q.id) : await supabase.from('questions').insert(row)
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) throw new Error('That question already exists in this subject.')
    fail(error, 'Could not save the question.')
  }
}

/** Saves parsed rows (see lib/importQuestions.js) 500 at a time. Returns { inserted, duplicates, invalid }. */
export async function adminImportQuestions(rows, onProgress) {
  const total = { inserted: 0, duplicates: 0, invalid: 0 }
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase.rpc('admin_import_questions', { p_rows: rows.slice(i, i + 500) })
    if (error) fail(error, 'The import stopped part-way. Questions already saved were kept; run it again to add the rest.')
    total.inserted += data?.inserted || 0
    total.duplicates += data?.duplicates || 0
    total.invalid += data?.invalid || 0
    onProgress?.(Math.min(rows.length, i + 500), rows.length)
  }
  return total
}

export async function adminDeleteQuestion(id) {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) fail(error, 'Could not delete the question.')
}

export async function adminSavePlan(id, { name, price_kobo }) {
  const { error } = await supabase.from('plans').update({ name, price_kobo }).eq('id', id)
  if (error) fail(error, 'Could not save the price.')
}

export async function adminMessages() {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) fail(error, 'Could not load messages.')
  return data
}

export async function adminSetMessageStatus(id, status) {
  const { error } = await supabase.from('messages').update({ status }).eq('id', id)
  if (error) fail(error, 'Could not update the message.')
}

export async function adminDeleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) fail(error, 'Could not delete the message.')
}

export async function adminAudit() {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(2000)
  if (error) fail(error, 'Could not load the activity log.')
  return data
}

/**
 * The Activity log: what admins did, plus every sign-in. Parent sign-ins come from the parent access log.
 * Each row is { id, created_at, actor_email, action, detail }. Newest first.
 */
export async function adminActivity() {
  const [audit, parents] = await Promise.all([adminAudit(), adminParentLog().catch(() => [])])   // an older database has no parent log yet
  const rows = parents.map((l) => ({
    id: 'p' + l.id, created_at: l.created_at, actor_email: (l.parent_name || 'Unknown') + ' (parent)',
    action: l.outcome === 'ok' ? 'parent.login' : 'parent.denied',
    detail: l.outcome === 'ok'
      ? `${l.relationship || 'Parent'} of ${l.student_name || 'a student'} (${l.reg_number || '?'}) · ${l.device || 'unknown device'}`
      : `${({ bad_code: 'Wrong ID or code', expired: 'Code expired', off: 'Access switched off', locked: 'Locked out' })[l.outcome] || l.outcome} for ${l.reg_number || 'unknown ID'} · ${l.device || 'unknown device'}`,
  }))
  return audit.concat(rows).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

/** Who is using the site now, and who was here in the last 24 hours. Each row: { id, role, full_name, email, reg_number, institution, inst_title, last_seen, online }. */
export async function adminOnline() {
  const { data, error } = await supabase.rpc('admin_online')
  if (error) fail(error, 'Could not load who is online. Run supabase/migrate-presence.sql first.')
  return data || []
}
/** Tells the server this person is here (sent once a minute while the tab is open). */
export function touchPresence() { return Promise.resolve(supabase.rpc('touch_presence')).catch(() => {}) }

// ── contact form and tickets ──
/**
 * Signed-in students open tickets directly (the database limits how fast). A visitor who is not signed in goes through the
 * contact-submit Edge Function, which checks the CAPTCHA: `captcha` is { token, answer } (built-in) or { turnstile } (Cloudflare).
 */
export async function sendMessage({ name, email, topic, subject, body, user_id, captcha, website, question_id }) {
  const row = { name: name.trim(), email: email.trim(), topic, body: body.trim() }
  if (subject?.trim()) row.subject = subject.trim()
  if (!user_id) {
    await callFn('contact-submit', {
      ...row, website: website || '', captchaToken: captcha?.turnstile || captcha?.token || '', captchaAnswer: captcha?.answer || '',
    }, 'The contact form is not available right now. Please try again later.')
    return
  }
  if (question_id) {
    // a question report goes to whoever uploaded that question (teacher or admin); if the database has not been updated yet, fall back to an ordinary ticket
    const { error } = await supabase.rpc('report_question', { p_question: question_id, p_subject: row.subject || null, p_body: row.body })
    if (!error) return
    if (!/PGRST20[25]|42883|schema cache|does not exist/i.test(String(error.code || '') + ' ' + String(error.message || ''))) { if (!/rate_limited/.test(error.message || '')) console.error('report_question failed:', error); fail(error, 'Your report could not be sent. Please try again in a few minutes.') }
  }
  const { error } = await supabase.from('messages').insert({ ...row, user_id })
  if (error) { if (!/rate_limited/.test(error.message || '')) console.error('sending the message failed:', error); fail(error, 'Your message could not be sent. Please try again in a few minutes.') }
}

/** A question for the built-in CAPTCHA: { question, token }. */
export const getCaptcha = () => callFn('contact-challenge', {}, 'The contact form is not available right now. Please try again later.')

// ── support tickets (a ticket is a row in `messages`; the conversation is in `message_replies`) ──
export async function myTickets() {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) fail(error, 'Could not load your tickets.')
  return data
}

export async function ticketReplies(id) {
  const { data, error } = await supabase.from('message_replies').select('*').eq('message_id', id).order('created_at', { ascending: true })
  if (error) fail(error, 'Could not load the conversation.')
  return data
}

export async function replyTicket(id, body) {
  const { error } = await supabase.rpc('ticket_reply', { p_id: id, p_body: body })
  if (error) fail(error, 'Your reply could not be sent.')
}

export async function closeTicket(id) {
  const { error } = await supabase.rpc('ticket_close', { p_id: id })
  if (error) fail(error, 'Could not close the ticket.')
}

// ── notifications (the bell) ──
export async function getNotifications() {
  const { data, error } = await supabase.rpc('my_notifications')
  if (error) fail(error, 'Could not load notifications.')
  return data || []
}

/** Marks notifications read: one (`id`), those with a `link`, or all when called with nothing. */
export async function markNotificationsRead({ id = null, link = null } = {}) {
  const { error } = await supabase.rpc('mark_notifications_read', { p_id: id, p_link: link })
  if (error) fail(error, 'Could not update notifications.')
}

// ── admin ↔ teacher chat ──
export async function staffChatThread(teacherId) {
  const { data, error } = await supabase.rpc('staff_chat_thread', { p_teacher: teacherId })
  if (error) fail(error, 'Could not load the chat.')
  return data || []
}

export async function staffChatSend(teacherId, body) {
  const { error } = await supabase.rpc('staff_chat_send', { p_teacher: teacherId, p_body: body })
  if (error) fail(error, 'Could not send the message.')
}

export async function staffChatInbox() {
  const { data, error } = await supabase.rpc('staff_chat_inbox')
  if (error) fail(error, 'Could not load chats.')
  return data || []
}

// ── parent access ──
/** A parent signs in with the student's ID and the code the student made. Returns { token, expires_at }. */
export const parentLogin = ({ reg, code, name, relationship, captcha, website }) =>
  callFn('parent-login', {
    reg, code, name, relationship, website: website || '',
    captchaToken: captcha?.turnstile || captcha?.token || '', captchaAnswer: captcha?.answer || '',
  }, 'Parent access is not available right now. Please try again later.')
export const parentReport = async (token) => (await callFn('parent-report', { token }, 'The report is not available right now.')).report
export const parentEnd = (token) => callFn('parent-report', { token, end: true }).catch(() => null)

/** The student's own side: { code, expires_at, expired, views: [{ parent_name, relationship, device, created_at }] }. */
export async function myParentAccess() {
  const { data, error } = await supabase.rpc('my_parent_access')
  if (error) fail(error, 'Could not load parent access.')
  return data
}
export async function parentCodeCreate() {
  const { data, error } = await supabase.rpc('parent_code_create')
  if (error) fail(error, 'Could not make a parent code.')
  return Array.isArray(data) ? data[0] : data
}
export async function parentCodeRevoke() {
  const { error } = await supabase.rpc('parent_code_revoke')
  if (error) fail(error, 'Could not switch parent access off.')
}
export async function adminParentLog() {
  const { data, error } = await supabase.rpc('admin_parent_log')
  if (error) fail(error, 'Could not load the parent access log.')
  return data || []
}
export async function adminParentRevoke(studentId) {
  const { error } = await supabase.rpc('admin_parent_revoke', { p_student: studentId })
  if (error) fail(error, 'Could not switch parent access off.')
}

// ── institutions (schools) ──
/** Every institution, A to Z. Anyone may read the list. If the database has no institutions table yet, the built-in list is returned (without ids). */
export async function getInstitutions({ logo = false } = {}) {
  const { data, error } = await supabase.from('institutions').select(logo ? 'id, slug, name, location, note, logo' : 'id, slug, name, location, note').order('name')
  if (error) {
    if (isNetworkError(error)) throw new Error(friendly(error) || 'No internet connection.')
    return { list: DEFAULT_INSTITUTIONS.map((i) => ({ ...i, id: null })), builtIn: true }
  }
  return { list: data, builtIn: false }
}

/** One institution with its logo, by slug (the login page) or id (the panel heading). */
export async function getInstitution({ slug = null, id = null }) {
  let q = supabase.from('institutions').select('id, slug, name, location, note, logo')
  q = slug ? q.eq('slug', slug) : q.eq('id', id)
  const { data, error } = await q.maybeSingle()
  if (error) {
    if (isNetworkError(error)) throw new Error(friendly(error) || 'No internet connection.')
    const d = slug ? DEFAULT_INSTITUTIONS.find((i) => i.slug === slug) : null   // no institutions table yet: the built-in list
    return { inst: d ? { ...d, id: null, logo: null } : null, builtIn: true }
  }
  return { inst: data, builtIn: false }
}

/** `logo`: leave it out to keep the current logo, '' to remove it, or a data: URL from fileToLogo() to set it. */
export async function adminSaveInstitution({ id = null, name, location = '', note = '', logo = null }) {
  const { data, error } = await supabase.rpc('admin_save_institution', { p_id: id, p_name: name, p_location: location, p_note: note, p_logo: logo })
  if (error) fail(error, 'Could not save the institution.')
  return data
}

export async function adminDeleteInstitution(id) {
  const { error } = await supabase.rpc('admin_delete_institution', { p_id: id })
  if (error) fail(error, 'Could not delete the institution.')
}

/** Puts a student or staff member in an institution (institutionId null takes them out). `title` is for staff: Teacher, Proprietor, Proprietress or Official. */
export async function adminAssignInstitution(userId, institutionId, title = null) {
  const { error } = await supabase.rpc('admin_assign_institution', { p_user: userId, p_inst: institutionId, p_title: title })
  if (error) fail(error, 'Could not assign this person.')
}
