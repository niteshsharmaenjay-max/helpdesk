import axios from 'axios'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
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

const editUserSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  role: z.enum(['ADMIN', 'AGENT']),
  password: z.union([z.string().min(8, 'Password must be at least 8 characters'), z.literal('')]),
})

type EditUserValues = z.infer<typeof editUserSchema>

type EditUserModalProps = {
  user: { id: string; name: string; email: string; role: 'ADMIN' | 'AGENT' } | null
  onOpenChange: (open: boolean) => void
}

async function updateUser(id: string, values: EditUserValues) {
  const { data } = await axios.patch(`/api/users/${id}`, values, { withCredentials: true })
  return data.user
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return error.response.data?.error ?? 'Failed to update user'
    return "Couldn't reach the server. Check your connection and try again."
  }
  return 'Failed to update user'
}

export function EditUserModal({ user, onOpenChange }: EditUserModalProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EditUserValues>({ resolver: zodResolver(editUserSchema) })

  useEffect(() => {
    if (user) reset({ name: user.name, email: user.email, role: user.role, password: '' })
  }, [user, reset])

  const mutation = useMutation({
    mutationFn: (values: EditUserValues) => updateUser(user!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
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

  const onSubmit = (values: EditUserValues) => mutation.mutate(values)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset()
    onOpenChange(nextOpen)
  }

  const inputGroupBase =
    'flex items-center gap-2 rounded-md border bg-[#eeeff3] px-3.5 py-2.5 transition-all focus-within:ring-4'
  const inputGroupValid = 'border-black/6 focus-within:border-indigo-500 focus-within:ring-indigo-500/20'
  const inputGroupInvalid = 'border-red-500 focus-within:ring-red-500/20'

  return (
    <Dialog open={user !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="edit-user-name" className="mb-1.5 block text-xs font-medium text-gray-500">
              Name
            </label>
            <div className={`${inputGroupBase} ${errors.name ? inputGroupInvalid : inputGroupValid}`}>
              <UserIcon size={16} className="shrink-0 text-gray-400" />
              <input
                id="edit-user-name"
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
            <label htmlFor="edit-user-email" className="mb-1.5 block text-xs font-medium text-gray-500">
              Email
            </label>
            <div className={`${inputGroupBase} ${errors.email ? inputGroupInvalid : inputGroupValid}`}>
              <Mail size={16} className="shrink-0 text-gray-400" />
              <input
                id="edit-user-email"
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
            <label htmlFor="edit-user-role" className="mb-1.5 block text-xs font-medium text-gray-500">
              Role
            </label>
            <div className={`${inputGroupBase} ${errors.role ? inputGroupInvalid : inputGroupValid}`}>
              <select
                id="edit-user-role"
                aria-invalid={errors.role ? 'true' : 'false'}
                className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none"
                {...register('role')}
              >
                <option value="AGENT">AGENT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            {errors.role && <p className="m-0 mt-1.5 text-xs text-red-500">{errors.role.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-user-password" className="mb-1.5 block text-xs font-medium text-gray-500">
              Password
            </label>
            <div className={`${inputGroupBase} ${errors.password ? inputGroupInvalid : inputGroupValid}`}>
              <Lock size={16} className="shrink-0 text-gray-400" />
              <input
                id="edit-user-password"
                placeholder="Leave blank to keep current password"
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
            {mutation.isPending ? 'Saving…' : 'Save'}
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
