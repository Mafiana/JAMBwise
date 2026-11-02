import Icon from './Icons.jsx'

const LOOK = { free: ['user', 'Free'], student: ['book', 'Student'], pro: ['crown', 'Pro'] }

/** A small badge with an icon for a plan: Free, Student or Pro. */
export default function PlanBadge({ plan }) {
  const [icon, label] = LOOK[plan] || ['user', String(plan || 'Free')]
  return <span className={'plan-badge pb-' + (LOOK[plan] ? plan : 'free')}><Icon name={icon} size={14} />{label}</span>
}
