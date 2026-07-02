import { Link, useNavigate } from 'react-router'
import { signOut, useSession } from '../lib/auth-client'

export function NavBar() {
  const { data: session } = useSession()
  const navigate = useNavigate()

  if (!session) return null

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <span className="font-semibold text-gray-950">Helpdesk</span>
      <div className="flex items-center gap-3">
        {session.user.role === 'ADMIN' && (
          <Link
            to="/users"
            className="text-gray-950 hover:text-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Users
          </Link>
        )}
        <span className="text-gray-950">{session.user.name}</span>
        <button
          type="button"
          className="cursor-pointer rounded-md border-2 border-transparent bg-violet-500/10 px-3 py-1.5 font-[inherit] text-violet-500 transition-colors hover:border-violet-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
