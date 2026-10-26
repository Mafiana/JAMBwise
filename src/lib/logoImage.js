/** Turns a chosen picture into a small data: URL for an institution logo (fits inside 192 x 192, keeps its shape and any transparent background). */
export function fileToLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return reject(new Error('Please choose a PNG, JPEG or WebP picture.'))
    if (file.size > 6 * 1024 * 1024) return reject(new Error('That picture is too big. Choose one under 6 MB.'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That picture could not be opened.'))
      img.onload = () => {
        const draw = (max, fill) => {
          const k = Math.min(1, max / Math.max(img.width, img.height))
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
          const g = c.getContext('2d')
          if (fill) { g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height) }
          g.drawImage(img, 0, 0, c.width, c.height)
          return c
        }
        let out = draw(192).toDataURL('image/png')
        if (out.length > 60000) out = draw(160, '#fff').toDataURL('image/jpeg', 0.85)   // a busy picture: a smaller JPEG on white
        if (out.length > 75000) return reject(new Error('That picture is too detailed. Try a simpler logo.'))
        resolve(out)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
