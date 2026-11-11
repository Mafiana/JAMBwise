import { useCallback, useEffect, useRef, useState } from 'react'
import { fileToImage } from '../lib/questionImage.js'
import { BLOG_MAX_CHARS, isEmptyPost, readingMinutes, sanitizeHtml, wordCount } from '../lib/blogHtml.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const Glyph = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const G = {
  left: 'M4 6h16M4 10h10M4 14h16M4 18h10', center: 'M4 6h16M7 10h10M4 14h16M7 18h10', right: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  ul: 'M9 6h11M9 12h11M9 18h11M4.500 6h.01M4.500 12h.01M4.500 18h.01', ol: 'M10 6h10M10 12h10M10 18h10M4 5l1.500-1v5M4 14h3l-3 4h3',
  quote: 'M5 17c0-4 1-7 4-9M13 17c0-4 1-7 4-9M5 17h4v-4H5ZM13 17h4v-4h-4Z', link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1M4 4l16 16',
  image: 'M4 5h16v14H4V5Zm0 11 5-5 4 4 3-3 4 4M9 9.500h.01', hr: 'M4 12h16M8 7l4-3 4 3M8 17l4 3 4-3', undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', clear: 'M5 19h14M7 5h10M12 5l-3 11',
}

/** A word-processor style box for blog posts: bold, italic, underline, headings, lists, quotes, alignment, links and pictures. Fires onChange(html) with the box's raw HTML (clean it with sanitizeHtml before saving). */
export default function RichEditor({ initialHtml = '', onChange, onError }) {
  const area = useRef(null)
  const picker = useRef(null)
  const saved = useRef(null)   // the cursor position, kept while a dialog or the file picker has the focus
  const [fmt, setFmt] = useState({})
  const [stats, setStats] = useState({ words: 0, mins: 1, empty: true })

  const inside = () => { const s = window.getSelection(); return Boolean(s && s.rangeCount && area.current && area.current.contains(s.anchorNode)) }
  const remember = () => { if (inside()) saved.current = window.getSelection().getRangeAt(0).cloneRange() }
  const restore = () => {
    area.current.focus()
    if (saved.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved.current) }
  }
  const refresh = useCallback(() => {
    if (!inside()) return
    remember()
    let block = 'p'
    try { block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '') } catch { /* older browsers */ }
    const q = (c) => { try { return document.queryCommandState(c) } catch { return false } }
    setFmt({ bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), ul: q('insertUnorderedList'), ol: q('insertOrderedList'), left: q('justifyLeft'), center: q('justifyCenter'), right: q('justifyRight'), block })
  }, [])
  const emit = useCallback(() => {
    const html = area.current.innerHTML
    setStats({ words: wordCount(html), mins: readingMinutes(html), empty: isEmptyPost(html) })
    if (onChange) onChange(html)
  }, [onChange])

  useEffect(() => {
    area.current.innerHTML = sanitizeHtml(initialHtml)
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false) } catch { /* fine */ }
    setStats({ words: wordCount(initialHtml), mins: readingMinutes(initialHtml), empty: isEmptyPost(initialHtml) })
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (cmd, val) => {
    restore()
    try { document.execCommand(cmd, false, val) } catch { /* the browser refused: nothing changes */ }
    emit(); refresh()
  }
  const hold = (e) => e.preventDefault()   // pressing a toolbar button must not take the cursor out of the text

  const addLink = () => {
    remember()
    const url = (window.prompt('Link address (for example https://jambwise.netlify.app)', 'https://') || '').trim()
    if (!url) return
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return onError && onError('A link must start with https:// or http://')
    restore()
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) run('insertHTML', `<a href="${esc(url)}">${esc(url)}</a>`)
    else run('createLink', url)
  }
  const insertPicture = async (file) => {
    if (!file) return
    try {
      const url = await fileToImage(file)
      restore()
      document.execCommand('insertHTML', false, `<img src="${url}" alt="Picture"><p><br></p>`)
      if (area.current.innerHTML.length > BLOG_MAX_CHARS) { document.execCommand('undo'); throw new Error('This post is getting too large for another picture. Shrink or remove one first.') }
      emit()
    } catch (e) { if (onError) onError(e.message || 'Could not add that picture.') }
  }
  const onPaste = (e) => {
    const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'))
    if (file) { e.preventDefault(); insertPicture(file); return }
    e.preventDefault()
    const html = e.clipboardData?.getData('text/html')
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html))
    else document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '')
    emit()
  }
  const onDrop = (e) => {
    const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'))
    if (file) { e.preventDefault(); insertPicture(file) }
  }

  const B = ({ cmd, val, on, title, children, onClick }) => (
    <button type="button" className={'rt-btn' + (on ? ' on' : '')} title={title} aria-label={title} aria-pressed={on === undefined ? undefined : Boolean(on)} onMouseDown={hold} onClick={onClick || (() => run(cmd, val))}>{children}</button>
  )

  return (
    <div className="rt">
      <div className="rt-bar" role="toolbar" aria-label="Formatting">
        <select className="rt-block" aria-label="Text style" value={['h2', 'h3', 'blockquote'].includes(fmt.block) ? fmt.block : 'p'} onChange={(e) => run('formatBlock', '<' + e.target.value + '>')}>
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="blockquote">Quote</option>
        </select>
        <span className="rt-sep" />
        <B cmd="bold" on={fmt.bold} title="Bold (Ctrl+B)"><b>B</b></B>
        <B cmd="italic" on={fmt.italic} title="Italic (Ctrl+I)"><i style={{ fontFamily: 'Georgia,serif' }}>I</i></B>
        <B cmd="underline" on={fmt.underline} title="Underline (Ctrl+U)"><u>U</u></B>
        <B cmd="strikeThrough" on={fmt.strike} title="Strikethrough"><s>S</s></B>
        <span className="rt-sep" />
        <B cmd="insertUnorderedList" on={fmt.ul} title="Bullet list"><Glyph d={G.ul} /></B>
        <B cmd="insertOrderedList" on={fmt.ol} title="Numbered list"><Glyph d={G.ol} /></B>
        <B cmd="formatBlock" val="<blockquote>" on={fmt.block === 'blockquote'} title="Quote"><Glyph d={G.quote} /></B>
        <span className="rt-sep" />
        <B cmd="justifyLeft" on={fmt.left} title="Align left"><Glyph d={G.left} /></B>
        <B cmd="justifyCenter" on={fmt.center} title="Centre"><Glyph d={G.center} /></B>
        <B cmd="justifyRight" on={fmt.right} title="Align right"><Glyph d={G.right} /></B>
        <span className="rt-sep" />
        <B title="Add a link" onClick={addLink}><Glyph d={G.link} /></B>
        <B cmd="unlink" title="Remove link"><Glyph d={G.unlink} /></B>
        <B title="Add a picture" onClick={() => { remember(); picker.current.click() }}><Glyph d={G.image} /></B>
        <B cmd="insertHorizontalRule" title="Dividing line"><Glyph d={G.hr} /></B>
        <span className="rt-sep" />
        <B cmd="undo" title="Undo (Ctrl+Z)"><Glyph d={G.undo} /></B>
        <B cmd="redo" title="Redo (Ctrl+Y)"><Glyph d={G.redo} /></B>
        <B cmd="removeFormat" title="Clear formatting"><Glyph d={G.clear} /></B>
        <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; insertPicture(f) }} />
      </div>
      <div
        ref={area}
        className={'rt-area blog-body' + (stats.empty ? ' is-empty' : '')}
        data-ph="Write your post here. Use the buttons above to format it, or paste text from Word or a web page."
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Post body"
        spellCheck
        onInput={emit}
        onPaste={onPaste}
        onDrop={onDrop}
        onBlur={remember}
        onKeyUp={refresh}
        onMouseUp={refresh}
      />
      <div className="rt-foot sm">{stats.words} {stats.words === 1 ? 'word' : 'words'} · about {stats.mins} min read · Tip: click a picture and press Delete to remove it.</div>
    </div>
  )
}
