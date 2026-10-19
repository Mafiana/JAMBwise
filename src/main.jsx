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
