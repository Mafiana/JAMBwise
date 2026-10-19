import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initBackend } from './lib/supabase.js'
import './index.css'

// choose the real Supabase or the built-in demo backend, then draw the app
initBackend().then(() => {
  createRoot(document.getElementById('root')).render(
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
