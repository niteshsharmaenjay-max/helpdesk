import { Zap } from 'lucide-react'
import { Navigate } from 'react-router'
import { LoginForm } from '../components/LoginForm'
import { useSession } from '../lib/auth-client'

export function LoginPage() {
  const { data: session, isPending } = useSession()

  if (isPending) return <p className="p-8 text-center text-gray-500">Loading session...</p>
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#f5f6fa] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] -left-[10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12)_0%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[10%] -bottom-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)]"
      />
      <div className="relative box-border w-[420px] max-w-full rounded-[10px] border border-black/6 bg-white/85 p-10 shadow-[0_10px_24px_rgba(0,0,0,0.06),0_4px_8px_rgba(0,0,0,0.04)] backdrop-blur-2xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-indigo-400 text-white shadow-[0_0_24px_rgba(99,102,241,0.15)]">
            <Zap size={26} fill="white" />
          </div>
          <h1 className="m-0 text-2xl font-bold tracking-tight text-gray-900">Helpdesk</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
