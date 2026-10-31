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
