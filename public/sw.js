// JAMBwise service worker: makes the app open and work with no signal.
//   - the app itself (pages, scripts, styles, icons) is saved the first time it loads and served from the device afterwards
//   - questions are NOT handled here: the app saves them per student (see src/lib/api.js)
//   - anything that talks to Supabase, Paystack or an Edge Function is never touched, so logins, payments and results are always live
// Change VERSION to force every device to download a fresh copy.
const VERSION = 'v1'
const SHELL = 'jw-shell-' + VERSION
const ASSETS = 'jw-assets-' + VERSION
const FONTS = 'jw-fonts-' + VERSION

/** Finds the built script and style files named in a piece of text. `base` is the folder the text was loaded from, for "./name.js" references. */
function findAssets(text, base = '/assets/') {
  const found = new Set()
  for (const m of String(text).matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)) found.add(m[1])          // the page's own script and style tags
  for (const m of String(text).matchAll(/["'`](assets\/[\w.-]+\.(?:js|css))["'`]/g)) found.add('/' + m[1])                     // the build's list of lazy chunks
  for (const m of String(text).matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)) found.add(base + m[1])                       // chunks imported by name
  return [...found]
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL)
    const assets = await caches.open(ASSETS)
    const res = await fetch('/index.html', { cache: 'reload' })
    const html = await res.clone().text()
    await shell.put('/index.html', res)
    await Promise.all(['/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/hero-wallpaper.svg'].map((u) => shell.add(u).catch(() => {})))
    // Save every script and style the app needs, following the references from file to file (the page, then the main script,
    // then the chunks it loads), so the whole app opens offline even if the student has not visited every screen yet.
    const queue = findAssets(html)
    const done = new Set()
    while (queue.length && done.size < 80) {
      const url = queue.shift()
      if (done.has(url)) continue
      done.add(url)
      try {
        const r = await fetch(url)
        if (!r.ok) continue
        await assets.put(url, r.clone())
        const dir = url.slice(0, url.lastIndexOf('/') + 1)
        if (url.endsWith('.js')) for (const next of findAssets(await r.text(), dir)) if (!done.has(next)) queue.push(next)
      } catch { /* offline install: the cache below still fills in as the student uses the app */ }
    }
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, FONTS]
    await Promise.all((await caches.keys()).filter((k) => k.startsWith('jw-') && !keep.includes(k)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Google Fonts: keep a copy, show the copy straight away, refresh it quietly
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONTS))
    return
  }
  if (url.origin !== self.location.origin) return          // Supabase, Paystack, Turnstile, anything else: straight to the network

  // opening a page (any route): try the network, fall back to the saved app so it still opens offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok && res.headers.get('content-type')?.includes('text/html')) (await caches.open(SHELL)).put('/index.html', res.clone())
        return res
      } catch {
        return (await caches.match('/index.html')) || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain' } })
      }
    })())
    return
  }

  // built files have a fingerprint in their name, so a saved copy never goes stale: use it first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(ASSETS)).put(req, res.clone())
      return res
    })())
    return
  }

  // icons, manifest, wallpaper: saved copy first, refreshed in the background
  if (/\.(?:png|svg|webmanifest|ico|woff2?)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(req, SHELL))
})

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req)
  const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res }).catch(() => hit)
  return hit || fresh
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})
