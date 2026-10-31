import { Component } from 'react'
import { useLocation } from 'react-router-dom'

/** Catches a page that crashes (or a file that failed to load) and shows what happened, instead of a blank screen. */
class Boundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Page crashed:', error) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="wrap" style={{ padding: '40px 0' }}>
        <div className="card auth c">
          <h2>This page could not open</h2>
          <p className="mut">Something went wrong while opening this page. Please reload. If it keeps happening, send us the message below.</p>
          <pre className="sm" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', overflowWrap: 'anywhere' }}>{String(error?.message || error).slice(0, 500)}</pre>
          <div className="modal-actions"><button className="btn" onClick={() => window.location.reload()}>Reload the page</button><a className="btn ghost" href="/">Go home</a></div>
        </div>
      </div>
    )
  }
}

/** Resets itself whenever the person moves to another page. */
export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
