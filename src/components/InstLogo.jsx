const initials = (name = '') => name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

/** An institution's logo, or its initials in a green tile when it has none. `size` is the width and height in pixels. */
export default function InstLogo({ inst, size = 52 }) {
  const s = { width: size, height: size, fontSize: Math.round(size * 0.37) }
  if (inst?.logo) return <span className="inst-logo" style={s}><img src={inst.logo} alt={inst.name + ' logo'} /></span>
  return <span className="inst-badge" style={s} aria-hidden="true">{initials(inst?.name)}</span>
}
