import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Logo, ThemeToggle } from '../components/ui.jsx'
import Icon from '../components/Icons.jsx'
import Captcha from '../components/Captcha.jsx'
import * as api from '../lib/api.js'
import { useAction } from '../hooks.js'

const TOPICS = [['general', 'General question'], ['pin', 'Access PIN problem'], ['payment', 'Payment or plan'], ['bug', 'Something is broken'], ['other', 'Other']]

export default function Contact() {
  const { session, profile, booting } = useAuth()
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({ name: profile?.full_name || '', email: profile?.email || '', topic: 'general', body: '', website: '' })
  const [sent, setSent] = useState(false)
  // a signed-in student who opens this page directly: fill their details in as soon as the profile has loaded
  useEffect(() => { if (profile) setF((x) => ({ ...x, name: x.name || profile.full_name || '', email: x.email || profile.email || '' })) }, [profile])
  const [captcha, setCaptcha] = useState(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    if (f.website) { setSent(true); return }   // hidden trap field: only bots fill it in
    if (!f.name.trim()) return setError('Please enter your name.')
    if (!/^[^@\s]+@[^@\s]+$/.test(f.email.trim())) return setError('Please enter a valid email address so we can reply.')
    if (f.body.trim().length < 5) return setError('Please write a few words about what you need.')
    if (!session && !captcha) return setError('Please answer the quick check below, so we know you are not a robot.')
    return run(async () => {
      try {
        await api.sendMessage({ ...f, user_id: session?.user?.id, captcha })
        setSent(true)
      } catch (err) {
        if (err.captcha) { setCaptcha(null); setCaptchaKey((k) => k + 1) }   // the check was refused: show a new one
        throw err
      }
    })
  }
  return (
    <>
      <header className="nav">
        <Logo />
        <span><ThemeToggle /><Link to="/">Back to home</Link></span>
      </header>
      <div className="wrap contact" style={{ paddingBottom: 56 }}>
        <div className="contact-head">
          <h1>Contact us</h1>
          <p className="lead mut">Questions about a PIN, a payment or your account? Send us a message and we will reply by email, usually within a day.</p>
        </div>
        <div className="contact-grid">
          <div className="card">
            {sent ? (
              <div className="c" role="status">
                <span className="ic" style={{ margin: '0 auto 12px' }}><Icon name="check" /></span>
                <h2>Message sent</h2>
                <p className="mut">Thank you. We will reply to {f.email || 'your email'} as soon as we can.{session && <> You can also follow replies under <Link to="/app/help">Customer Support</Link>.</>}</p>
                <Link className="btn" to="/">Back to home</Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <label htmlFor="cn">Your name</label>
                <input id="cn" value={f.name} onChange={set('name')} maxLength={100} autoComplete="name" />
                <label htmlFor="ce">Email address</label>
                <input id="ce" type="email" value={f.email} onChange={set('email')} maxLength={200} autoComplete="email" />
                <label htmlFor="ct">What is it about?</label>
                <select id="ct" value={f.topic} onChange={set('topic')}>{TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <label htmlFor="cm">Message</label>
                <textarea id="cm" rows={6} value={f.body} onChange={set('body')} maxLength={2000} />
                <p className="sm" style={{ textAlign: 'right', margin: '2px 0 0' }}>{f.body.length}/2000</p>
                <div className="hp" aria-hidden="true"><label htmlFor="cw">Leave this empty</label><input id="cw" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></div>
                {!booting && !session && <Captcha onChange={setCaptcha} resetKey={captchaKey} />}
                <ErrorLine>{error}</ErrorLine>
                <button className="btn lg" disabled={busy} style={{ width: '100%', marginTop: 8 }}>{busy ? 'Sending…' : 'Send message'}</button>
              </form>
            )}
          </div>
          <aside className="contact-side">
            <div className="card"><span className="ic sm"><Icon name="help" /></span><h3>Email</h3><p className="mut"><a href="mailto:support@jambwise.ng">support@jambwise.ng</a></p></div>
            <div className="card"><span className="ic sm"><Icon name="key" /></span><h3>Access PIN not working?</h3><p className="mut">Check for typos (PINs are 8 characters, like ABCD-2345) and ask your tutor to confirm the PIN. Each PIN is used once, by one student.</p></div>
            <div className="card"><span className="ic sm"><Icon name="card" /></span><h3>Paid but still on Free?</h3><p className="mut">Include your Paystack reference in your message and we will fix it quickly.</p></div>
          </aside>
        </div>
      </div>
    </>
  )
}
