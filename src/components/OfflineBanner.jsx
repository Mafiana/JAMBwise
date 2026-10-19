import { useExam } from '../context/ExamContext.jsx'
import { useOnline } from '../hooks.js'
import Icon from './Icons.jsx'

/** A slim strip at the top of the app when there is no connection, or results are waiting to sync. */
export default function OfflineBanner() {
  const online = useOnline()
  const { pending, syncPending } = useExam()
  if (online && !pending) return null
  return (
    <div className={'offline-bar' + (online ? ' sync' : '')} role="status">
      <Icon name={online ? 'upload' : 'offline'} size={16} />
      {online
        ? <span>Sending {pending} saved result{pending > 1 ? 's' : ''}…</span>
        : <span>You are offline. Practice and mocks still work with your saved questions{pending ? `, and ${pending} result${pending > 1 ? 's are' : ' is'} waiting to sync` : ''}.</span>}
      {online && <button className="btn ghost" onClick={syncPending}>Try now</button>}
    </div>
  )
}
