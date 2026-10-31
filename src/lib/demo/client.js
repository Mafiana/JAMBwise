// DEMO MODE ONLY. A small in-browser imitation of the parts of Supabase that JAMBwise uses, so the whole app
// (students, payments, PINs and the admin dashboard) can be tried with no setup. Everything is stored in this
// browser's localStorage. It enforces the same access rules as the real database, but it is NOT secure and
// is never used once .env points at a real Supabase project.
import eng from '../../../supabase/questions/eng.json'
import mat from '../../../supabase/questions/mat.json'
import phy from '../../../supabase/questions/phy.json'
import chm from '../../../supabase/questions/chm.json'
import bio from '../../../supabase/questions/bio.json'
import gov from '../../../supabase/questions/gov.json'
import eco from '../../../supabase/questions/eco.json'
import com from '../../../supabase/questions/com.json'
import agr from '../../../supabase/questions/agr.json'
import acc from '../../../supabase/questions/acc.json'
import mkt from '../../../supabase/questions/mkt.json'
import lit from '../../../supabase/questions/lit.json'
import irk from '../../../supabase/questions/irk.json'
import crk from '../../../supabase/questions/crk.json'
import hec from '../../../supabase/questions/hec.json'
import cst from '../../../supabase/questions/cst.json'
import geo from '../../../supabase/questions/geo.json'

import { DEFAULT_INSTITUTIONS } from '../constants.js'
import { DB_KEY, DEMO_ADMIN, DEMO_PARENT, DEMO_PIN, DEMO_STUDENT, DEMO_TEACHER, SESSION_KEY } from './accounts.js'

const SUBJECTS = ['eng', 'mat', 'phy', 'chm', 'bio', 'gov', 'eco', 'com', 'agr', 'acc', 'mkt', 'lit', 'irk', 'crk', 'hec', 'cst', 'geo']
const PROFILE_EDITABLE = ['full_name', 'course', 'school', 'avatar', 'subjects', 'exam_date', 'study_hours']

let nextQuestion = 1
const questions = Object.entries({ eng, mat, phy, chm, bio, gov, eco, com, agr, acc, mkt, lit, irk, crk, hec, cst, geo }).flatMap(([subject, list]) =>
  list.map((q) => ({ id: nextQuestion++, subject, body: q.q, options: q.o, answer: q.a, explanation: q.e })),
)

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString()
const daysAhead = (n) => new Date(Date.now() + n * 864e5).toISOString()

function newProfile(id, email, name, extra = {}) {
  return {
    id, email, full_name: name, reg_number: `JW-2026-${String(100000 + Math.floor(Math.random() * 900000))}`,
    course: '', school: '', avatar: null, plan: 'free', plan_expires: null, subjects: ['mat', 'phy', 'chm'],
    exam_date: null, study_hours: 3, is_admin: false, is_teacher: false, suspended: false, institution_id: null, inst_title: null, created_at: new Date().toISOString(), ...extra,
  }
}

function seed() {
  const users = [
    { id: 'demo-admin', ...DEMO_ADMIN },
    { id: 'demo-student', ...DEMO_STUDENT },
    { id: 'demo-teacher', ...DEMO_TEACHER },
    { id: 'demo-ngozi', email: 'ngozi@demo.com', password: 'demo1234' },
    { id: 'demo-tunde', email: 'tunde@demo.com', password: 'demo1234' },
  ]
  const profiles = [
    newProfile('demo-admin', DEMO_ADMIN.email, 'Demo Admin', { is_admin: true, plan: 'pro', reg_number: 'JW-2026-000001', created_at: daysAgo(40) }),
    newProfile('demo-teacher', DEMO_TEACHER.email, 'Demo Teacher', { is_teacher: true, plan: 'pro', reg_number: 'JW-2026-000003', created_at: daysAgo(30) }),
    newProfile('demo-student', DEMO_STUDENT.email, 'Demo Student', { reg_number: 'JW-2026-000002', created_at: daysAgo(2) }),
    newProfile('demo-ngozi', 'ngozi@demo.com', 'Ngozi Okafor', { plan: 'student', plan_expires: daysAhead(18), course: 'Medicine', school: 'University of Ibadan', reg_number: 'JW-2026-482913', created_at: daysAgo(12) }),
    newProfile('demo-tunde', 'tunde@demo.com', 'Tunde Bakare', { plan: 'pro', plan_expires: daysAhead(25), course: 'Law', school: 'UNILAG', reg_number: 'JW-2026-775120', created_at: daysAgo(20) }),
  ]
  const attempts = []
  let id = 1
  const add = (user_id, subject, correct, total, kind, mock_score, ago) =>
    attempts.push({ id: id++, user_id, subject, correct, total, kind, mock_score, created_at: daysAgo(ago) })
  add('demo-ngozi', 'eng', 15, 20, 'practice', null, 3); add('demo-ngozi', 'mat', 12, 20, 'practice', null, 2)
  add('demo-ngozi', 'bio', 17, 20, 'practice', null, 1)
  add('demo-tunde', 'eng', 16, 20, 'mock', 290, 5); add('demo-tunde', 'gov', 18, 20, 'mock', null, 5)
  add('demo-tunde', 'eco', 14, 20, 'mock', null, 5); add('demo-tunde', 'com', 15, 20, 'mock', null, 5)
  return {
    users, profiles, attempts, nextAttempt: id,
    pins: [{ pin: DEMO_PIN, plan: 'student', student_name: 'Sample student', days: 30, used_by: null, used_at: null, created_at: daysAgo(1) }],
    plans: [{ id: 'free', name: 'Free', price_kobo: 0 }, { id: 'student', name: 'Student', price_kobo: 150000 }, { id: 'pro', name: 'Pro', price_kobo: 300000 }],
    messages: [
      { id: 1, name: 'Chioma Eze', email: 'chioma@example.com', topic: 'pin', body: 'My tutor gave me a PIN but it says invalid. Please help.', user_id: null, status: 'new', created_at: daysAgo(0.2) },
      { id: 3, name: 'Demo Student', email: 'student@demo.com', topic: 'general', subject: 'Question about my plan', body: 'Hello, how long does my free plan last and what do I get when I upgrade?', user_id: 'demo-student', status: 'answered', created_at: daysAgo(1) },
      { id: 2, name: 'Ibrahim Musa', email: 'ibrahim@example.com', topic: 'payment', body: 'I paid yesterday but my plan is still free.', user_id: null, status: 'read', created_at: daysAgo(1) },
    ],
    replies: [{ id: 1, message_id: 3, author: 'demo-admin', is_staff: true, body: 'Hi! Thanks for reaching out. Your plan is active until the end of the month. Please log out and back in to refresh it.', created_at: daysAgo(0.5) }],
    nextReply: 2,
    examSettings: {},   // { hall: { opens_at, closes_at, max_violations } }
    events: [],         // "left the exam screen" log
    nextMessage: 4,
    audit: [{ id: 1, actor_email: DEMO_ADMIN.email, action: 'pin.create', detail: DEMO_PIN + ' (student, 30 days)', created_at: daysAgo(1) }],
    nextAudit: 2,
    institutions: DEFAULT_INSTITUTIONS.map((i) => ({ ...i, id: 'inst-' + i.slug, created_at: daysAgo(60) })),
    notifications: [], nextNotif: 1, staffChat: [], nextChat: 1,
    parentCodes: { 'demo-student': { code: DEMO_PARENT.code, expires_at: daysAhead(365), created_at: new Date().toISOString() } }, parentSessions: [], parentLog: [], nextParentLog: 1,
    qEdits: { added: [], edited: {}, deleted: [], next: 100000 },
    payments: [
      { reference: 'JWDEMO0001', user_id: 'demo-ngozi', plan: 'student', amount_kobo: 150000, status: 'paid', created_at: daysAgo(12) },
      { reference: 'JWDEMO0002', user_id: 'demo-tunde', plan: 'pro', amount_kobo: 300000, status: 'paid', created_at: daysAgo(5) },
    ],
  }
}

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode: stays in memory */ } }

let db = { ...seed(), ...(read(DB_KEY) || {}) } // older saved demos pick up new tables from the seed
if (!db.users.some((u) => u.id === 'demo-teacher')) {   // a demo saved before teachers existed gets the sample teacher too
  db.users.push({ id: 'demo-teacher', ...DEMO_TEACHER })
  db.profiles.push(newProfile('demo-teacher', DEMO_TEACHER.email, 'Demo Teacher', { is_teacher: true, plan: 'pro', reg_number: 'JW-2026-000003', created_at: daysAgo(30) }))
}
let session = read(SESSION_KEY)
const listeners = new Set()
const save = () => write(DB_KEY, db)
const setSession = (s, event) => { session = s; write(SESSION_KEY, s); listeners.forEach((f) => f(event, s)) }

// ── rules (same as supabase/schema.sql) ──
const me = () => session?.user?.id
const profileOf = (id) => db.profiles.find((p) => p.id === id)
const isAdmin = () => Boolean(profileOf(me())?.is_admin)
const isStaff = () => { const p = profileOf(me()); return Boolean(p?.is_admin || p?.is_teacher) }   // admin or teacher
/** Same rule as public.staff_sees(): an admin sees everyone; staff in an institution see only that institution's people; staff in none see all. */
const myInst = () => profileOf(me())?.institution_id || null
const staffSees = (userId) => isAdmin() || (isStaff() && (!myInst() || (Boolean(userId) && profileOf(userId)?.institution_id === myInst())))
const isPaid = (p) => Boolean(p && ['student', 'pro'].includes(p.plan) && (!p.plan_expires || new Date(p.plan_expires) > new Date()) && !p.suspended)
const hasAccess = (subject) => ['eng', 'mat'].includes(subject) || isPaid(profileOf(me()))
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 120))
const err = (message) => ({ data: null, error: { message } })

const allQuestions = () => {
  const e = db.qEdits
  return questions.filter((x) => !e.deleted.includes(x.id)).map((x) => e.edited[x.id] || x).concat(e.added)
}
const tableRows = (name) =>
  name === 'questions' ? allQuestions() : name === 'access_pins' ? db.pins : name === 'audit_log' ? db.audit : name === 'message_replies' ? db.replies : db[name]

const log = (action, detail) =>
  db.audit.unshift({ id: db.nextAudit++, actor: me(), actor_email: profileOf(me())?.email, action, detail: String(detail).slice(0, 500), created_at: new Date().toISOString() })

const MSG_TOPICS = ['general', 'payment', 'pin', 'bug', 'question', 'suspended', 'other']
const EMAIL = /^[^@\s]+@[^@\s]+$/
const HOUR = 36e5
const DAY = 24 * HOUR
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false   // lets the offline features be tried in demo mode

const validMessage = (r) =>
  Boolean(r.name?.trim()) && r.name.length <= 100 && EMAIL.test(r.email || '') && r.email.length <= 200 &&
  MSG_TOPICS.includes(r.topic || 'general') && (!r.subject || r.subject.length <= 120) && (r.body || '').length >= 5 && r.body.length <= 2000

/** The same spam limits as the database trigger in supabase/schema.sql. Returns a message when the sender must wait, else ''. */
function messageLimit(r, abuseKey) {
  if (isStaff()) return ''
  const now = Date.now()
  const within = (m, ms) => now - new Date(m.created_at).getTime() < ms
  const email = r.email.toLowerCase()
  if (db.messages.some((m) => m.email.toLowerCase() === email && m.body === r.body && within(m, DAY))) return 'You already sent this message. We will reply soon.'
  if (r.user_id) {
    const mine = db.messages.filter((m) => m.user_id === r.user_id)
    if (mine.filter((m) => within(m, HOUR)).length >= (r.topic === 'question' ? 10 : 5)) return 'You are sending messages too quickly. Please try again in a little while.'
    if (mine.filter((m) => within(m, DAY)).length >= 25) return 'Daily limit reached. Please try again tomorrow.'
  } else {
    const guests = db.messages.filter((m) => !m.user_id && within(m, HOUR))
    if (guests.filter((m) => m.email.toLowerCase() === email).length >= 3) return 'Too many messages from this email address. Please try again later.'
    if (abuseKey && guests.filter((m) => m.abuse_key === abuseKey).length >= 10) return 'Too many messages from your network. Please try again later.'
    if (guests.length >= 120) return 'Support is very busy right now. Please try again later.'
  }
  return ''
}

function addMessage(r, abuseKey = null) {
  const row = { id: db.nextMessage++, name: r.name.trim(), email: r.email.trim(), topic: r.topic || 'general', subject: r.subject?.trim() || null, body: r.body.trim(), user_id: r.user_id || null, status: 'new', abuse_key: abuseKey, created_at: new Date().toISOString() }
  db.messages.unshift(row)
  if (!row.user_id || row.topic === 'suspended') {   // mail: every admin's bell rings
    const txt = (row.name || 'Someone') + ': ' + (row.subject || row.body).slice(0, 160)
    db.profiles.filter((p) => p.is_admin).forEach((adm) => notify(adm.id, 'mail', row.topic === 'suspended' ? 'Message from a suspended account' : 'New mail', txt, '/app/admin/mail'))
  }
  return row
}
const validQuestion = (r) =>
  SUBJECTS.includes(r.subject) && typeof r.body === 'string' && r.body.trim().length > 0 && Array.isArray(r.options) && r.options.length === 4 &&
  Number.isInteger(r.answer) && r.answer >= 0 && r.answer <= 3

function from(name) {
  const q = { filters: [], op: 'select', patch: null, one: null, order: null, limit: null }
  const run = () => {
    const uid = me()
    if (offline()) return err('Failed to fetch')
    const open = name === 'plans' || name === 'institutions'   // anonymous visitors may read prices; they cannot write anything (the contact form goes through an Edge Function)
    if (!uid && !open) return err('JWT expired')
    let list = (tableRows(name) || []).slice()
    if (name === 'questions') list = list.filter((x) => hasAccess(x.subject) || isStaff())
    if (name === 'profiles') list = list.filter((x) => x.id === uid || isAdmin() || (isStaff() && !x.is_admin && !x.is_teacher && staffSees(x.id)))
    if (name === 'attempts') list = list.filter((x) => (isStaff() && staffSees(x.user_id)) || (x.user_id === uid && x.kind !== 'hall'))   // staff see every kind (teachers: their own institution); a student never sees their ExamHall score here
    if (name === 'access_pins' || name === 'audit_log') list = isAdmin() ? list : []
    if (name === 'messages') list = list.filter((x) => (isStaff() && (staffSees(x.user_id) || x.assigned_to === uid)) || (x.user_id && x.user_id === uid))
    if (name === 'message_replies') list = list.filter((x) => db.messages.some((m) => m.id === x.message_id && ((isStaff() && (staffSees(m.user_id) || m.assigned_to === uid)) || m.user_id === uid)))
    if (name === 'payments') list = list.filter((x) => x.user_id === uid || isAdmin())
    for (const [c, v] of q.filters) list = list.filter((x) => (Array.isArray(v) ? v.includes(x[c]) : x[c] === v))
    const finish = (rows) => {
      if (q.order) rows.sort((a, b) => (a[q.order.c] < b[q.order.c] ? 1 : -1) * (q.order.asc ? -1 : 1))
      if (q.limit) rows = rows.slice(0, q.limit)
      if (q.one === 'one') return rows.length === 1 ? { data: { ...rows[0] }, error: null } : err('no rows')
      if (q.one === 'maybe') return { data: rows[0] ? { ...rows[0] } : null, error: null }
      return { data: rows.map((x) => ({ ...x })), error: null }
    }

    if (q.op === 'update') {
      const keys = Object.keys(q.patch)
      if (name === 'profiles') {
        if (keys.some((k) => !PROFILE_EDITABLE.includes(k))) return err('permission denied for table profiles')
        list = list.filter((x) => x.id === uid)
      } else if (name === 'plans') {
        if (keys.some((k) => !['name', 'price_kobo'].includes(k)) || !isAdmin()) return err('permission denied')
        if (q.patch.price_kobo != null && !(Number.isInteger(q.patch.price_kobo) && q.patch.price_kobo >= 0)) return err('invalid price')
        list.forEach((x) => Object.assign(x, q.patch))
        log('plan.price', `${list.map((x) => x.id).join(',')} -> ${q.patch.price_kobo}`)
        save(); return finish(list)
      } else if (name === 'messages') {
        if (keys.some((k) => k !== 'status') || !isStaff()) return err('permission denied')
        if (!['new', 'read', 'answered', 'resolved'].includes(q.patch.status)) return err('invalid status')
      } else if (name === 'questions') {
        if (!isStaff()) return err('permission denied')
        for (const x of list) {
          const next = { ...x, ...q.patch }
          if (!validQuestion(next)) return err('invalid question')
          if (questions.some((o) => o.id === x.id)) db.qEdits.edited[x.id] = next
          else db.qEdits.added = db.qEdits.added.map((o) => (o.id === x.id ? next : o))
        }
        log('question.edit', list.map((x) => x.id).join(','))
        save(); return finish(list.map((x) => ({ ...x, ...q.patch })))
      } else return err('permission denied')
      list.forEach((x) => Object.assign(x, q.patch))
      save()
    } else if (q.op === 'insert') {
      const rows = [].concat(q.patch)
      if (name === 'attempts') {
        const p = profileOf(uid)
        const scored = new Set(db.attempts.filter((x) => x.user_id === uid && x.mock_score != null).map((x) => x.kind))
        for (const r of rows) {
          const ok = r.user_id === uid && !p.suspended && SUBJECTS.includes(r.subject) && hasAccess(r.subject) && ['practice', 'mock', 'hall'].includes(r.kind) &&
            (r.kind === 'practice' || isPaid(p)) && r.correct >= 0 && r.correct <= r.total && r.total >= 1 && r.total <= 200
          if (!ok) return err('new row violates row-level security policy')
          // one CBT Mock and one ExamHall per student, like the database trigger
          if (r.kind !== 'practice' && r.mock_score != null) {
            const w = db.examSettings[r.kind]
            if (w?.opens_at && Date.now() < new Date(w.opens_at).getTime()) return err('exam_not_open: This exam has not opened yet.')
            if (scored.has(r.kind)) return err('mock_already_taken: You have already submitted this exam.')
            scored.add(r.kind)
          }
          db.attempts.push({ id: db.nextAttempt++, created_at: new Date().toISOString(), mock_score: null, ...r })
        }
        save()
        return { data: null, error: null }
      }
      if (name === 'messages') {
        for (const r of rows) {
          if (!validMessage(r) || !r.user_id || r.user_id !== uid) return err('new row violates row-level security policy')
          const limited = messageLimit(r, 'demo-device')
          if (limited) return err('rate_limited: ' + limited)
          addMessage(r, 'demo-device')
        }
        save()
        return { data: null, error: null }
      }
      if (name === 'questions') {
        if (!isAdmin()) return err('permission denied')   // teachers send questions for review instead
        const out = []
        for (const r of rows) {
          if (!validQuestion(r)) return err('invalid question')
          if (allQuestions().some((x) => x.subject === r.subject && x.body === r.body)) return err('duplicate key value violates unique constraint')
          const row = { id: db.qEdits.next++, subject: r.subject, body: r.body, options: r.options, answer: r.answer, explanation: r.explanation || null, created_by: uid }
          db.qEdits.added.push(row); out.push(row)
        }
        log('question.add', out.map((x) => x.id).join(','))
        save(); return finish(out)
      }
      return err('permission denied')
    } else if (q.op === 'delete') {
      if (name === 'attempts') { list = list.filter((x) => x.user_id === uid && x.kind === 'practice'); db.attempts = db.attempts.filter((x) => !list.includes(x)) }
      else if (name === 'access_pins') { list = list.filter((x) => !x.used_by && !x.used_at); db.pins = db.pins.filter((x) => !list.includes(x)) }
      else if (name === 'messages') { if (!isAdmin()) return err('permission denied'); db.messages = db.messages.filter((x) => !list.includes(x)); db.replies = db.replies.filter((r) => db.messages.some((m) => m.id === r.message_id)) }
      else if (name === 'questions') {
        if (!isAdmin()) return err('permission denied')
        for (const x of list) {
          if (questions.some((o) => o.id === x.id)) db.qEdits.deleted.push(x.id)
          else db.qEdits.added = db.qEdits.added.filter((o) => o.id !== x.id)
        }
        log('question.delete', list.map((x) => x.id).join(','))
      } else return err('permission denied')
      save()
      return { data: null, error: null }
    }
    return finish(list)
  }
  const b = {
    select() { return b },
    eq(c, v) { q.filters.push([c, v]); return b },
    in(c, values) { q.filters.push([c, [...values]]); return b },
    order(c, o) { q.order = { c, asc: o?.ascending !== false }; return b },
    limit(n) { q.limit = n; return b },
    update(p) { q.op = 'update'; q.patch = p; return b },
    insert(p) { q.op = 'insert'; q.patch = p; return b },
    delete() { q.op = 'delete'; return b },
    single() { q.one = 'one'; return b },
    maybeSingle() { q.one = 'maybe'; return b },
    then(resolve, reject) { return wait().then(run).then(resolve, reject) },
  }
  return b
}


// ── notifications and admin ↔ teacher chat (same rules as supabase/schema.sql) ──
function notify(userId, kind, title, body, link) {
  if (kind === 'chat') {   // repeated chat pings collapse into one unread notification
    const open = db.notifications.find((n) => n.user_id === userId && n.kind === 'chat' && n.link === link && !n.read_at)
    if (open) { Object.assign(open, { title, body: body.slice(0, 500), created_at: new Date().toISOString() }); return }
  }
  db.notifications.push({ id: db.nextNotif++, user_id: userId, kind, title: title.slice(0, 200), body: body.slice(0, 500), link, read_at: null, created_at: new Date().toISOString() })
}
const canSeeThread = (teacherId) => isAdmin() || (isStaff() && teacherId === me())


// ── parent access (same rules as supabase/schema.sql) ──
function examResultFor(uid, kind) {
  if (!['mock', 'hall'].includes(kind)) return null
  const mine = db.attempts.filter((x) => x.user_id === uid && x.kind === kind)
  const head = mine.filter((x) => x.mock_score != null).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0]
  if (!head) return null
  if (kind === 'hall' && !db.examSettings.hall?.results_released) return { date: head.created_at, released: false }
  const t = new Date(head.created_at).getTime()
  const subs = mine.filter((x) => x === head || (x.mock_score == null && Math.abs(new Date(x.created_at).getTime() - t) <= 60000)).sort((x, y) => x.id - y.id)
  return { date: head.created_at, released: true, total: head.mock_score, subjects: subs.map((x) => ({ subject: x.subject, correct: x.correct, total: x.total })) }
}
const PARENT_MIN = 60 * 6e4
function parentCodeText() {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = () => Array.from({ length: 4 }, () => al[Math.floor(Math.random() * al.length)]).join('')
  return part() + '-' + part()
}
const parentLogRow = (row) => db.parentLog.unshift({ id: db.nextParentLog++, student_id: null, reg_number: null, parent_name: null, relationship: null, device: 'Demo browser', ip: 'demo-device', created_at: new Date().toISOString(), ...row })

const adminOnly = () => { if (!isAdmin()) throw new Error('not allowed') }
const ticketOf = (id) => {
  const m = db.messages.find((x) => x.id === id)
  if (!m || (!isStaff() && m.user_id !== me()) || (isStaff() && !staffSees(m.user_id) && m.assigned_to !== me())) throw new Error('not allowed')
  return m
}
/** Reports a question: the ticket goes to the teacher or admin who uploaded it (or to the admins when nobody is recorded). */
function reportQuestion(a) {
  const me_ = profileOf(me())
  if (!me_) throw new Error('not allowed')
  const q = allQuestions().find((x) => x.id === a.p_question)
  const up = q?.created_by ? profileOf(q.created_by) : null
  const target = up && (up.is_admin || up.is_teacher) ? up.id : null
  const who = target ? (up.full_name || 'the uploader') : 'the admins'
  const r = { name: me_.full_name || 'Student', email: me_.email, topic: 'question', subject: String(a.p_subject || '').slice(0, 120), body: ('Sent to: ' + who + '\n' + a.p_body).slice(0, 2000), user_id: me_.id }
  if (!validMessage(r)) throw new Error('new row violates row-level security policy')
  const limited = messageLimit(r, 'demo-device')
  if (limited) throw new Error('rate_limited: ' + limited)
  const row = addMessage(r, 'demo-device'); row.assigned_to = target; row.question_id = a.p_question
  const text = `${r.name} reported a question: ${r.subject}`
  if (target) notify(target, 'question', 'Question reported', text, '/app/admin/messages')
  else db.profiles.filter((p) => p.is_admin).forEach((adm) => notify(adm.id, 'question', 'Question reported', text, '/app/admin/messages'))
  return row.id
}
const randomPin = () => {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = () => Array.from({ length: 4 }, () => al[Math.floor(Math.random() * al.length)]).join('')
  let pin
  do pin = part() + '-' + part(); while (db.pins.some((x) => x.pin === pin))
  return pin
}
const rpcs = {
  report_question(a) { return reportQuestion(a) },
  coupon_quote(a) {
    if (!me()) throw new Error('JWT expired')
    const cd = String(a.p_code || '').trim().toUpperCase()
    const plan = db.plans.find((x) => x.id === a.p_plan)
    const lp = plan?.price_kobo || 0
    const no = (message) => [{ valid: false, message, coupon_id: null, code: cd, percent: 0, list_kobo: lp, discount_kobo: 0, final_kobo: lp }]
    if (!lp) return no('Unknown plan.')
    const c = (db.coupons || []).find((x) => x.code === cd)
    if (!c || !c.active) return no('That code is not valid.')
    if (c.expires_at && new Date(c.expires_at) <= new Date()) return no('That code has expired.')
    if (c.max_uses != null && c.used_count >= c.max_uses) return no('That code has been fully used.')
    if (c.plan !== 'all' && c.plan !== a.p_plan) return no('That code is for the ' + c.plan[0].toUpperCase() + c.plan.slice(1) + ' plan only.')
    const final = Math.max(10000, Math.round((lp * (100 - c.percent)) / 100 / 100) * 100)
    return [{ valid: true, message: c.percent + '% off applied.', coupon_id: c.id, code: c.code, percent: c.percent, list_kobo: lp, discount_kobo: lp - final, final_kobo: final }]
  },
  admin_coupons() { adminOnly(); return (db.coupons || []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) },
  admin_save_coupon(a) {
    adminOnly()
    const code = String(a.p_code || '').trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new Error('The code must be 3 to 20 letters or numbers (no spaces).')
    if (!Number.isInteger(a.p_percent) || a.p_percent < 1 || a.p_percent > 90) throw new Error('The discount must be from 1% to 90%.')
    if (!['all', 'student', 'pro'].includes(a.p_plan)) throw new Error('Choose a plan.')
    if (a.p_expires && new Date(a.p_expires) <= new Date()) throw new Error('The end date must be in the future.')
    if (a.p_max_uses != null && a.p_max_uses < 1) throw new Error('The use limit must be at least 1.')
    db.coupons = db.coupons || []
    if (db.coupons.some((c) => c.code === code)) throw new Error(`A code named ${code} already exists.`)
    const row = { id: db.coupons.reduce((n, c) => Math.max(n, c.id), 0) + 1, code, percent: a.p_percent, plan: a.p_plan, expires_at: a.p_expires || null, max_uses: a.p_max_uses ?? null, used_count: 0, active: true, created_at: new Date().toISOString() }
    db.coupons.push(row)
    log('coupon.add', `${code} ${a.p_percent}% ${a.p_plan}`)
    return row.id
  },
  admin_set_coupon_active(a) { adminOnly(); const c = (db.coupons || []).find((x) => x.id === a.p_id); if (c) c.active = Boolean(a.p_active) },
  admin_delete_coupon(a) { adminOnly(); db.coupons = (db.coupons || []).filter((x) => x.id !== a.p_id) },
  submit_feedback(a) {
    if (!me()) throw new Error('JWT expired')
    const msg = String(a.p_message || '').trim()
    if (!['feedback', 'feature', 'bug'].includes(a.p_kind)) throw new Error('Choose Feedback, Feature idea or Bug.')
    if (a.p_rating != null && !(a.p_rating >= 1 && a.p_rating <= 5)) throw new Error('The rating must be from 1 to 5 stars.')
    if (a.p_rating == null && !msg) throw new Error('Please give a star rating or write a message.')
    db.feedback = db.feedback || []
    if (db.feedback.filter((f) => f.user_id === me() && Date.now() - new Date(f.created_at) < 864e5).length >= 5) throw new Error('You have sent several already today. Thank you! Please try again tomorrow.')
    const row = { id: db.feedback.reduce((n, f) => Math.max(n, f.id), 0) + 1, user_id: me(), rating: a.p_rating ?? null, kind: a.p_kind, message: msg || null, status: 'new', created_at: new Date().toISOString() }
    db.feedback.push(row)
    const p = profileOf(me())
    const label = { feature: 'a feature idea', bug: 'a bug report', feedback: 'feedback' }[a.p_kind]
    db.profiles.filter((x) => x.is_admin).forEach((x) => notify(x.id, 'feedback', 'New ' + { feature: 'feature idea', bug: 'bug report', feedback: 'feedback' }[a.p_kind], `${p?.full_name || 'Someone'} sent ${label}${a.p_rating ? ` (${a.p_rating} stars)` : ''}.`, '/app/admin/feedback'))
    return row.id
  },
  admin_feedback() {
    adminOnly()
    return (db.feedback || []).map((f) => { const p = profileOf(f.user_id); return { ...f, name: p?.full_name || null, email: p?.email || null, role: p?.is_teacher ? 'teacher' : 'student' } }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  },
  admin_set_feedback_status(a) {
    adminOnly()
    const f = (db.feedback || []).find((x) => x.id === a.p_id)
    if (f && ['new', 'done'].includes(a.p_status)) f.status = a.p_status
  },
  admin_delete_feedback(a) { adminOnly(); db.feedback = (db.feedback || []).filter((x) => x.id !== a.p_id) },
  admin_send_announcement(a) {
    adminOnly()
    const title = String(a.p_title || '').trim(); const body = String(a.p_body || '').trim()
    if (!title || title.length > 120) throw new Error('Write a title (up to 120 characters).')
    if (!body || body.length > 2000) throw new Error('Write the message (up to 2000 characters).')
    if (!['all', 'private'].includes(a.p_audience)) throw new Error('Choose who should get it.')
    db.announcements = db.announcements || []
    const ids = a.p_audience === 'private' ? (a.p_user_ids || []).filter((id) => profileOf(id)) : []
    if (a.p_audience === 'private' && !ids.length) throw new Error('Choose at least one person.')
    const row = { id: db.announcements.reduce((n, x) => Math.max(n, x.id), 0) + 1, title, body, audience: a.p_audience, recipients: ids, created_at: new Date().toISOString() }
    db.announcements.push(row)
    const to = a.p_audience === 'all' ? db.profiles.filter((p) => !p.is_admin && !p.suspended) : ids.map(profileOf).filter((p) => p && !p.is_admin)
    to.forEach((p) => notify(p.id, 'announce', title, body, p.is_teacher ? '/app/admin/announcements' : '/app/announcements'))
    return row.id
  },
  admin_announcements() {
    adminOnly()
    return (db.announcements || []).map((x) => ({ id: x.id, title: x.title, body: x.body, audience: x.audience, recipients: x.audience === 'all' ? null : x.recipients.map((id) => profileOf(id)?.full_name || profileOf(id)?.email), created_at: x.created_at })).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  },
  admin_delete_announcement(a) {
    adminOnly()
    const x = (db.announcements || []).find((y) => y.id === a.p_id)
    if (x) db.notifications = db.notifications.filter((n) => !(n.kind === 'announce' && n.title === x.title && n.body === x.body.slice(0, 500)))
    db.announcements = (db.announcements || []).filter((y) => y.id !== a.p_id)
  },
  my_announcements() {
    if (!me()) throw new Error('JWT expired')
    return (db.announcements || []).filter((x) => x.audience === 'all' || x.recipients.includes(me())).map(({ recipients, ...r }) => r).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  },
  submit_question(a) {
    if (!isStaff()) throw new Error('not allowed')
    if (isAdmin()) throw new Error('Admins add questions directly.')
    const body = String(a.p_body || '').trim()
    if (!body || body.length > 1000) throw new Error('Write the question (up to 1000 characters).')
    if (!Array.isArray(a.p_options) || a.p_options.length !== 4 || a.p_options.some((o) => !String(o).trim())) throw new Error('Fill in all four options.')
    if (!Number.isInteger(a.p_answer) || a.p_answer < 0 || a.p_answer > 3) throw new Error('Choose the correct option.')
    if (!SUBJECTS.includes(a.p_subject)) throw new Error('Choose a subject.')
    db.qSubs = db.qSubs || []
    if (allQuestions().some((x) => x.subject === a.p_subject && x.body === body)) throw new Error('That question already exists in this subject.')
    if (db.qSubs.some((s) => s.status === 'pending' && s.subject === a.p_subject && s.body === body)) throw new Error('That question is already waiting for review.')
    const row = { id: db.qSubs.reduce((n, s) => Math.max(n, s.id), 0) + 1, submitted_by: me(), subject: a.p_subject, body, options: a.p_options.map((o) => String(o).trim()), answer: a.p_answer, explanation: String(a.p_explanation || '').trim() || null, status: 'pending', decline_reason: null, created_at: new Date().toISOString(), reviewed_at: null }
    db.qSubs.push(row)
    const who = profileOf(me())?.full_name || 'A teacher'
    db.profiles.filter((p) => p.is_admin).forEach((p) => notify(p.id, 'review', 'Question to review', `${who} added a question in ${a.p_subject.toUpperCase()} and it is waiting for your review.`, '/app/admin/questions?review=1'))
    return row.id
  },
  my_question_submissions() {
    return (db.qSubs || []).filter((s) => s.submitted_by === me()).map(({ options, answer, explanation, ...r }) => r).sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
  },
  admin_pending_questions() {
    adminOnly()
    return (db.qSubs || []).filter((s) => s.status === 'pending').map((s) => ({ ...s, teacher_name: profileOf(s.submitted_by)?.full_name || null }))
  },
  admin_review_question(a) {
    adminOnly()
    const s = (db.qSubs || []).find((x) => x.id === a.p_id && x.status === 'pending')
    if (!s) throw new Error('This question has already been reviewed.')
    if (a.p_approve) {
      if (allQuestions().some((x) => x.subject === s.subject && x.body === s.body)) throw new Error('That question already exists in this subject. Decline it instead.')
      db.qEdits.added.push({ id: db.qEdits.next++, subject: s.subject, body: s.body, options: s.options, answer: s.answer, explanation: s.explanation, created_by: s.submitted_by })
      Object.assign(s, { status: 'approved', reviewed_at: new Date().toISOString() })
      notify(s.submitted_by, 'review', 'Question approved', 'Your question has been Approved and Added Successfully.', '/app/admin/questions')
      log('question.add', s.body.slice(0, 40))
    } else {
      const why = String(a.p_reason || '').trim().slice(0, 300) || null
      Object.assign(s, { status: 'declined', decline_reason: why, reviewed_at: new Date().toISOString() })
      notify(s.submitted_by, 'review', 'Question not approved', 'Your question was not approved.' + (why ? ' Reason: ' + why : ''), '/app/admin/questions')
    }
  },
  list_syllabi() {
    if (!me()) throw new Error('JWT expired')
    return (db.syllabi || []).map(({ data, ...rest }) => rest).sort((a, b) => a.subject.localeCompare(b.subject))
  },
  get_syllabus(a) {
    if (!me()) throw new Error('JWT expired')
    return (db.syllabi || []).find((s) => s.id === a.p_id)?.data || null
  },
  admin_add_syllabus(a) {
    adminOnly()
    const subject = String(a.p_subject || '').trim()
    if (subject.length < 2 || subject.length > 80) throw new Error('Enter the subject name (2 to 80 characters).')
    if (!String(a.p_data || '').startsWith('data:application/pdf;base64,')) throw new Error('Please choose a PDF file.')
    if (a.p_data.length > 4400000) throw new Error('That PDF is too big. Choose one under 3 MB.')
    db.syllabi = db.syllabi || []
    const old = db.syllabi.find((s) => s.subject.toLowerCase() === subject.toLowerCase())
    const row = { id: old ? old.id : (db.syllabi.reduce((n, s) => Math.max(n, s.id), 0) + 1), subject, file_name: String(a.p_file_name || '').slice(0, 200), size_bytes: a.p_size || 0, data: a.p_data, created_at: new Date().toISOString() }
    db.syllabi = db.syllabi.filter((s) => s !== old).concat(row)
    log('syllabus.add', subject)
    return row.id
  },
  admin_delete_syllabus(a) {
    adminOnly()
    const s = (db.syllabi || []).find((x) => x.id === a.p_id)
    if (s) { db.syllabi = db.syllabi.filter((x) => x !== s); log('syllabus.delete', s.subject) }
  },
  exam_window(a) {
    const w = db.examSettings[a.p_kind] || {}
    return { opens_at: w.opens_at || null, closes_at: w.closes_at || null, max_violations: w.max_violations ?? 3, results_released: Boolean(w.results_released), server_now: new Date().toISOString() }
  },
  admin_set_exam_window(a) {
    adminOnly()
    if (!['mock', 'hall'].includes(a.p_kind)) throw new Error('unknown exam')
    if (a.p_opens && a.p_closes && new Date(a.p_closes) <= new Date(a.p_opens)) throw new Error('The closing time must be after the opening time.')
    const max = a.p_max ?? 3
    if (max < 0 || max > 20) throw new Error('violation limit out of range')
    db.examSettings[a.p_kind] = { ...(db.examSettings[a.p_kind] || {}), opens_at: a.p_opens || null, closes_at: a.p_closes || null, max_violations: max }
    log(a.p_kind + '.schedule', (a.p_opens || a.p_closes ? `${a.p_opens || 'any time'} to ${a.p_closes || 'no end'}` : 'open any time') + `, ${max} warnings`)
  },
  log_exam_event(a) {
    if (!me() || !['mock', 'hall'].includes(a.p_kind) || !['started', 'resumed', 'left_tab', 'left_fullscreen', 'limit_reached', 'submitted'].includes(a.p_type)) return null
    if (db.events.filter((e) => e.user_id === me() && e.kind === a.p_kind).length >= 300) return null
    db.events.push({ user_id: me(), kind: a.p_kind, type: a.p_type, occurred_at: a.p_at && new Date(a.p_at) < new Date() ? a.p_at : new Date().toISOString(), detail: String(a.p_detail || '').slice(0, 200) })
    return null
  },
  admin_set_results_released(a) {
    adminOnly()
    if (!['mock', 'hall'].includes(a.p_kind)) throw new Error('unknown exam')
    const was = Boolean(db.examSettings[a.p_kind]?.results_released)
    db.examSettings[a.p_kind] = { ...(db.examSettings[a.p_kind] || {}), results_released: Boolean(a.p_released) }
    if (a.p_released && !was) {   // ring the bell of everyone who sat the exam
      const hall = a.p_kind === 'hall'
      new Set(db.attempts.filter((x) => x.kind === a.p_kind && x.mock_score != null).map((x) => x.user_id)).forEach((uid) =>
        notify(uid, 'result', hall ? 'Your ExamHall result is out' : 'Your CBT Mock result is out', 'Your result has been released. Tap to see your score.', hall ? '/app/examhall' : '/app/mock'))
    }
    log(a.p_kind + (a.p_released ? '.release' : '.unrelease'), a.p_released ? 'results shown to students' : 'results hidden from students')
  },
  my_exam_result(a) { return examResultFor(me(), a.p_kind) },
  admin_set_staff_role(a) {
    adminOnly()
    if (!['student', 'teacher', 'admin'].includes(a.p_role)) throw new Error('unknown role')
    if (a.target === me()) throw new Error('you cannot change your own role')
    const p = profileOf(a.target)
    Object.assign(p, { is_admin: a.p_role === 'admin', is_teacher: a.p_role === 'teacher' })
    log('role.' + a.p_role, p.reg_number)
  },
  admin_exam_events(a) {
    if (!isStaff()) throw new Error('not allowed')
    return db.events.filter((e) => e.kind === a.p_kind && (!a.p_user || e.user_id === a.p_user) && staffSees(e.user_id)).sort((x, y) => String(x.occurred_at).localeCompare(String(y.occurred_at)))
  },
  my_exam_status(a) {
    const rows = db.attempts.filter((x) => x.user_id === me() && x.kind === a.p_kind && ['mock', 'hall'].includes(x.kind) && x.mock_score != null)
    return rows.length ? rows.map((x) => x.created_at).sort().pop() : null
  },
  admin_stats() {
    adminOnly()
    return [{
      students: db.profiles.length,
      paying: db.profiles.filter((p) => p.plan !== 'free' && (!p.plan_expires || new Date(p.plan_expires) > new Date())).length,
      revenue_kobo: db.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_kobo, 0),
      mocks: db.attempts.filter((a) => a.mock_score != null).length,
    }]
  },
  log_sign_in() {
    const p = profileOf(me())
    if (!p) return null
    const act = p.is_admin ? 'login.admin' : p.is_teacher ? 'login.teacher' : 'login.student'
    if (db.audit.some((x) => x.actor === p.id && x.action === act && Date.now() - new Date(x.created_at).getTime() < 30 * 60000)) return null
    const inst = db.institutions.find((i) => i.id === p.institution_id)
    db.audit.unshift({ id: db.nextAudit++, actor: p.id, actor_email: p.email, action: act, detail: `${p.full_name || 'Unnamed'} (${p.reg_number})${inst ? ', ' + inst.name + (p.is_teacher && p.inst_title ? ' ' + p.inst_title : '') : ''}`, created_at: new Date().toISOString() })
    return null
  },
  touch_presence() {
    const p = profileOf(me())
    if (p) p.last_seen = new Date().toISOString()
    return null
  },
  admin_online() {
    if (!isStaff()) throw new Error('not allowed')
    const day = Date.now() - 24 * 3600000
    const rows = db.profiles.filter((p) => p.last_seen && new Date(p.last_seen).getTime() > day && (isAdmin() || (!p.is_admin && !p.is_teacher && staffSees(p.id)))).map((p) => ({
      id: p.id, role: p.is_admin ? 'admin' : p.is_teacher ? 'teacher' : 'student', full_name: p.full_name, email: p.email, reg_number: p.reg_number,
      institution: db.institutions.find((i) => i.id === p.institution_id)?.name || null, inst_title: p.inst_title || null, last_seen: p.last_seen,
      online: Date.now() - new Date(p.last_seen).getTime() < 3 * 60000,
    }))
    const parents = db.parentSessions.filter((x) => new Date(x.expires_at) > new Date() && (isAdmin() || staffSees(x.student_id))).map((x) => {
      const st = profileOf(x.student_id)
      return { id: 'ps-' + x.token, role: 'parent', full_name: x.parent_name, email: null, reg_number: st?.reg_number || null, institution: db.institutions.find((i) => i.id === st?.institution_id)?.name || null, inst_title: null, last_seen: x.created_at || new Date().toISOString(), online: true }
    })
    return rows.concat(parents).sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
  },
  teacher_signed_in() {
    const t = profileOf(me())
    if (!t || !t.is_teacher || t.is_admin) return null
    const msg = `${t.full_name || 'A teacher'} signed in to the teacher panel.`
    db.profiles.filter((p) => p.is_admin).forEach((adm) => {
      if (!db.notifications.some((x) => x.user_id === adm.id && x.kind === 'teacher' && x.body === msg && Date.now() - new Date(x.created_at).getTime() < 30 * 60000)) notify(adm.id, 'teacher', 'Teacher signed in', msg, '/app/admin/teachers')
    })
    return null
  },
  my_notifications() {
    if (!me()) throw new Error('not allowed')
    return db.notifications.filter((n) => n.user_id === me()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1) || b.id - a.id).slice(0, 30).map((n) => ({ ...n }))
  },
  mark_notifications_read(a) {
    const now = new Date().toISOString()
    db.notifications.forEach((n) => { if (n.user_id === me() && !n.read_at && (a.p_id == null || n.id === a.p_id) && (a.p_link == null || n.link === a.p_link)) n.read_at = now })
    return null
  },
  staff_chat_send(a) {
    if (!isStaff()) throw new Error('not allowed')
    const body = String(a.p_body || '').trim()
    if (body.length < 1 || body.length > 2000) throw new Error('message must be 1-2000 characters')
    if (isAdmin()) { if (!profileOf(a.p_teacher)?.is_teacher) throw new Error('not a teacher') } else if (a.p_teacher !== me()) throw new Error('not allowed')
    db.staffChat.push({ id: db.nextChat++, teacher_id: a.p_teacher, sender_id: me(), body, created_at: new Date().toISOString() })
    const nm = profileOf(me())?.full_name || 'someone'
    if (isAdmin()) notify(a.p_teacher, 'chat', 'Message from ' + nm, body, '/app/admin/chat')
    else db.profiles.filter((p) => p.is_admin).forEach((p) => notify(p.id, 'chat', 'Message from ' + nm, body, '/app/admin/teachers?chat=' + a.p_teacher))
    return null
  },
  staff_chat_thread(a) {
    if (!canSeeThread(a.p_teacher)) throw new Error('not allowed')
    return db.staffChat.filter((c) => c.teacher_id === a.p_teacher).slice(-200).map((c) => ({ id: c.id, sender_id: c.sender_id, sender_name: profileOf(c.sender_id)?.full_name || 'Former user', body: c.body, created_at: c.created_at }))
  },
  staff_chat_inbox() {
    adminOnly()
    const last = new Map()
    db.staffChat.forEach((c) => last.set(c.teacher_id, c))
    return [...last.values()].map((c) => ({ teacher_id: c.teacher_id, last_body: c.body, last_at: c.created_at, last_from: c.sender_id }))
  },
  parent_code_create() {
    if (!me() || isStaff()) throw new Error('not allowed')
    const code = parentCodeText()
    const expires_at = daysAhead(7)
    db.parentCodes[me()] = { code, expires_at, created_at: new Date().toISOString() }
    db.parentSessions = db.parentSessions.filter((x) => x.student_id !== me())
    return [{ code, expires_at }]
  },
  parent_code_revoke() {
    if (!me()) throw new Error('not allowed')
    db.parentSessions = db.parentSessions.filter((x) => x.student_id !== me())
    delete db.parentCodes[me()]
    return null
  },
  my_parent_access() {
    if (!me()) throw new Error('not allowed')
    const c = db.parentCodes[me()]
    const live = c && new Date(c.expires_at) > new Date()
    return {
      code: live ? c.code : null, expires_at: c ? c.expires_at : null, expired: Boolean(c && !live),
      views: db.parentLog.filter((l) => l.student_id === me() && l.outcome === 'ok').slice(0, 20).map((l) => ({ parent_name: l.parent_name, relationship: l.relationship, device: l.device, created_at: l.created_at })),
    }
  },
  admin_parent_log() {
    adminOnly()
    return db.parentLog.slice(0, 2000).map((l) => {
      const p = profileOf(l.student_id)
      const c = db.parentCodes[l.student_id]
      return { id: l.id, student_id: l.student_id, student_name: p?.full_name || null, reg_number: p?.reg_number || l.reg_number, parent_name: l.parent_name, relationship: l.relationship, outcome: l.outcome, device: l.device, created_at: l.created_at, active: Boolean(c && new Date(c.expires_at) > new Date()) }
    })
  },
  admin_parent_revoke(a) {
    adminOnly()
    db.parentSessions = db.parentSessions.filter((x) => x.student_id !== a.p_student)
    delete db.parentCodes[a.p_student]
    log('parent.revoke', profileOf(a.p_student)?.reg_number || a.p_student)
    notify(a.p_student, 'parent', 'Parent access was switched off', 'An admin switched off your parent code. You can make a new one in Settings.', '/app/settings')
    return null
  },
  admin_students() {
    if (!isStaff()) throw new Error('not allowed')
    const all = isAdmin()
    return db.profiles.filter((p) => all || (!p.is_admin && !p.is_teacher && staffSees(p.id))).map((p) => {
      const at = db.attempts.filter((a) => a.user_id === p.id)
      const last = at.map((a) => a.created_at).sort().pop() || null
      const inst = db.institutions.find((i) => i.id === p.institution_id)
      return { ...p, institution: inst ? inst.name : null, questions: at.reduce((n, a) => n + a.total, 0), correct: at.reduce((n, a) => n + a.correct, 0), mocks: at.filter((a) => a.mock_score != null).length, last_active: last }
    }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  },
  admin_save_institution(a) {
    adminOnly()
    const name = String(a.p_name || '').trim()
    if (name.length < 2 || name.length > 120) throw new Error('Enter the institution name (2 to 120 characters).')
    if (db.institutions.some((i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== a.p_id)) throw new Error('An institution with this name already exists.')
    const location = String(a.p_location || '').trim().slice(0, 120) || null
    const note = String(a.p_note || '').trim().slice(0, 200) || null
    const logo = a.p_logo
    if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 80000)) throw new Error('The logo must be a small PNG, JPEG or WebP picture.')
    if (a.p_id) {
      const i = db.institutions.find((x) => x.id === a.p_id)
      if (!i) throw new Error('institution not found')
      Object.assign(i, { name, location, note })
      if (logo != null) i.logo = logo || null
      log('institution.edit', name)
      return i.id
    }
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) throw new Error('Enter a name with letters or numbers.')
    if (db.institutions.some((i) => i.slug === slug)) slug = slug.slice(0, 50) + '-' + Math.random().toString(36).slice(2, 7)
    const row = { id: 'inst-' + slug, slug, name, location, note, logo: logo || null, created_at: new Date().toISOString() }
    db.institutions.push(row)
    log('institution.add', name)
    return row.id
  },
  admin_delete_institution(a) {
    adminOnly()
    const i = db.institutions.find((x) => x.id === a.p_id)
    if (!i) throw new Error('institution not found')
    db.institutions = db.institutions.filter((x) => x !== i)
    db.profiles.forEach((p) => { if (p.institution_id === i.id) Object.assign(p, { institution_id: null, inst_title: null }) })
    log('institution.delete', i.name)
    return null
  },
  admin_assign_institution(a) {
    adminOnly()
    const p = profileOf(a.p_user)
    if (!p) throw new Error('person not found')
    const inst = a.p_inst ? db.institutions.find((x) => x.id === a.p_inst) : null
    if (a.p_inst && !inst) throw new Error('institution not found')
    if (a.p_title != null && !['Teacher', 'Proprietor', 'Proprietress', 'Official'].includes(a.p_title)) throw new Error('unknown title')
    p.institution_id = inst ? inst.id : null
    p.inst_title = inst && p.is_teacher ? (a.p_title || p.inst_title || 'Teacher') : null
    log('institution.assign', `${p.reg_number} -> ${inst ? inst.name : 'none'}`)
    if (inst && p.is_teacher) notify(p.id, 'teacher', 'You were assigned to ' + inst.name, `You now see the results of ${inst.name}'s students in your panel.`, '/app/admin/students')
    return null
  },
  admin_make_pin(a) {
    adminOnly()
    const pin = randomPin()
    db.pins.unshift({ pin, plan: a.p_plan, student_name: a.p_name || null, days: a.p_days, used_by: null, used_at: null, created_by: me(), created_at: new Date().toISOString() })
    log('pin.create', `${pin} (${a.p_plan}, ${a.p_days} days)`)
    return pin
  },
  admin_make_pins(a) {
    adminOnly()
    if (!(a.p_count >= 1 && a.p_count <= 100)) throw new Error('count must be 1-100')
    const out = []
    for (let i = 0; i < a.p_count; i++) {
      const pin = randomPin()
      db.pins.unshift({ pin, plan: a.p_plan, student_name: null, days: a.p_days, used_by: null, used_at: null, created_by: me(), created_at: new Date().toISOString() })
      out.push(pin)
    }
    log('pin.bulk', `${a.p_count} x ${a.p_plan} (${a.p_days} days)`)
    return out
  },
  admin_set_student(a) {
    adminOnly()
    const p = profileOf(a.target)
    Object.assign(p, { full_name: a.p_name, course: a.p_course, school: a.p_school, suspended: Boolean(a.p_suspended) })
    log(a.p_suspended ? 'student.suspend' : 'student.edit', p.reg_number)
  },
  admin_set_plan(a) {
    adminOnly()
    const p = profileOf(a.target)
    Object.assign(p, {
      plan: a.p_plan,
      plan_expires: a.p_plan === 'free' ? null : daysAhead(Math.max(1, Math.min(a.p_days || 30, 3650))),
    })
    log('student.plan', `${p.reg_number} -> ${a.p_plan}`)
  },
  admin_import_questions(a) {
    if (!isStaff()) throw new Error('not allowed')
    const list = a.p_rows
    if (!Array.isArray(list) || list.length < 1 || list.length > 500) throw new Error('send between 1 and 500 questions at a time')
    let inserted = 0; let duplicates = 0; let invalid = 0
    for (const r of list) {
      const body = typeof r?.body === 'string' ? r.body.trim() : ''
      const options = Array.isArray(r?.options) ? r.options : []
      const ok = r && typeof r === 'object' && SUBJECTS.includes(r.subject) && body.length >= 1 && body.length <= 1000 && options.length === 4 &&
        options.every((o) => typeof o === 'string' && o.trim().length >= 1 && o.trim().length <= 300) && Number.isInteger(r.answer) && r.answer >= 0 && r.answer <= 3 &&
        String(r.explanation || '').length <= 1000
      if (!ok) { invalid++; continue }
      if (allQuestions().some((x) => x.subject === r.subject && x.body === body)) { duplicates++; continue }
      db.qEdits.added.push({ id: db.qEdits.next++, subject: r.subject, body, options: options.map((o) => o.trim()), answer: r.answer, explanation: String(r.explanation || '').trim() || null, created_by: me() })
      inserted++
    }
    log('question.import', `${inserted} added, ${duplicates} duplicates skipped, ${invalid} invalid`)
    return { inserted, duplicates, invalid }
  },
  ticket_reply(a) {
    const m = ticketOf(a.p_id)
    const body = String(a.p_body || '').trim()
    if (!me() || body.length < 1 || body.length > 2000) throw new Error('message must be 1-2000 characters')
    const staff = isStaff()
    const who = profileOf(me())
    const nm = staff && who.is_teacher && !who.is_admin && (who.full_name || '').trim() ? who.full_name.trim().slice(0, 90) + ' (Teacher)' : null
    db.replies.push({ id: db.nextReply++, message_id: m.id, author: me(), is_staff: staff, body, author_name: nm, created_at: new Date().toISOString() })
    m.status = staff ? 'answered' : 'new'
    if (staff) {
      log('ticket.reply', '#' + m.id)
      if (m.user_id) notify(m.user_id, 'ticket', 'New reply on your ticket', (nm || 'JAMBwise support') + ': ' + body.slice(0, 200), '/app/help')
    } else if (m.assigned_to) notify(m.assigned_to, 'ticket', 'Student replied', (m.name || 'A student') + ' replied on ticket #' + m.id, '/app/admin/messages')
  },
  ticket_close(a) {
    const m = ticketOf(a.p_id)
    m.status = 'resolved'
    if (isStaff()) log('ticket.resolve', '#' + m.id)
  },
  admin_set_role(a) {
    adminOnly()
    if (a.target === me()) throw new Error('you cannot change your own role')
    const p = profileOf(a.target)
    Object.assign(p, { is_admin: Boolean(a.p_admin), is_teacher: false })
    log(a.p_admin ? 'admin.grant' : 'admin.revoke', p.reg_number)
  },
  admin_allow_retake(a) {
    adminOnly()
    const kind = a.p_kind || 'mock'
    if (!['mock', 'hall'].includes(kind)) throw new Error('unknown exam')
    db.attempts = db.attempts.filter((x) => !(x.user_id === a.target && x.kind === kind))
    db.events = db.events.filter((x) => !(x.user_id === a.target && x.kind === kind))
    log(kind + '.retake', profileOf(a.target).reg_number)
  },
  admin_reset_progress(a) {
    adminOnly()
    db.attempts = db.attempts.filter((x) => x.user_id !== a.target)
    log('student.reset', profileOf(a.target).reg_number)
  },
}

const fnError = (message, extra = {}) => ({ data: null, error: { message, context: { json: async () => ({ error: message, ...extra }) } } })

// A sum for the contact form, like the real contact-challenge function (demo only: the answer travels inside the token)
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const functions = {
  'contact-challenge'() {
    const a = 2 + Math.floor(Math.random() * 8)
    const b = 1 + Math.floor(Math.random() * 6)
    return { data: { question: `What is ${NUMS[a]} plus ${NUMS[b]}?`, token: btoa(JSON.stringify({ answer: a + b, iat: Date.now() })) }, error: null }
  },
  'contact-submit'(b) {
    if (b.website) return { data: { ok: true }, error: null }
    let t = null
    try { t = JSON.parse(atob(String(b.captchaToken || ''))) } catch { /* no token */ }
    const again = (m) => fnError(m, { captcha: true })
    if (!t || String(t.answer) !== String(b.captchaAnswer || '').trim()) return again('That answer is not right. Try the new question.')
    if (Date.now() - t.iat > 10 * 60 * 1000) return again('That check has expired. Try the new question.')
    if (Date.now() - t.iat < 3000) return again('That was quick! Take a moment and try again.')
    const r = { name: b.name || '', email: b.email || '', topic: b.topic || 'general', subject: b.subject, body: b.body || '', user_id: null }
    if (!validMessage(r) || r.topic === 'question') return fnError('Please check your details and try again.')
    if ((r.body.match(/https?:\/\//gi) || []).length > 2) return fnError('Please remove the extra links from your message.')
    const limited = messageLimit(r, 'demo-device')
    if (limited) return fnError(limited)
    addMessage(r, 'demo-device')
    save()
    return { data: { ok: true }, error: null }
  },
  'pin-activate'({ pin }) {
    const row = db.pins.find((p) => p.pin === pin)
    if (!row) return fnError('Invalid PIN')
    const email = pin.toLowerCase().replace('-', '') + '@pin.jambwise.ng'
    if (!row.used_by && !row.used_at) {
      const id = 'pin-' + pin
      db.users.push({ id, email, password: pin })
      db.profiles.push(newProfile(id, email, row.student_name || 'Student', {
        plan: row.plan, plan_expires: row.plan === 'free' ? null : daysAhead(row.days),
      }))
      Object.assign(row, { used_by: id, used_at: new Date().toISOString() })
      save()
    }
    return { data: { email }, error: null }
  },
  // Demo: there is no Paystack, so the payment "succeeds" straight away.
  'paystack-init'({ plan, coupon }) {
    const planRow = db.plans.find((x) => x.id === plan)
    if (!planRow || !planRow.price_kobo) return fnError('Unknown plan.')
    let amount = planRow.price_kobo
    let used = null
    if (coupon) {
      const q = rpcs.coupon_quote({ p_code: coupon, p_plan: plan })[0]
      if (!q.valid) return fnError(q.message)
      amount = q.final_kobo; used = (db.coupons || []).find((c) => c.id === q.coupon_id)
    }
    const p = profileOf(me())
    const reference = 'JWDEMO' + Math.random().toString(36).slice(2, 10).toUpperCase()
    const base = p.plan_expires && new Date(p.plan_expires) > new Date() ? new Date(p.plan_expires) : new Date()
    base.setDate(base.getDate() + 30)
    db.payments.push({ reference, user_id: p.id, plan, amount_kobo: amount, discount_kobo: planRow.price_kobo - amount, status: 'paid', paid_at: new Date().toISOString(), created_at: new Date().toISOString() })
    if (used) used.used_count += 1
    Object.assign(p, { plan, plan_expires: base.toISOString() })
    save()
    return { data: { url: `${location.origin}/app/billing?reference=${reference}`, reference }, error: null }
  },
  'parent-login'(b) {
    if (b.website) return fnError('The student ID and code do not match, or the student has switched parent access off. Check both and try again.')
    const reg = String(b.reg || '').trim().toUpperCase().slice(0, 30)
    const code = String(b.code || '').trim().toUpperCase()
    const name = String(b.name || '').trim().slice(0, 80)
    if (!reg || !code) return fnError('Enter the student ID and the parent code.')
    if (!name) return fnError('Please enter your name.')
    let t = null
    try { t = JSON.parse(atob(String(b.captchaToken || ''))) } catch { /* no token */ }
    const again = (m) => fnError(m, { captcha: true })
    if (!t || String(t.answer) !== String(b.captchaAnswer || '').trim()) return again('That answer is not right. Try the new question.')
    if (Date.now() - t.iat > 10 * 60 * 1000) return again('That check has expired. Try the new question.')
    if (Date.now() - t.iat < 3000) return again('That was quick! Take a moment and try again.')
    const rel = ['Mother', 'Father', 'Guardian'].includes(b.relationship) ? b.relationship : 'Other'
    const sp = db.profiles.find((p) => p.reg_number === reg && !p.is_admin && !p.is_teacher)
    const now = Date.now()
    const bad = db.parentLog.filter((l) => l.outcome !== 'ok')
    const fails = bad.filter((l) => l.reg_number === reg && now - new Date(l.created_at) < 15 * 6e4).length
    const ipFails = bad.filter((l) => l.ip === 'demo-device' && now - new Date(l.created_at) < 60 * 6e4).length
    const base = { student_id: sp?.id || null, reg_number: reg, parent_name: name, relationship: rel }
    if (fails >= 5 || ipFails >= 20) { parentLogRow({ ...base, outcome: 'locked' }); save(); return fnError('Too many tries. Please wait 15 minutes and try again.', { captcha: true }) }
    const c = sp && db.parentCodes[sp.id]
    const why = !sp ? 'bad_code' : !c ? 'off' : new Date(c.expires_at) <= new Date() ? 'expired' : c.code !== code ? 'bad_code' : null
    if (why) { parentLogRow({ ...base, outcome: why }); save(); return fnError('The student ID and code do not match, or the student has switched parent access off. Check both and try again.', { captcha: true }) }
    db.parentSessions = db.parentSessions.filter((x) => new Date(x.expires_at) > new Date())
    const token = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
    const expires_at = new Date(now + PARENT_MIN).toISOString()
    db.parentSessions.push({ token, student_id: sp.id, parent_name: name, expires_at })
    parentLogRow({ ...base, outcome: 'ok' })
    notify(sp.id, 'parent', 'A parent viewed your progress', `${name} (${rel}) signed in with your parent code.`, '/app/settings')
    const msg = `${name} (${rel}) viewed ${sp.full_name || 'a student'}'s progress (${sp.reg_number}).`
    db.profiles.filter((p) => p.is_admin).forEach((adm) => {
      if (!db.notifications.some((x) => x.user_id === adm.id && x.kind === 'parent' && x.body === msg && Date.now() - new Date(x.created_at).getTime() < 30 * 60000)) notify(adm.id, 'parent', 'A parent signed in', msg, '/app/admin/parents')
    })
    save()
    return { data: { ok: true, token, expires_at }, error: null }
  },
  'parent-report'({ token, end }) {
    if (end) { db.parentSessions = db.parentSessions.filter((x) => x.token !== token); save(); return { data: { ok: true }, error: null } }
    const s = db.parentSessions.find((x) => x.token === token && new Date(x.expires_at) > new Date())
    if (!s) return fnError('Your session has ended. Please sign in again.', { ended: true })
    const pr = profileOf(s.student_id)
    if (!pr) return fnError('Your session has ended. Please sign in again.', { ended: true })
    const mine = db.attempts.filter((a) => a.user_id === pr.id)
    const non = mine.filter((a) => a.kind !== 'hall')
    const bySub = new Map()
    non.forEach((a) => { const r = bySub.get(a.subject) || { subject: a.subject, sessions: 0, total: 0, correct: 0 }; r.sessions++; r.total += a.total; r.correct += a.correct; bySub.set(a.subject, r) })
    const subjects = [...bySub.values()].map((r) => ({ ...r, pct: Math.round((100 * r.correct) / r.total) })).sort((a, b) => a.pct - b.pct || a.subject.localeCompare(b.subject))
    const byDate = (a, b) => String(b.created_at).localeCompare(String(a.created_at))
    const days = [...new Set(mine.filter((a) => Date.now() - new Date(a.created_at) < 60 * 864e5).map((a) => new Date(a.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })))].sort().reverse()
    return { data: { report: {
      student: { name: pr.full_name, reg_number: pr.reg_number, plan: pr.plan, plan_expires: pr.plan_expires, course: pr.course || null, school: pr.school || null, exam_date: pr.exam_date, joined: pr.created_at, suspended: pr.suspended },
      parent: s.parent_name, expires_at: s.expires_at, subjects,
      mocks: mine.filter((a) => a.kind === 'mock' && a.mock_score != null).sort(byDate).map((a) => ({ date: a.created_at, score: a.mock_score })),
      hall: examResultFor(pr.id, 'hall'),
      recent: non.slice().sort(byDate).slice(0, 12).map((a) => ({ created_at: a.created_at, kind: a.kind, subject: a.subject, correct: a.correct, total: a.total })),
      days,
    } }, error: null }
  },
  'admin-create-user'(b) {
    if (!isAdmin()) return fnError('Not allowed')
    const email = String(b.email || '').trim().toLowerCase()
    const name = String(b.name || '').trim().slice(0, 100)
    const role = b.role === 'teacher' ? 'teacher' : 'student'
    const plan = ['free', 'student', 'pro'].includes(b.plan) ? b.plan : 'free'
    if (!name) return fnError('Enter a full name.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith('@pin.jambwise.ng')) return fnError('Enter a valid email address.')
    const password = String(b.password || '')
    if (password.length < 8 || password.length > 72) return fnError('The password must be 8 to 72 characters.')
    if (db.users.some((u) => u.email === email)) return fnError('An account with this email already exists.')
    const id = 'user-' + Math.random().toString(36).slice(2, 10)
    const nums = db.profiles.map((p) => Number(String(p.reg_number).split('-').pop()) || 0)
    const extra = { course: String(b.course || '').slice(0, 100) || null, school: String(b.school || '').slice(0, 100) || null, reg_number: 'JW-2026-' + String(Math.max(0, ...nums) + 1).padStart(6, '0') }
    if (role === 'teacher') extra.is_teacher = true
    else if (plan !== 'free') Object.assign(extra, { plan, plan_expires: daysAhead(Math.max(1, Math.min(Number(b.days) || 30, 3650))) })
    db.users.push({ id, email, password })
    db.profiles.push(newProfile(id, email, name, extra))
    log(role + '.create', extra.reg_number)
    save()
    return { data: { ok: true, id, reg_number: extra.reg_number }, error: null }
  },
  'admin-set-password'({ target, password }) {
    if (!isAdmin()) return fnError('Not allowed')
    const p = profileOf(target)
    if (!p) return fnError('Account not found.')
    if (p.is_admin && target !== me()) return fnError('You cannot change another admin\u2019s password.')
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) return fnError('The password must be 8 to 72 characters.')
    db.users.find((u) => u.id === target).password = password
    log('password.reset', p.reg_number)
    save()
    return { data: { ok: true }, error: null }
  },
  'admin-delete-user'({ target }) {
    if (!isAdmin()) return fnError('Not allowed')
    if (target === me()) return fnError('You cannot delete your own account here.')
    const p = profileOf(target)
    if (!p) return fnError('Student not found.')
    log('student.delete', p.reg_number)
    db.profiles = db.profiles.filter((x) => x.id !== target)
    db.users = db.users.filter((x) => x.id !== target)
    db.attempts = db.attempts.filter((x) => x.user_id !== target)
    db.events = db.events.filter((x) => x.user_id !== target)
    db.notifications = db.notifications.filter((x) => x.user_id !== target)
    delete db.parentCodes[target]; db.parentSessions = db.parentSessions.filter((x) => x.student_id !== target)
    db.staffChat = db.staffChat.filter((x) => x.teacher_id !== target && x.sender_id !== target)
    save()
    return { data: { ok: true }, error: null }
  },
  'delete-account'() {
    const id = me()
    db.profiles = db.profiles.filter((p) => p.id !== id)
    db.users = db.users.filter((u) => u.id !== id)
    db.attempts = db.attempts.filter((a) => a.user_id !== id)
    db.events = db.events.filter((e) => e.user_id !== id)
    save()
    setSession(null, 'SIGNED_OUT')
    return { data: { ok: true }, error: null }
  },
}

export const demoClient = {
  auth: {
    async getSession() { return { data: { session } } },
    onAuthStateChange(cb) {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    },
    async signInWithPassword({ email, password }) {
      await wait()
      const u = db.users.find((x) => x.email === email && x.password === password)
      if (!u) return { error: { message: 'Invalid login credentials' } }
      setSession({ user: { id: u.id, email: u.email } }, 'SIGNED_IN')
      return { data: {}, error: null }
    },
    async signUp({ email, password, options }) {
      await wait()
      if (db.users.some((u) => u.email === email)) return { error: { message: 'User already registered' } }
      const id = 'user-' + Math.random().toString(36).slice(2, 10)
      db.users.push({ id, email, password })
      db.profiles.push(newProfile(id, email, options?.data?.full_name || 'Student'))
      save()
      setSession({ user: { id, email } }, 'SIGNED_IN')
      return { data: { session }, error: null }
    },
    // Demo stand-in for "Continue with Google": signs in (or creates) a pretend Google account.
    async signInWithOAuth({ provider }) {
      await wait()
      if (provider !== 'google') return { error: { message: 'Unsupported provider' } }
      const email = 'google.demo@gmail.com'
      let u = db.users.find((x) => x.email === email)
      if (!u) {
        u = { id: 'user-google-demo', email, password: null }
        db.users.push(u)
        db.profiles.push(newProfile(u.id, email, 'Google Demo'))
        save()
      }
      setSession({ user: { id: u.id, email } }, 'SIGNED_IN')
      return { data: {}, error: null }
    },
    async signOut() { setSession(null, 'SIGNED_OUT'); return {} },
    async resetPasswordForEmail() { await wait(); return { error: null } },
    async updateUser({ password }) {
      await wait()
      const u = db.users.find((x) => x.id === me())
      if (!u) return { error: { message: 'Not logged in' } }
      u.password = password
      save()
      return { error: null }
    },
  },
  from,
  async rpc(name, args) {
    await wait()
    if (offline()) return { data: null, error: { message: 'Failed to fetch' } }
    try {
      const data = rpcs[name](args)
      save()
      return { data, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message } }
    }
  },
  functions: {
    async invoke(name, { body }) {
      await wait()
      if (offline()) return fnError('Failed to fetch')
      const fn = functions[name]
      return fn ? fn(body || {}) : fnError('Unknown function')
    },
  },
}
