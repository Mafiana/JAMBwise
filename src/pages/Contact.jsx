import { Link } from 'react-router-dom'
import { Logo, ThemeToggle } from '../components/ui.jsx'
import ContactBlock from '../components/ContactBlock.jsx'

export default function Contact() {
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
        <ContactBlock />
      </div>
    </>
  )
}
