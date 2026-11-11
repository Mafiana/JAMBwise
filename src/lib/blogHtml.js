// Blog posts are formatted text (HTML). Whatever is saved or shown is first cleaned down to a short list of safe tags,
// so a pasted page can never bring scripts, forms or tracking code into JAMBwise.

const KEEP = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'div', 'span', 'sub', 'sup', 'code', 'pre'])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'link', 'meta', 'title', 'head', 'base'])
const ALIGNABLE = new Set(['p', 'h2', 'h3', 'h4', 'div', 'blockquote', 'li'])
const ALIGNS = new Set(['left', 'center', 'right', 'justify'])
const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const SAFE_IMG = /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'<>]+)$/i

export const BLOG_MAX_CHARS = 2800000   // a little under the database limit (3,000,000)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The readable text of some HTML (no tags, no pictures), with the common entities turned back into characters. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export const wordCount = (html) => { const t = htmlToText(html); return t ? t.split(' ').length : 0 }

/** Minutes to read (at 200 words a minute), never less than 1. */
export const readingMinutes = (html) => Math.max(1, Math.round(wordCount(html) / 200))

/** A short plain-text summary for the post card, cut at a word. */
export function makeSummary(html, max = 180) {
  const t = htmlToText(html)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).replace(/[\s,.;:–-]+$/, '') + '…'
}

/** True when the post has no words and no picture. */
export const isEmptyPost = (html) => !htmlToText(html) && !/<img\b/i.test(String(html || ''))

function copyClean(from, into, doc) {
  for (const node of Array.from(from.childNodes)) {
    if (node.nodeType === 3) { into.appendChild(doc.createTextNode(node.nodeValue)); continue }
    if (node.nodeType !== 1) continue
    const tag = node.tagName.toLowerCase()
    if (DROP.has(tag)) continue
    if (!KEEP.has(tag)) { copyClean(node, into, doc); continue }   // an unknown tag: keep its text, lose the tag
    if (tag === 'a') {
      const href = String(node.getAttribute('href') || '').trim()
      if (!SAFE_LINK.test(href)) { copyClean(node, into, doc); continue }
      const a = doc.createElement('a')
      a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer')
      copyClean(node, a, doc); into.appendChild(a); continue
    }
    if (tag === 'img') {
      const src = String(node.getAttribute('src') || '').trim()
      if (!SAFE_IMG.test(src)) continue
      const img = doc.createElement('img')
      img.setAttribute('src', src); img.setAttribute('alt', String(node.getAttribute('alt') || '').slice(0, 200)); img.setAttribute('loading', 'lazy')
      into.appendChild(img); continue
    }
    const el = doc.createElement(tag)
    if (ALIGNABLE.has(tag) && node.style && ALIGNS.has(node.style.textAlign)) el.setAttribute('style', 'text-align:' + node.style.textAlign)
    if (tag !== 'br' && tag !== 'hr') copyClean(node, el, doc)
    into.appendChild(el)
  }
}

/** Cleans HTML down to the safe tags above. In a browser this uses the browser's own parser; with no browser around, only the plain text survives. */
export function sanitizeHtml(html) {
  const src = String(html || '')
  if (typeof DOMParser === 'undefined') return esc(htmlToText(src)).replace(/^(.+)$/, '<p>$1</p>')
  const doc = new DOMParser().parseFromString(src, 'text/html')   // an inert document: nothing in it runs or loads
  const out = doc.createElement('div')
  copyClean(doc.body, out, doc)
  return out.innerHTML
}
