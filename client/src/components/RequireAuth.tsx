import type { ReactElement } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../lib/auth-client'

export function RequireAuth({
  children,
  role,
}: {
  children: ReactElement
  role?: 'ADMIN' | 'AGENT'
}) {
  const { data: session, isPending } = useSession()

  if (isPending) return <p className="p-8 text-center text-gray-500">Loading session...</p>
  if (!session) return <Navigate to="/login" replace />
  if (role && session.user.role !== role) return <Navigate to="/" replace />

  return children
}
