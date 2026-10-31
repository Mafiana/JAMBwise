import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initBackend, setupMissing } from './lib/supabase.js'
import './index.css'

// choose the real Supabase or the built-in demo backend, then draw the app
initBackend().then(() => {
  const root = createRoot(document.getElementById('root'))
  if (setupMissing) {
    // the site was built without its Supabase settings: say so, rather than opening a demo with public logins
    root.render(
      <div style={{ maxWidth: 520, margin: '15vh auto', padding: 24, font: '16px/1.6 system-ui, sans-serif', textAlign: 'center' }}>
        <h2>JAMBwise is not set up yet</h2>
        <p>This site was published without its database settings. The site owner needs to add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the hosting settings, then publish again.</p>
      </div>,
    )
    return
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Offline support: the service worker (public/sw.js) keeps the app on the device. Only in a real build, so
// `npm run dev` never serves stale files.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* private mode etc.: the app simply works online only */ }) })
}
