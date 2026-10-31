// Helpers for the Novel pages: the cover picture, the PDF, and the questions file.
import { parseQuestionFile } from './importQuestions.js'

export const COVER_W = 480
export const COVER_H = 640   // book covers are portrait, 3:4

/** Crops a chosen picture to a 3:4 portrait JPEG (small enough to keep in the database). Returns a data: URL. */
export function fileToCover(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type).startsWith('image/')) return reject(new Error('Please choose a picture (JPG or PNG).'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That picture could not be opened.'))
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = COVER_W; c.height = COVER_H
        const ratio = COVER_W / COVER_H
        let sw = img.width, sh = img.height
        if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio   // cut the extra from the sides or the bottom, centred
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H)
        resolve(c.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Reads a questions file (CSV or JSON, the same layouts as the Questions importer; no subject column is needed).
 * Returns { rows: [{ body, options, answer, explanation }], skipped: [{ line, why }] } or { error }.
 */
export function novelQuestionsFromText(text, filename) {
  const res = parseQuestionFile(text, filename, 'lit')   // 'lit' is only a placeholder: novel questions have no subject
  if (res.error) return { error: res.error }
  const rows = [], skipped = []
  for (const r of res.rows) {
    if (r.error) skipped.push({ line: r.line, why: r.error })
    else rows.push({ body: r.body, options: r.options, answer: r.answer, explanation: r.explanation })
  }
  return { rows, skipped }
}

export const MAX_KEYPOINT_CHARS = 200000

/** Reads a keypoints file (plain text: .txt or .md). Returns { text } or { error }. */
export async function keypointsFromFile(file) {
  if (!file) return { error: 'Please choose a file.' }
  if (/\.(docx?|pdf|rtf|odt)$/i.test(file.name)) return { error: 'Please save the keypoints as a plain text file (.txt) first. In Word: File, Save As, "Plain Text".' }
  if (file.size > 1024 * 1024) return { error: 'That file is too big for keypoints (up to 1 MB of text).' }
  const text = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (text.length < 5) return { error: 'That file is empty.' }
  if (text.length > MAX_KEYPOINT_CHARS) return { error: 'The keypoints are too long (up to 200,000 characters).' }
  if (text.includes('\u0000')) return { error: 'That does not look like a text file.' }
  return { text }
}

/**
 * Turns keypoints text into blocks for display:
 * "# Heading" / "## Sub heading", "- item" or "* item" lists, and paragraphs (a blank line ends one).
 * Returns [{ type: 'h1' | 'h2' | 'li' | 'p', text }].
 */
export function parseKeypoints(text) {
  const out = []
  let para = []
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ') }); para = [] } }
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    let m
    if ((m = line.match(/^##+\s+(.*)$/))) { flush(); out.push({ type: 'h2', text: m[1] }) }
    else if ((m = line.match(/^#\s+(.*)$/))) { flush(); out.push({ type: 'h1', text: m[1] }) }
    else if ((m = line.match(/^(?:[-*\u2022])\s+(.*)$/))) { flush(); out.push({ type: 'li', text: m[1] }) }
    else para.push(line)
  }
  flush()
  return out
}

/** Splits "a **bold** b" into [{ text: 'a ' }, { bold: true, text: 'bold' }, { text: ' b' }]. */
export function boldParts(s) {
  const parts = []
  String(s).split(/\*\*(.+?)\*\*/g).forEach((t, i) => { if (t) parts.push(i % 2 ? { bold: true, text: t } : { text: t }) })
  return parts
}
