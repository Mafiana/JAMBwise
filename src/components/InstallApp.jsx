import { useState } from 'react'
import { useInstall } from '../hooks.js'
import Icon from './Icons.jsx'

const KEY = 'jw_install_dismissed'
const recentlyDismissed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 864e5 } catch { return false } }

/**
 * "Install JAMBwise" prompt. variant="banner" is the dismissible strip on the dashboard; variant="card" is the
 * always-available block in Settings, which also explains how to install when the browser has no one-tap button.
 */
export default function InstallApp({ variant = 'banner' }) {
  const { installed, canInstall, ios, install } = useInstall()
  const [hidden, setHidden] = useState(recentlyDismissed)
  const [note, setNote] = useState('')

  if (installed) return variant === 'card' ? <div className="card"><h3><Icon name="phone" size={18} /> JAMBwise is installed</h3><p className="mut" style={{ margin: 0 }}>You are using the installed app. It opens fast and keeps your saved questions for when the signal drops.</p></div> : null
  if (variant === 'banner' && (hidden || (!canInstall && !ios))) return null

  const go = async () => { if ((await install()) === 'dismissed') setNote('No problem. You can install any time from Settings.') }
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ } setHidden(true) }
  const how = ios
    ? 'On iPhone: tap the Share button in Safari, then "Add to Home Screen".'
    : 'In your browser menu, choose "Install app" or "Add to Home screen".'

  return (
    <div className={variant === 'banner' ? 'install-banner' : 'card'}>
      <span className="ic"><Icon name="phone" /></span>
      <div className="install-text">
        <b>Install JAMBwise on your phone</b>
        <span className="mut">Opens like an app from your home screen, loads faster, and keeps your questions so you can practise even on weak data.</span>
        {(!canInstall || note) && <span className="sm">{note || how}</span>}
      </div>
      <div className="install-actions">
        {canInstall && <button className="btn" onClick={go}><Icon name="download" size={16} /> Install app</button>}
        {variant === 'banner' && <button className="btn ghost" onClick={dismiss} aria-label="Hide for now">Not now</button>}
      </div>
    </div>
  )
}
