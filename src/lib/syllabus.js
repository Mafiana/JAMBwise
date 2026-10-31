// Helpers for the Syllabus pages: reading a chosen PDF, and showing one that came back from the database.
export const MAX_PDF_BYTES = 3 * 1024 * 1024

/** A chosen PDF as { data: 'data:application/pdf;base64,...', name, size }. Rejects anything that is not a PDF under 3 MB. */
export function fileToPdf(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Please choose a PDF file.'))
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return reject(new Error('Please choose a PDF file.'))
    if (file.size > MAX_PDF_BYTES) return reject(new Error('That PDF is too big. Choose one under 3 MB.'))
    const r = new FileReader()
    r.onerror = () => reject(new Error('Could not read that file.'))
    r.onload = () => {
      const data = String(r.result || '').replace(/^data:[^;,]*/, 'data:application/pdf')   // some browsers leave the type empty
      resolve({ data, name: file.name, size: file.size })
    }
    r.readAsDataURL(file)
  })
}

/** A data: URL as a temporary address the browser can show in a frame or download. Call URL.revokeObjectURL() when done. */
export function pdfUrl(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || ''
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

export const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB')
