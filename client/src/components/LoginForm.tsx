import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { signIn } from '../lib/auth-client'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async ({ email, password }: LoginValues) => {
    setFormError(null)
    const { error: signInError } = await signIn.email({ email, password })
    if (signInError) {
      setFormError(signInError.message ?? 'Sign in failed')
      return
    }
    navigate('/dashboard')
  }

  const inputGroupBase =
    'flex items-center gap-2 rounded-md border bg-[#151a26] px-3.5 py-2.5 transition-all focus-within:ring-4'
  const inputGroupValid = 'border-white/12 focus-within:border-indigo-400 focus-within:ring-indigo-500/20'
  const inputGroupInvalid = 'border-red-500/60 focus-within:ring-red-500/20'

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-gray-400">
          Email
        </label>
        <div className={`${inputGroupBase} ${errors.email ? inputGroupInvalid : inputGroupValid}`}>
          <Mail size={16} className="shrink-0 text-gray-500" />
          <input
            id="email"
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? 'true' : 'false'}
            className="flex-1 border-none bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
            {...register('email')}
          />
        </div>
        {errors.email && <p className="m-0 mt-1.5 text-xs text-red-400">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-gray-400">
          Password
        </label>
        <div className={`${inputGroupBase} ${errors.password ? inputGroupInvalid : inputGroupValid}`}>
          <Lock size={16} className="shrink-0 text-gray-500" />
          <input
            id="password"
            placeholder="••••••••"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            className="flex-1 border-none bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
            {...register('password')}
          />
          <button
            type="button"
            tabIndex={-1}
            className="flex shrink-0 cursor-pointer border-none bg-transparent p-0 text-gray-500 hover:text-gray-300"
            onClick={() => setShowPassword((show) => !show)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="m-0 mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
      </div>
      <button
        className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-indigo-500 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isSubmitting}
      >
        <LogIn size={18} />
        Sign in
      </button>
      {formError && (
        <p className="m-0 text-center text-[13px] text-red-400" role="alert">
          {formError}
        </p>
      )}
    </form>
  )
}
