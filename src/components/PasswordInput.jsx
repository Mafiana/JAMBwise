import { useState } from 'react'
import Icon from './Icons.jsx'

/** A password box with an eye button inside it that shows or hides what was typed. Takes the same props as an <input>. */
export default function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false)
  return (
    <span className={'pwbox ' + className}>
      <input {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeoff' : 'eye'} size={20} />
      </button>
    </span>
  )
}
