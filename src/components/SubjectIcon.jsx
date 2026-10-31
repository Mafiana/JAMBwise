// One small line icon per subject, and a colour for each, so students can spot a subject at a glance.
export const SUBJECT_COLOR = {
  eng: '#2563EB', mat: '#7C3AED', phy: '#0891B2', chm: '#16A34A', bio: '#65A30D', gov: '#B45309', eco: '#D97706',
  com: '#DB2777', agr: '#15803D', acc: '#0F766E', mkt: '#E11D48', lit: '#9333EA', irk: '#047857', crk: '#4F46E5', hec: '#EA580C', cst: '#0284C7', geo: '#059669',
}

const SHAPES = {
  eng: <><path d="M3 18 7.5 6 12 18M4.8 14h5.4" /><path d="M19.5 13.5a2.8 2.8 0 1 0 0 3.2M19.5 12v6" /></>,
  mat: <path d="M6 4.5v6M3 7.5h6M14 7.5h7M6.5 14.5l5 5M11.5 14.5l-5 5M14 17h7" />,
  phy: <><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" /></>,
  chm: <path d="M9 3h6M10 3v6l-5.5 9.500A1.500 1.500 0 0 0 5.800 21h12.400a1.500 1.500 0 0 0 1.300-2.500L14 9V3M7.500 15h9" />,
  bio: <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 14M5 19l8-8" />,
  gov: <path d="M3 9.500 12 4l9 5.500H3ZM5.500 12v6M10 12v6M14 12v6M18.500 12v6M3 20.500h18" />,
  eco: <path d="M4 20h16M7 16v-3M12 16V9M17 16v-5M4.500 9 9 5.500l4 3L19.500 4" />,
  com: <path d="M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2" />,
  agr: <path d="M12 21v-9M12 12c0-4-3-6-6-6 0 4 2 6 6 6ZM12 15c0-3.500 2.500-5.500 6-5.500 0 3.500-2 5.500-6 5.500Z" />,
  acc: <path d="M5 4h14v16H5zM8 8h8M8 12h3M13 12h3M8 16h3M13 16h3" />,
  mkt: <path d="M4 10v4h3l8 4V6L7 10H4ZM18 9.500a3.500 3.500 0 0 1 0 5M7 14l1.500 5" />,
  lit: <path d="M3 5.500c3-1.200 6-1.200 9 .5 3-1.700 6-1.700 9-.5V18c-3-1.200-6-1.200-9 .5-3-1.700-6-1.700-9-.5V5.500ZM12 6v12.500" />,
  irk: <><path d="M17.500 15.500A7.500 7.500 0 1 1 9.500 5a6 6 0 0 0 8 10.500Z" /><path d="M18 4.500l.7 1.600 1.600.7-1.600.7-.7 1.600-.7-1.600-1.600-.7 1.600-.7Z" /></>,
  crk: <path d="M12 3v18M6.500 9h11" />,
  hec: <path d="M3 11.500 12 4l9 7.500M5.500 10v10h13V10M10 20v-5h4v5" />,
  cst: <path d="M4 5h16v11H4zM9 20h6M12 16v4" />,
  geo: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
}

export default function SubjectIcon({ k, size = 22, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {SHAPES[k] || SHAPES.lit}
    </svg>
  )
}

/** A rounded tile with the subject's icon in its colour. */
export function SubjectBadge({ k, size = 22, locked = false }) {
  const c = SUBJECT_COLOR[k] || '#0B7A4B'
  return <span className={'sbadge' + (locked ? ' locked' : '')} style={{ '--c': c }}><SubjectIcon k={k} size={size} /></span>
}
