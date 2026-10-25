// The parent's progress report as a PDF (A4 portrait, no libraries). It carries the real date and time it was downloaded.
// Text is written in the PDF "WinAnsi" alphabet, like the Scoresheet PDF (see pdf.js).
import { fit, textWidth, toLatin } from './pdf.js'

const W = 595, H = 842, M = 42
const GREEN = '0.04 0.37 0.22', INK = '0.1 0.1 0.1', MUT = '0.4 0.4 0.4'
const n2 = (n) => Number(n.toFixed(2))
const esc = (s) => s.replace(/[\\()]/g, '\\$&')

/** "25 October 2026, 6:52:10 AM WAT": the person's own clock and zone, so the date and time are the real ones. */
export function stamp(now = new Date()) {
  const d = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
  const t = now.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  let zone = ''
  try { zone = new Intl.DateTimeFormat('en-NG', { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || '' } catch { /* no zone name */ }
  return `${d}, ${t}${zone ? ' ' + zone : ''}`
}

/** File-name friendly: 2026-10-25-0652 */
export function stampForFile(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
}

/** Breaks text into lines no wider than `max` points. */
function wrap(s, max, size, bold = false) {
  const words = toLatin(s).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? line + ' ' + w : w
    if (textWidth(next, size, bold) <= max) line = next
    else { if (line) lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/**
 * report: { student: {name, reg_number, course, school, plan, exam_date}, parent, stats: [{value,label}], attention, subjects: [{name,pct,detail}],
 *           activity, mocks: [{when,score}], hall: {title, lines[]} | null, recent: [[when,type,subject,score]...] }
 */
export function buildParentReportPdf(report, now = new Date()) {
  const when = stamp(now)
  const pages = []
  let o = null, y = 0
  const newPage = () => { o = []; pages.push(o); y = H - M }
  const text = (x, yy, s, size = 10, bold = false, rgb = INK) => o.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb} rg ${n2(x)} ${n2(yy)} Td (${esc(toLatin(s))}) Tj ET`)
  const need = (h) => { if (y - h < M + 30) newPage() }
  const heading = (s) => { need(40); y -= 18; text(M, y - 12, s, 12.5, true, GREEN); y -= 18; o.push(`${GREEN} RG 0.8 w ${M} ${n2(y - 3)} m ${W - M} ${n2(y - 3)} l S`); y -= 10 }
  const para = (s, size = 9.5, rgb = MUT) => { for (const l of wrap(s, W - 2 * M, size)) { need(size + 5); y -= size + 4; text(M, y, l, size, false, rgb) } }

  newPage()
  // header band
  o.push(`${GREEN} rg 0 ${H - 92} ${W} 92 re f`)
  text(M, H - 40, 'JAMBwise', 22, true, '1 1 1')
  text(M, H - 60, 'Student progress report', 12, false, '0.85 0.95 0.9')
  text(M, H - 78, 'Downloaded ' + when, 9.5, false, '0.85 0.95 0.9')
  y = H - 92 - 22

  const s = report.student
  text(M, y, s.name, 17, true)
  y -= 16
  text(M, y, [s.reg_number, s.course, s.school].filter(Boolean).join('   |   '), 9.5, false, MUT)
  y -= 14
  text(M, y, `Plan: ${s.plan}${s.exam_date ? '   |   Exam date: ' + s.exam_date : ''}   |   Viewed by: ${report.parent}`, 9.5, false, MUT)
  y -= 18

  // stat boxes
  const bw = (W - 2 * M - 3 * 10) / 4
  report.stats.forEach((st, i) => {
    const x = M + i * (bw + 10)
    o.push(`0.94 0.97 0.95 rg ${n2(x)} ${n2(y - 52)} ${n2(bw)} 52 re f`)
    text(x + 10, y - 26, String(st.value), 19, true, GREEN)
    text(x + 10, y - 42, fit(st.label, bw - 16, 8.5), 8.5, false, MUT)
  })
  y -= 62

  if (report.attention) { heading('Needs attention'); para(report.attention, 10, INK) }

  heading('Practice by subject')
  if (!report.subjects.length) para('No practice yet.')
  for (const r of report.subjects) {
    need(22); y -= 18
    text(M, y, fit(r.name, 170, 10), 10)
    o.push(`0.88 0.91 0.89 rg ${M + 180} ${n2(y - 1)} 200 8 re f`)
    o.push(`${r.pct >= 75 ? '0.1 0.6 0.35' : r.pct >= 55 ? '0.85 0.65 0.1' : '0.8 0.25 0.2'} rg ${M + 180} ${n2(y - 1)} ${n2(2 * r.pct)} 8 re f`)
    text(M + 392, y, `${r.pct}%`, 10, true)
    text(M + 428, y, fit(r.detail, W - M - (M + 428), 8), 8, false, MUT)
  }

  heading('Activity')
  para(report.activity, 10, INK)

  heading('Mock exams')
  if (!report.mocks.length) para('No CBT mock yet.')
  for (const m of report.mocks) { need(18); y -= 16; text(M, y, m.when, 10); text(W - M - textWidth(`${m.score} / 400`, 10, true), y, `${m.score} / 400`, 10, true) }

  if (report.hall) {
    heading(report.hall.title)
    for (const l of report.hall.lines) para(l, 10, INK)
  }

  heading('Recent sessions')
  if (!report.recent.length) para('Nothing yet.')
  else {
    const cols = [{ l: 'When', w: 170 }, { l: 'Type', w: 90 }, { l: 'Subject', w: 150 }, { l: 'Score', w: 101 }]
    const head = () => {
      need(40); y -= 4
      o.push(`${GREEN} rg ${M} ${n2(y - 20)} ${W - 2 * M} 20 re f`)
      let x = M
      for (const c of cols) { text(x + 6, y - 14, c.l, 9, true, '1 1 1'); x += c.w }
      y -= 20
    }
    head()
    report.recent.forEach((r, i) => {
      if (y - 20 < M + 30) { newPage(); head() }
      if (i % 2) o.push(`0.94 0.97 0.95 rg ${M} ${n2(y - 18)} ${W - 2 * M} 18 re f`)
      let x = M
      cols.forEach((c, k) => { text(x + 6, y - 13, fit(r[k], c.w - 12, 9), 9); x += c.w })
      y -= 18
    })
  }

  y -= 8
  para(`${s.name} can switch parent access off at any time in Settings. This report is read-only and shows the situation at the moment it was downloaded (${when}). JAMBwise is an independent practice platform and is not affiliated with JAMB.`, 8.5)

  const total = pages.length
  pages.forEach((p, i) => {
    o = p
    text(M, M - 10, 'JAMBwise parent report | Downloaded ' + when, 8, false, '0.5 0.5 0.5')
    const label = `Page ${i + 1} of ${total}`
    text(W - M - textWidth(label, 8), M - 10, label, 8, false, '0.5 0.5 0.5')
  })

  const content = pages.map((p) => p.join('\n'))
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${content.map((_, k) => `${5 + k * 2} 0 R`).join(' ')}] /Count ${total} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  content.forEach((c, k) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + k * 2} 0 R >>`)
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((b, k) => { offsets.push(out.length); out += `${k + 1} 0 obj\n${b}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((x) => String(x).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 0xff
  return bytes
}
