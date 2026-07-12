import { Link, useLocation, useNavigate } from 'react-router'
import { signOut, useSession } from '../lib/auth-client'

const NAV_LINK_BASE =
  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500'
const NAV_LINK_ACTIVE = 'bg-violet-500/10 text-violet-600'
const NAV_LINK_INACTIVE = 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'

function NavLink({ to, children }: { to: string; children: string }) {
  const { pathname } = useLocation()
  const isActive = pathname === to
  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`}
    >
      {children}
    </Link>
  )
}

export function NavBar() {
  const { data: session } = useSession()
  const navigate = useNavigate()

  if (!session) return null

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link
        to="/"
        className="font-semibold text-gray-950 hover:text-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
      >
        Helpdesk
      </Link>
      <div className="flex items-center gap-1">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/tickets">Tickets</NavLink>
        {session.user.role === 'ADMIN' && <NavLink to="/users">Users</NavLink>}
        <span className="ml-2 text-gray-950">{session.user.name}</span>
        <button
          type="button"
          className="ml-1 cursor-pointer rounded-md border-2 border-transparent bg-violet-500/10 px-3 py-1.5 font-[inherit] text-violet-500 transition-colors hover:border-violet-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
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
