import { CheckCircle2, MessageSquare, Zap } from 'lucide-react'
import { Navigate } from 'react-router'
import { LoginForm } from '../components/LoginForm'
import { useSession } from '../lib/auth-client'

export function LoginPage() {
  const { data: session, isPending } = useSession()

  if (isPending) return <p className="p-8 text-center text-gray-500">Loading session...</p>
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:24px_24px]"
        />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Zap size={18} />
          </div>
          <span className="text-lg font-semibold">Helpdesk</span>
        </div>
        <div className="relative">
          <h2 className="mb-3 max-w-sm text-3xl font-bold leading-tight">Every ticket, handled with clarity.</h2>
          <p className="max-w-sm text-sm text-indigo-100/75">
            AI-assisted triage, replies, and routing so your team can focus on the conversations that matter.
          </p>
        </div>
        <div className="relative flex flex-col gap-3 text-sm text-indigo-100/75">
          <div className="flex items-center gap-2 [animation:login-float-1_6s_ease-in-out_infinite]">
            <MessageSquare size={16} />
            Smart reply suggestions
          </div>
          <div className="flex items-center gap-2 [animation:login-float-2_7s_ease-in-out_infinite]">
            <CheckCircle2 size={16} />
            Automatic categorization
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#0b0f19] p-6">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500 text-white">
              <Zap size={20} fill="white" />
            </div>
            <h1 className="text-xl font-bold text-white">Helpdesk</h1>
          </div>
          <h1 className="mb-1 hidden text-2xl font-bold text-white lg:block">Sign in</h1>
          <p className="mb-8 hidden text-sm text-gray-400 lg:block">Welcome back to your workspace.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
