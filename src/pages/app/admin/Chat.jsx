import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'
import StaffChat from './StaffChat.jsx'

/** The teacher's side of the chat: one conversation with the admins. (Admins chat from the Teachers page.) */
export default function Chat() {
  const { user, isAdmin } = useAuth()
  if (isAdmin) return <Navigate to="/app/admin/teachers" replace />
  return (
    <>
      <h2>Chat with admin</h2>
      <p className="sm">Messages here go to the admins. You will see their replies in this chat and on your bell.</p>
      <div className="card"><StaffChat teacherId={user.id} markLink="/app/admin/chat" /></div>
    </>
  )
}
