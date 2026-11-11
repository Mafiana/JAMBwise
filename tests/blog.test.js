import test from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, isEmptyPost, makeSummary, readingMinutes, sanitizeHtml, wordCount } from '../src/lib/blogHtml.js'

test('htmlToText strips tags and decodes entities', () => {
  assert.equal(htmlToText('<h2>Hello</h2><p>Tom &amp; Jerry&nbsp;said &lt;hi&gt;</p><script>alert(1)</script>'), 'Hello Tom & Jerry said <hi>')
  assert.equal(htmlToText(''), '')
  assert.equal(htmlToText(null), '')
})

test('word count and reading time', () => {
  assert.equal(wordCount('<p>one two three</p>'), 3)
  assert.equal(readingMinutes('<p>short</p>'), 1)
  assert.equal(readingMinutes('<p>' + 'word '.repeat(1000) + '</p>'), 5)
})

test('summary is cut at a word and gets an ellipsis', () => {
  const s = makeSummary('<p>' + 'alpha beta gamma '.repeat(30) + '</p>', 60)
  assert.ok(s.endsWith('…'))
  assert.ok(s.length <= 61)
  assert.equal(makeSummary('<p>Tiny post</p>'), 'Tiny post')
})

test('a post with only a picture is not empty, an empty paragraph is', () => {
  assert.equal(isEmptyPost('<p><br></p>'), true)
  assert.equal(isEmptyPost('<p>&nbsp;</p>'), true)
  assert.equal(isEmptyPost('<p><img src="data:image/png;base64,AAAA"></p>'), false)
  assert.equal(isEmptyPost('<p>Hi</p>'), false)
})

test('with no browser around, the sanitizer keeps only escaped plain text', () => {
  const out = sanitizeHtml('<p onclick="x()">Hi <script>alert(1)</script><b>there</b></p>')
  assert.ok(!/<script|onclick/i.test(out))
  assert.ok(out.includes('Hi'))
})
