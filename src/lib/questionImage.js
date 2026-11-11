// Pictures inside questions: shrinking a chosen file so it is small enough to keep in the database.

export const IMAGE_MAX_SIDE = 900          // longest side in pixels (enough for a diagram on a phone)
export const IMAGE_MAX_CHARS = 300000      // the database limit on the data: text (about 220 KB of picture)

/** Fits a size inside max x max, never enlarging. */
export function fitSize(w, h, max = IMAGE_MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Turns a chosen picture into a small JPEG data: URL (white behind transparent PNGs). Rejects if it cannot be made small enough.
 *  `opts` can ask for a smaller picture (the blog cover uses { maxSide: 720, maxChars: 120000 }). */
export function fileToImage(file, opts = {}) {
  const maxSide = opts.maxSide || IMAGE_MAX_SIDE
  const maxChars = opts.maxChars || IMAGE_MAX_CHARS
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type).startsWith('image/')) return reject(new Error('Please choose a picture (JPG or PNG).'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That picture could not be opened.'))
      img.onload = () => {
        let side = maxSide
        for (let attempt = 0; attempt < 4; attempt++) {
          const { w, h } = fitSize(img.width, img.height, side)
          const c = document.createElement('canvas')
          c.width = w; c.height = h
          const ctx = c.getContext('2d')
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          for (const q of [0.85, 0.7, 0.55]) {
            const url = c.toDataURL('image/jpeg', q)
            if (url.length <= maxChars) return resolve(url)
          }
          side = Math.round(side * 0.75)
        }
        reject(new Error('That picture is too detailed to shrink. Try a simpler or smaller one.'))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export const fileToQuestionImage = (file) => fileToImage(file)
