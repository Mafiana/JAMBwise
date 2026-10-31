// The service worker (public/sw.js) finds the app's files by reading the built page and scripts. These tests feed it
// text shaped like real Vite output, so a change to how files are named would be noticed here.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const src = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ctx = { self: { addEventListener() {} }, caches: {}, fetch() {}, URL, Response }
vm.createContext(ctx)
vm.runInContext(src + '\nthis.findAssets = findAssets', ctx)
const find = (...a) => Array.from(ctx.findAssets(...a))   // copy: arrays made inside the vm are not the same realm

test('page: script, modulepreload and stylesheet tags are found', () => {
  const html = '<script type="module" crossorigin src="/assets/index-AbC123.js"></script><link rel="modulepreload" crossorigin href="/assets/vendor-X1.js"><link rel="stylesheet" crossorigin href="/assets/index-Q9.css"><link rel="icon" href="/favicon.svg">'
  assert.deepEqual(find(html).sort(), ['/assets/index-AbC123.js', '/assets/index-Q9.css', '/assets/vendor-X1.js'])
})
test('main script: the lazy-chunk list and named imports are found', () => {
  const js = 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Students-aa.js","assets/Students-bb.css","assets/shared-cc.js"])))=>i.map(i=>d[i]);import("./Planner-dd.js");import{a}from"./vendor-X1.js"'
  assert.deepEqual(find(js, '/assets/').sort(), ['/assets/Planner-dd.js', '/assets/Students-aa.js', '/assets/Students-bb.css', '/assets/shared-cc.js', '/assets/vendor-X1.js'])
})
test('unrelated text and other file types are ignored', () => {
  assert.deepEqual(find('<img src="/assets/logo.png"> <a href="https://x.com/assets/a.js">'), [])
  assert.deepEqual(find(''), [])
})
test('the worker never handles non-GET requests or other sites (Supabase, Paystack)', () => {
  assert.match(src, /if \(req\.method !== 'GET'\) return/)
  assert.match(src, /if \(url\.origin !== self\.location\.origin\) return/)
})
test('manifest is valid JSON with the fields installers need', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  for (const k of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) assert.ok(m[k], k)
  for (const i of m.icons) assert.ok(fs.existsSync(new URL('../public' + i.src, import.meta.url)), i.src)
})
