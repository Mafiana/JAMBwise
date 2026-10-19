// A small PDF writer for table reports (no libraries, so nothing extra to install). A4 landscape, Helvetica,
// the header row repeats on every page, with page numbers. Text is written in the PDF "WinAnsi" alphabet:
// accents are dropped (Ọ becomes O) and any other character becomes "?".

const W = 842, H = 595, M = 40            // A4 landscape in points, margin
const ROW = 20, HEAD = 24, FS = 9.5, PAD = 6

// Helvetica widths (1000 units per em) for ASCII 32..126
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]

export const toLatin = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?')
const esc = (s) => s.replace(/[\\()]/g, '\\$&')
export const textWidth = (s, size, bold = false) => {
  let w = 0
  for (const ch of s) w += HW[ch.charCodeAt(0) - 32] ?? 556
  return (w / 1000) * size * (bold ? 1.07 : 1)
}
/** Shortens text with "..." so it fits in `max` points. */
export function fit(s, max, size, bold = false) {
  s = toLatin(s)
  if (textWidth(s, size, bold) <= max) return s
  while (s.length > 1 && textWidth(s + '...', size, bold) > max) s = s.slice(0, -1)
  return s.trimEnd() + '...'
}

const n2 = (n) => Number(n.toFixed(2))

/**
 * columns: [{ label, width, align: 'left' | 'right' | 'center' }]; rows: arrays of strings.
 * Returns the PDF as a Uint8Array.
 */
export function buildTablePdf({ title, subtitle = '', columns, rows, note = '', generated = '' }) {
  const firstTop = H - M - 44                // table starts lower on page 1 (room for the title)
  const nextTop = H - M - 18
  const bottom = M + 26
  const pages = []
  let i = 0
  while (i < rows.length || pages.length === 0) {
    const top = pages.length === 0 ? firstTop : nextTop
    const fits = Math.max(1, Math.floor((top - HEAD - bottom) / ROW))
    pages.push(rows.slice(i, i + fits)); i += fits
    if (i >= rows.length) break
  }
  const total = pages.length

  const content = pages.map((pageRows, pi) => {
    const o = []
    const text = (x, y, s, size = FS, bold = false, rgb = '0.1 0.1 0.1') => o.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb} rg ${n2(x)} ${n2(y)} Td (${esc(toLatin(s))}) Tj ET`)
    let y = pi === 0 ? H - M - 14 : H - M - 6
    if (pi === 0) {
      text(M, y, title, 17, true, '0.04 0.37 0.22')
      if (subtitle) text(M, y - 16, subtitle, 9.5, false, '0.35 0.35 0.35')
    } else text(M, y, title + ' (continued)', 10, true, '0.04 0.37 0.22')
    let ty = pi === 0 ? firstTop : nextTop     // top edge of the header row
    const tw = columns.reduce((t, c) => t + c.width, 0)
    o.push(`0.04 0.37 0.22 rg ${M} ${n2(ty - HEAD)} ${n2(tw)} ${HEAD} re f`)
    let x = M
    const place = (c, s, bold, rgb, yy) => {
      const w = textWidth(toLatin(s), FS, bold)
      const tx = c.align === 'right' ? x + c.width - PAD - w : c.align === 'center' ? x + (c.width - w) / 2 : x + PAD
      text(tx, yy, s, FS, bold, rgb)
    }
    for (const c of columns) { place(c, fit(c.label, c.width - 2 * PAD, FS, true), true, '1 1 1', ty - HEAD + 8); x += c.width }
    ty -= HEAD
    pageRows.forEach((r, ri) => {
      if (ri % 2) o.push(`0.94 0.97 0.95 rg ${M} ${n2(ty - ROW)} ${n2(tw)} ${ROW} re f`)
      x = M
      columns.forEach((c, ci) => { place(c, fit(r[ci] ?? '', c.width - 2 * PAD, FS), false, '0.1 0.1 0.1', ty - ROW + 6.5); x += c.width })
      ty -= ROW
    })
    o.push(`0.8 G 0.5 w ${M} ${n2(ty)} m ${n2(M + tw)} ${n2(ty)} l S`)
    if (!rows.length) text(M + PAD, ty - 16, 'No scores yet.', FS, false, '0.4 0.4 0.4')
    if (pi === total - 1 && note) text(M, ty - 18, fit(note, tw, 8), 8, false, '0.4 0.4 0.4')
    text(M, M - 4, generated, 8, false, '0.5 0.5 0.5')
    const label = `Page ${pi + 1} of ${total}`
    text(W - M - textWidth(label, 8), M - 4, label, 8, false, '0.5 0.5 0.5')
    return o.join('\n')
  })

  // objects: 1 catalog, 2 page tree, 3 Helvetica, 4 Helvetica-Bold, then (page, content) pairs
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
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)           // everything is ASCII, so one character is one byte
  for (let k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 0xff
  return bytes
}
