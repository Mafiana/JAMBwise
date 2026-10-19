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

import { DB_KEY, DEMO_ADMIN, DEMO_PIN, DEMO_STUDENT, SESSION_KEY } from './accounts.js'

const SUBJECTS = ['eng', 'mat', 'phy', 'chm', 'bio', 'gov', 'eco', 'com', 'agr']
const PROFILE_EDITABLE = ['full_name', 'course', 'school', 'avatar', 'subjects', 'exam_date', 'study_hours']

let nextQuestion = 1
const questions = Object.entries({ eng, mat, phy, chm, bio, gov, eco, com, agr }).flatMap(([subject, list]) =>
  list.map((q) => ({ id: nextQuestion++, subject, body: q.q, options: q.o, answer: q.a, explanation: q.e })),
)

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString()
const daysAhead = (n) => new Date(Date.now() + n * 864e5).toISOString()

function newProfile(id, email, name, extra = {}) {
  return {
    id, email, full_name: name, reg_number: `JW-2026-${String(100000 + Math.floor(Math.random() * 900000))}`,
    course: '', school: '', avatar: null, plan: 'free', plan_expires: null, subjects: ['mat', 'phy', 'chm'],
    exam_date: null, study_hours: 3, is_admin: false, suspended: false, created_at: new Date().toISOString(), ...extra,
  }
}

function seed() {
  const users = [
    { id: 'demo-admin', ...DEMO_ADMIN },
    { id: 'demo-student', ...DEMO_STUDENT },
    { id: 'demo-ngozi', email: 'ngozi@demo.com', password: 'demo1234' },
    { id: 'demo-tunde', email: 'tunde@demo.com', password: 'demo1234' },
  ]
  const profiles = [
    newProfile('demo-admin', DEMO_ADMIN.email, 'Demo Admin', { is_admin: true, plan: 'pro', reg_number: 'JW-2026-000001', created_at: daysAgo(40) }),
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
    nextMessage: 4,
    audit: [{ id: 1, actor_email: DEMO_ADMIN.email, action: 'pin.create', detail: DEMO_PIN + ' (student, 30 days)', created_at: daysAgo(1) }],
    nextAudit: 2,
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
let session = read(SESSION_KEY)
const listeners = new Set()
const save = () => write(DB_KEY, db)
const setSession = (s, event) => { session = s; write(SESSION_KEY, s); listeners.forEach((f) => f(event, s)) }

// ── rules (same as supabase/schema.sql) ──
const me = () => session?.user?.id
const profileOf = (id) => db.profiles.find((p) => p.id === id)
const isAdmin = () => Boolean(profileOf(me())?.is_admin)
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

const MSG_TOPICS = ['general', 'payment', 'pin', 'bug', 'question', 'other']
const EMAIL = /^[^@\s]+@[^@\s]+$/
const HOUR = 36e5
const DAY = 24 * HOUR
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false   // lets the offline features be tried in demo mode

const validMessage = (r) =>
  Boolean(r.name?.trim()) && r.name.length <= 100 && EMAIL.test(r.email || '') && r.email.length <= 200 &&
  MSG_TOPICS.includes(r.topic || 'general') && (!r.subject || r.subject.length <= 120) && (r.body || '').length >= 5 && r.body.length <= 2000

/** The same spam limits as the database trigger in supabase/schema.sql. Returns a message when the sender must wait, else ''. */
function messageLimit(r, abuseKey) {
  if (isAdmin()) return ''
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
    const open = name === 'plans'   // anonymous visitors may read prices; they cannot write anything (the contact form goes through an Edge Function)
    if (!uid && !open) return err('JWT expired')
    let list = (tableRows(name) || []).slice()
    if (name === 'questions') list = list.filter((x) => hasAccess(x.subject) || isAdmin())
    if (name === 'profiles') list = list.filter((x) => x.id === uid || isAdmin())
    if (name === 'attempts') list = list.filter((x) => isAdmin() || (x.user_id === uid && x.kind === 'practice'))   // mock scores are admin-only
    if (name === 'access_pins' || name === 'audit_log') list = isAdmin() ? list : []
    if (name === 'messages') list = list.filter((x) => isAdmin() || (x.user_id && x.user_id === uid))
    if (name === 'message_replies') list = list.filter((x) => isAdmin() || db.messages.some((m) => m.id === x.message_id && m.user_id === uid))
    if (name === 'payments') list = list.filter((x) => x.user_id === uid || isAdmin())
    for (const [c, v] of q.filters) list = list.filter((x) => x[c] === v)
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
        if (keys.some((k) => k !== 'status') || !isAdmin()) return err('permission denied')
        if (!['new', 'read', 'answered', 'resolved'].includes(q.patch.status)) return err('invalid status')
      } else if (name === 'questions') {
        if (!isAdmin()) return err('permission denied')
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
        let scored = db.attempts.some((x) => x.user_id === uid && x.kind === 'mock' && x.mock_score != null)
        for (const r of rows) {
          const ok = r.user_id === uid && !p.suspended && SUBJECTS.includes(r.subject) && hasAccess(r.subject) &&
            (r.kind === 'practice' || isPaid(p)) && r.correct >= 0 && r.correct <= r.total && r.total >= 1 && r.total <= 200
          if (!ok) return err('new row violates row-level security policy')
          // one CBT mock per student, like the database trigger
          if (r.kind === 'mock' && r.mock_score != null) {
            if (scored) return err('mock_already_taken: You have already submitted your CBT mock.')
            scored = true
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
        if (!isAdmin()) return err('permission denied')
        const out = []
        for (const r of rows) {
          if (!validQuestion(r)) return err('invalid question')
          if (allQuestions().some((x) => x.subject === r.subject && x.body === r.body)) return err('duplicate key value violates unique constraint')
          const row = { id: db.qEdits.next++, subject: r.subject, body: r.body, options: r.options, answer: r.answer, explanation: r.explanation || null }
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

const adminOnly = () => { if (!isAdmin()) throw new Error('not allowed') }
const ticketOf = (id) => {
  const m = db.messages.find((x) => x.id === id)
  if (!m || (!isAdmin() && m.user_id !== me())) throw new Error('not allowed')
  return m
}
const randomPin = () => {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = () => Array.from({ length: 4 }, () => al[Math.floor(Math.random() * al.length)]).join('')
  let pin
  do pin = part() + '-' + part(); while (db.pins.some((x) => x.pin === pin))
  return pin
}
const rpcs = {
  my_mock_status() {
    const rows = db.attempts.filter((x) => x.user_id === me() && x.kind === 'mock' && x.mock_score != null)
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
  admin_students() {
    adminOnly()
    return db.profiles.map((p) => {
      const at = db.attempts.filter((a) => a.user_id === p.id)
      const last = at.map((a) => a.created_at).sort().pop() || null
      return { ...p, questions: at.reduce((n, a) => n + a.total, 0), correct: at.reduce((n, a) => n + a.correct, 0), mocks: at.filter((a) => a.mock_score != null).length, last_active: last }
    }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
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
    adminOnly()
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
      db.qEdits.added.push({ id: db.qEdits.next++, subject: r.subject, body, options: options.map((o) => o.trim()), answer: r.answer, explanation: String(r.explanation || '').trim() || null })
      inserted++
    }
    log('question.import', `${inserted} added, ${duplicates} duplicates skipped, ${invalid} invalid`)
    return { inserted, duplicates, invalid }
  },
  ticket_reply(a) {
    const m = ticketOf(a.p_id)
    const body = String(a.p_body || '').trim()
    if (!me() || body.length < 1 || body.length > 2000) throw new Error('message must be 1-2000 characters')
    const staff = isAdmin()
    db.replies.push({ id: db.nextReply++, message_id: m.id, author: me(), is_staff: staff, body, created_at: new Date().toISOString() })
    m.status = staff ? 'answered' : 'new'
    if (staff) log('ticket.reply', '#' + m.id)
  },
  ticket_close(a) {
    const m = ticketOf(a.p_id)
    m.status = 'resolved'
    if (isAdmin()) log('ticket.resolve', '#' + m.id)
  },
  admin_set_role(a) {
    adminOnly()
    if (a.target === me()) throw new Error('you cannot change your own role')
    const p = profileOf(a.target)
    p.is_admin = Boolean(a.p_admin)
    log(a.p_admin ? 'admin.grant' : 'admin.revoke', p.reg_number)
  },
  admin_allow_retake(a) {
    adminOnly()
    db.attempts = db.attempts.filter((x) => !(x.user_id === a.target && x.kind === 'mock'))
    log('mock.retake', profileOf(a.target).reg_number)
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
  'paystack-init'({ plan }) {
    const planRow = db.plans.find((x) => x.id === plan)
    if (!planRow || !planRow.price_kobo) return fnError('Unknown plan.')
    const p = profileOf(me())
    const reference = 'JWDEMO' + Math.random().toString(36).slice(2, 10).toUpperCase()
    const base = p.plan_expires && new Date(p.plan_expires) > new Date() ? new Date(p.plan_expires) : new Date()
    base.setDate(base.getDate() + 30)
    db.payments.push({ reference, user_id: p.id, plan, amount_kobo: planRow.price_kobo, status: 'paid', paid_at: new Date().toISOString(), created_at: new Date().toISOString() })
    Object.assign(p, { plan, plan_expires: base.toISOString() })
    save()
    return { data: { url: `${location.origin}/app/billing?reference=${reference}`, reference }, error: null }
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
    save()
    return { data: { ok: true }, error: null }
  },
  'delete-account'() {
    const id = me()
    db.profiles = db.profiles.filter((p) => p.id !== id)
    db.users = db.users.filter((u) => u.id !== id)
    db.attempts = db.attempts.filter((a) => a.user_id !== id)
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
