// Pure helpers behind the My Progress page (levels, activity grid, achievements, radar chart). Kept free of React so they can be tested.
import { dayKey } from './utils.js'

export const LEVELS = [
  { name: 'Rookie', from: 0 },
  { name: 'Explorer', from: 50 },
  { name: 'Scholar', from: 200 },
  { name: 'Champion', from: 500 },
  { name: 'Legend', from: 1000 },
]

/** The student's level from the questions answered, and how far they are to the next one. */
export function levelFor(total) {
  let i = 0
  LEVELS.forEach((l, n) => { if (total >= l.from) i = n })
  const cur = LEVELS[i]
  const next = LEVELS[i + 1] || null
  return {
    name: cur.name, index: i, next: next ? next.name : null,
    toNext: next ? next.from - total : 0,
    pct: next ? Math.round(((total - cur.from) / (next.from - cur.from)) * 100) : 100,
  }
}

/** A Monday-first grid of the last `weeks` weeks: { weeks: [[cell x7] ...], max }, each cell { date, count, future }. */
export function activityGrid(timestamps, weeks = 12, now = new Date()) {
  const counts = new Map()
  timestamps.forEach((t) => { const k = dayKey(t); counts.set(k, (counts.get(k) || 0) + 1) })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = (today.getDay() + 6) % 7                       // Monday = 0
  const start = new Date(today)
  start.setDate(start.getDate() - dow - (weeks - 1) * 7)
  const cols = []
  let max = 0
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setDate(start.getDate() + w * 7 + d)
      const key = dayKey(day)
      const count = counts.get(key) || 0
      max = Math.max(max, count)
      col.push({ date: key, count, future: day > today })
    }
    cols.push(col)
  }
  return { weeks: cols, max }
}

/** 0 (none) to 4 (busiest) for the colour of a day. */
export const heat = (count, max) => (count <= 0 ? 0 : max <= 1 ? 4 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4))))

/** Achievements with whether each is earned and how close the student is. */
export function badges({ total, accuracy, streakDays, mocks, bestMock, subjectsTried, sessions }) {
  const b = (id, title, text, got, have, need) => ({ id, title, text, earned: got, progress: Math.min(1, need ? have / need : 0), hint: `${Math.min(have, need)} / ${need}` })
  return [
    b('first', 'First steps', 'Finish a practice session', sessions >= 1, sessions, 1),
    b('century', 'Century', 'Answer 100 questions', total >= 100, total, 100),
    b('sharp', 'Sharpshooter', '80% accuracy over 50+ questions', total >= 50 && accuracy >= 80, total >= 50 ? accuracy : Math.round((total / 50) * 80), 80),
    b('fire', 'On fire', 'Practise 3 days in a row', streakDays >= 3, streakDays, 3),
    b('week', 'Week warrior', 'Practise 7 days in a row', streakDays >= 7, streakDays, 7),
    b('all', 'All-rounder', 'Practise 5 different subjects', subjectsTried >= 5, subjectsTried, 5),
    b('mock', 'Exam ready', 'Finish a CBT Mock', mocks >= 1, mocks, 1),
    b('top', 'Top scorer', 'Score 250+ in a CBT Mock', bestMock != null && bestMock >= 250, bestMock || 0, 250),
  ]
}

/** Points of a radar chart: one per value (0 to 100), starting at the top and going clockwise. */
export function radarPoints(values, radius, cx, cy) {
  const n = values.length
  return values.map((v, i) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
    const r = (Math.max(0, Math.min(100, v)) / 100) * radius
    return { x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy + r * Math.sin(a)).toFixed(2), a }
  })
}

/** A short word for how a subject is going. */
export const standing = (pct) => (pct >= 75 ? 'Strong' : pct >= 55 ? 'Getting there' : 'Needs work')
