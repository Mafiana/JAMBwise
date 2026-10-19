// The only file (besides AuthContext) that talks to Supabase. Every function throws an Error with a
// message that is safe to show to a student.
import { supabase } from './supabase.js'
import { buildScoresheet } from './scoresheet.js'

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
  if (/mock_already_taken/.test(m)) return 'You have already submitted your CBT mock. It can only be written once.'
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
    e.network = NETWORK.test(String(error?.message || ''))
    throw e
  }
  if (data?.error) { const e = new Error(data.error); e.captcha = Boolean(data.captcha); throw e }
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
 * Has this student submitted the CBT mock? Returns { date } (or { queued: true } while it waits to sync), or null.
 * Students never get their score back: the server only tells them whether and when they submitted.
 */
export async function getMyMock(uid) {
  const waiting = readPending().some((r) => r.user_id === uid && r.kind === 'mock' && r.mock_score != null)
  const { data, error } = await supabase.rpc('my_mock_status')
  if (error) {
    if (waiting) return { queued: true }
    return fail(error, 'Could not check your mock status.')
  }
  if (data) return { date: data }
  return waiting ? { queued: true } : null
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

export async function adminSetRole(id, makeAdmin) {
  const { error } = await supabase.rpc('admin_set_role', { target: id, p_admin: makeAdmin })
  if (error) fail(error, 'Could not change the role.')
}

export async function adminResetProgress(id) {
  const { error } = await supabase.rpc('admin_reset_progress', { target: id })
  if (error) fail(error, 'Could not reset progress.')
}

export async function adminAllowRetake(id) {
  const { error } = await supabase.rpc('admin_allow_retake', { target: id })
  if (error) fail(error, 'Could not allow a retake.')
}

/** Every student's mock score, best first (for the admin Scoresheet and its PDF). */
export async function adminScoresheet() {
  const [students, a] = await Promise.all([
    adminStudents(),
    supabase.from('attempts').select('id, user_id, subject, correct, total, kind, mock_score, created_at').eq('kind', 'mock').order('created_at', { ascending: false }).limit(5000),
  ])
  if (a.error) fail(a.error, 'Could not load the scoresheet.')
  return buildScoresheet(students, a.data)
}

export const adminDeleteUser = (id) => callFn('admin-delete-user', { target: id })

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
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300)
  if (error) fail(error, 'Could not load the activity log.')
  return data
}

// ── contact form and tickets ──
/**
 * Signed-in students open tickets directly (the database limits how fast). A visitor who is not signed in goes through the
 * contact-submit Edge Function, which checks the CAPTCHA: `captcha` is { token, answer } (built-in) or { turnstile } (Cloudflare).
 */
export async function sendMessage({ name, email, topic, subject, body, user_id, captcha, website }) {
  const row = { name: name.trim(), email: email.trim(), topic, body: body.trim() }
  if (subject?.trim()) row.subject = subject.trim()
  if (!user_id) {
    await callFn('contact-submit', {
      ...row, website: website || '', captchaToken: captcha?.turnstile || captcha?.token || '', captchaAnswer: captcha?.answer || '',
    }, 'The contact form is not available right now. Please email support@jambwise.ng.')
    return
  }
  const { error } = await supabase.from('messages').insert({ ...row, user_id })
  if (error) fail(error, 'Your message could not be sent. Please try again or email support@jambwise.ng.')
}

/** A question for the built-in CAPTCHA: { question, token }. */
export const getCaptcha = () => callFn('contact-challenge', {}, 'The contact form is not available right now. Please email support@jambwise.ng.')

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
