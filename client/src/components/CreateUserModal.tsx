import axios from 'axios'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Mail, User as UserIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

const createUserSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type CreateUserValues = z.infer<typeof createUserSchema>

type CreateUserModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function createUser(values: CreateUserValues) {
  const { data } = await axios.post('/api/users', values, { withCredentials: true })
  return data.user
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return error.response.data?.error ?? 'Failed to create user'
    return "Couldn't reach the server. Check your connection and try again."
  }
  return 'Failed to create user'
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserValues>({ resolver: zodResolver(createUserSchema) })

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      reset()
      onOpenChange(false)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setError('email', { message: error.response.data?.error ?? 'A user with this email already exists' })
        return
      }
    },
  })

  const genericError =
    mutation.isError && !(axios.isAxiosError(mutation.error) && mutation.error.response?.status === 409)
      ? getErrorMessage(mutation.error)
      : null

  const onSubmit = (values: CreateUserValues) => mutation.mutate(values)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const inputGroupBase =
    'flex items-center gap-2 rounded-md border bg-[#eeeff3] px-3.5 py-2.5 transition-all focus-within:ring-4'
  const inputGroupValid = 'border-black/6 focus-within:border-indigo-500 focus-within:ring-indigo-500/20'
  const inputGroupInvalid = 'border-red-500 focus-within:ring-red-500/20'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="create-user-name" className="mb-1.5 block text-xs font-medium text-gray-500">
              Name
            </label>
            <div className={`${inputGroupBase} ${errors.name ? inputGroupInvalid : inputGroupValid}`}>
              <UserIcon size={16} className="shrink-0 text-gray-400" />
              <input
                id="create-user-name"
                placeholder="Jane Doe"
                type="text"
                autoComplete="off"
                aria-invalid={errors.name ? 'true' : 'false'}
                className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                {...register('name')}
              />
            </div>
            {errors.name && <p className="m-0 mt-1.5 text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="create-user-email" className="mb-1.5 block text-xs font-medium text-gray-500">
              Email
            </label>
            <div className={`${inputGroupBase} ${errors.email ? inputGroupInvalid : inputGroupValid}`}>
              <Mail size={16} className="shrink-0 text-gray-400" />
              <input
                id="create-user-email"
                placeholder="you@company.com"
                type="email"
                autoComplete="off"
                aria-invalid={errors.email ? 'true' : 'false'}
                className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="m-0 mt-1.5 text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="create-user-password" className="mb-1.5 block text-xs font-medium text-gray-500">
              Password
            </label>
            <div className={`${inputGroupBase} ${errors.password ? inputGroupInvalid : inputGroupValid}`}>
              <Lock size={16} className="shrink-0 text-gray-400" />
              <input
                id="create-user-password"
                placeholder="••••••••"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? 'true' : 'false'}
                className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                {...register('password')}
              />
            </div>
            {errors.password && <p className="m-0 mt-1.5 text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={mutation.isPending} className="mt-1 w-full">
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
          {genericError && (
            <p className="m-0 text-center text-[13px] text-red-500" role="alert">
              {genericError}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
