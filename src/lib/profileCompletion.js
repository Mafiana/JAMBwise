/** How much of the student's profile is filled in, out of 100: name, photo, course, target university (20 each) and the 3 subjects (20, in thirds). */
export function profileCompletion(f) {
  const has = (v) => Boolean(String(v || '').trim())
  const parts = [
    ['Full name', has(f.full_name) ? 20 : 0],
    ['Photo', f.avatar ? 20 : 0],
    ['Course', has(f.course) ? 20 : 0],
    ['Target university', has(f.school) ? 20 : 0],
    ['Subjects', Math.round((Math.min((f.subjects || []).length, 3) / 3) * 20)],
  ]
  return { pct: parts.reduce((a, [, n]) => a + n, 0), missing: parts.filter(([, n]) => n < 20).map(([k]) => k) }
}

