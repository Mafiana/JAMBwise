// The student's ExamHall result slip as a PDF (A4 portrait, no libraries). It is a JAMBwise practice slip: it carries
// the JAMBwise name and says plainly that it is not an official JAMB result.
import { fit, textWidth, toLatin } from './pdf.js'
import { stamp } from './reportPdf.js'

const W = 595, H = 842, M = 46
const GREEN = '0.04 0.37 0.22', INK = '0.1 0.1 0.1', MUT = '0.4 0.4 0.4', SOFT = '0.94 0.97 0.95'
const n2 = (n) => Number(n.toFixed(2))
const esc = (s) => s.replace(/[\\()]/g, '\\$&')

/** Reads a JPEG data: URL into { bin (latin1 string of the file), w, h, comps }, or null for anything else. */
export function readJpeg(dataUrl) {
  const m = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return null
  let bin
  try { bin = atob(m[1]) } catch { return null }
  if (bin.charCodeAt(0) !== 0xff || bin.charCodeAt(1) !== 0xd8) return null
  let i = 2
  while (i + 9 < bin.length) {
    if (bin.charCodeAt(i) !== 0xff) { i++; continue }
    const mk = bin.charCodeAt(i + 1)
    if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) {
      const h = (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6)
      const w = (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8)
      const comps = bin.charCodeAt(i + 9)
      return w && h && (comps === 1 || comps === 3) ? { bin, w, h, comps } : null
    }
    if (mk === 0xd8 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01 || mk === 0xff) { i += mk === 0xff ? 1 : 2; continue }
    i += 2 + ((bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3))
  }
  return null
}

/** Each subject is out of 100 (percent correct), so four subjects give a total out of 400. */
export const subjectScore = (s) => (s.total ? Math.round((s.correct / s.total) * 100) : 0)

/**
 * slip: { name, reg_number, course, school, exam: 'ExamHall', date, total, subjects: [{ name, correct, total }], photo?: JPEG data: URL }
 * Returns the PDF as a Uint8Array.
 */
export function buildResultSlipPdf(slip, now = new Date()) {
  const o = []
  const text = (x, y, s, size = 10, bold = false, rgb = INK) => o.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb} rg ${n2(x)} ${n2(y)} Td (${esc(toLatin(s))}) Tj ET`)
  const rule = (y, rgb = GREEN, w = 0.8) => o.push(`${rgb} RG ${w} w ${M} ${n2(y)} m ${W - M} ${n2(y)} l S`)
  const when = stamp(now)

  // header band
  o.push(`${GREEN} rg 0 ${H - 96} ${W} 96 re f`)
  text(M, H - 44, 'JAMBwise', 24, true, '1 1 1')
  text(M, H - 64, `${slip.exam || 'ExamHall'} Result Slip`, 13, false, '0.85 0.95 0.9')
  text(M, H - 82, 'Practice exam on JAMBwise (not an official JAMB result)', 9.5, false, '0.85 0.95 0.9')
  const dp = 'Date printed: ' + new Date(now).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  text(W - M - textWidth(dp, 9, false), H - 44, dp, 9, false, '0.85 0.95 0.9')

  let y = H - 96 - 34
  text(M, y, 'Candidate details', 13, true, GREEN)
  rule(y - 6)
  y -= 28
  const details = [
    ['Name', slip.name], ['JAMBwise number', slip.reg_number], ['Exam', slip.exam || 'ExamHall'],
    ['Date written', slip.date], ['Course of study', slip.course || 'Not given'], ['Target university', slip.school || 'Not given'],
  ]
  // the candidate's passport-style portrait sits at the right of the details (66 x 82 points); a plain frame if there is no photo
  const jpg = readJpeg(slip.photo)
  const PW = 66, PH = 82, px = W - M - PW, pTop = y + 12, py = pTop - PH
  if (jpg) {
    const k = Math.max(PW / jpg.w, PH / jpg.h), iw = jpg.w * k, ih = jpg.h * k
    o.push(`q ${n2(px)} ${n2(py)} ${PW} ${PH} re W n ${n2(iw)} 0 0 ${n2(ih)} ${n2(px - (iw - PW) / 2)} ${n2(pTop - ih)} cm /Im1 Do Q`)
  } else {
    o.push(`${SOFT} rg ${n2(px)} ${n2(py)} ${PW} ${PH} re f`)
    text(px + (PW - textWidth('No photo', 9)) / 2, py + PH / 2 - 3, 'No photo', 9, false, MUT)
  }
  o.push(`${GREEN} RG 1 w ${n2(px)} ${n2(py)} ${PW} ${PH} re S`)
  details.forEach(([k, v]) => {
    text(M, y, k.toUpperCase(), 8.5, true, MUT)
    text(M + 140, y, fit(v || '-', W - 2 * M - 140 - PW - 14, 11, true), 11, true)
    y -= 22
  })
  y = Math.min(y, py - 6)

  y -= 10
  text(M, y, 'Subjects and scores', 13, true, GREEN)
  rule(y - 6)
  y -= 14
  o.push(`${GREEN} rg ${M} ${n2(y - 22)} ${W - 2 * M} 22 re f`)
  text(M + 10, y - 15, 'SUBJECT', 9.5, true, '1 1 1')
  text(M + 290, y - 15, 'CORRECT', 9.5, true, '1 1 1')
  text(W - M - 10 - textWidth('SCORE (OF 100)', 9.5, true), y - 15, 'SCORE (OF 100)', 9.5, true, '1 1 1')
  y -= 22
  slip.subjects.forEach((s, i) => {
    if (i % 2 === 0) o.push(`${SOFT} rg ${M} ${n2(y - 24)} ${W - 2 * M} 24 re f`)
    text(M + 10, y - 16, fit(s.name, 260, 11), 11)
    text(M + 290, y - 16, `${s.correct} of ${s.total}`, 11)
    const sc = String(subjectScore(s))
    text(W - M - 10 - textWidth(sc, 12, true), y - 16, sc, 12, true)
    y -= 24
  })
  rule(y, INK, 0.6)
  y -= 8
  o.push(`${SOFT} rg ${M} ${n2(y - 34)} ${W - 2 * M} 34 re f`)
  text(M + 10, y - 22, 'TOTAL SCORE (OUT OF 400)', 11, true)
  const tot = String(slip.total)
  text(W - M - 10 - textWidth(tot, 20, true), y - 24, tot, 20, true, GREEN)
  y -= 58

  const notes = [
    '1. This is a JAMBwise practice result. JAMBwise is an independent platform and is not affiliated with, or endorsed by, JAMB.',
    '2. It is not an official UTME result and cannot be used for admission, employment or any official purpose.',
    '3. Each subject is scored out of 100 (percentage of questions answered correctly). Four subjects give a score out of 400.',
    '4. ' + `Printed on ${when}.`,
  ]
  notes.forEach((n) => {
    // wrap each note to the page width
    let line = ''
    const lines = []
    for (const w of toLatin(n).split(/\s+/)) {
      const nx = line ? line + ' ' + w : w
      if (textWidth(nx, 8.5) <= W - 2 * M) line = nx
      else { lines.push(line); line = w }
    }
    lines.push(line)
    lines.forEach((l) => { text(M, y, l, 8.5, false, MUT); y -= 12 })
  })

  return assemble(o, jpg)
}

/**
 * The CBT Mock result: a plain centred slip (no photo), like a mock exam printout.
 * slip: { name, reg_number, email, exam: 'CBT Mock', when (date and time text), total, subjects: [{ name, correct, total }] }
 */
export function buildMockSlipPdf(slip, now = new Date()) {
  const o = []
  const text = (x, yy, s, size = 10, bold = false, rgb = INK) => o.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb} rg ${n2(x)} ${n2(yy)} Td (${esc(toLatin(s))}) Tj ET`)
  const center = (yy, s, size, bold = false, rgb = INK) => text((W - textWidth(toLatin(s), size, bold)) / 2, yy, s, size, bold, rgb)
  const when = stamp(now)
  o.push(`${GREEN} rg 0 ${H - 70} ${W} 70 re f`)
  center(H - 34, 'JAMBwise', 22, true, '1 1 1')
  center(H - 54, 'Practice platform. Not an official JAMB result.', 9.5, false, '0.85 0.95 0.9')
  let y = H - 70 - 50
  center(y, 'CBT Mock Results', 24, true, GREEN)
  y -= 40
  const rows = [['Name', slip.name], ['JAMBwise Number', slip.reg_number], ['Exam', slip.exam || 'CBT Mock'], ['Email', slip.email || '-'], ['Exam Date/Time', slip.when]]
  rows.forEach(([k, v]) => {
    text(M + 40, y, k + ':', 10.5, false, MUT)
    text(M + 190, y, fit(v || '-', W - 2 * M - 190 - 20, 11, true), 11, true)
    y -= 24
  })
  y -= 12
  o.push(`0.84 0.92 0.88 rg ${M} ${n2(y - 24)} ${W - 2 * M} 24 re f`)
  text(M + 12, y - 16, 'Subject', 10.5, true)
  text(W - M - 12 - textWidth('Score', 10.5, true), y - 16, 'Score', 10.5, true)
  y -= 24
  slip.subjects.forEach((s, i) => {
    if (i % 2 === 1) o.push(`${SOFT} rg ${M} ${n2(y - 26)} ${W - 2 * M} 26 re f`)
    o.push(`0.85 0.85 0.85 RG 0.5 w ${M} ${n2(y - 26)} m ${W - M} ${n2(y - 26)} l S`)
    center(y - 17, s.name, 11)
    const sc = String(subjectScore(s))
    text(W - M - 12 - textWidth(sc, 11), y - 17, sc, 11)
    y -= 26
  })
  y -= 34
  center(y, `Total Score: ${slip.total}`, 20, true, GREEN)
  y -= 18
  center(y, 'out of 400', 10, false, MUT)
  y -= 44
  ;[
    'This is a JAMBwise practice result. JAMBwise is an independent platform and is not affiliated with, or endorsed by, JAMB.',
    'Each subject is scored out of 100 (percentage correct). Four subjects give a score out of 400.',
    `Printed on ${when}.`,
  ].forEach((n) => { center(y, n, 8.5, false, MUT); y -= 13 })
  return assemble(o, null)
}

function assemble(o, jpg) {
  const content = o.join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${jpg ? ' /XObject << /Im1 7 0 R >>' : ''} >> /Contents 6 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  if (jpg) objs.push(`<< /Type /XObject /Subtype /Image /Width ${jpg.w} /Height ${jpg.h} /ColorSpace ${jpg.comps === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.bin.length} >>\nstream\n${jpg.bin}\nendstream`)
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
