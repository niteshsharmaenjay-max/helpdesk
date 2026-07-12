import axios from 'axios'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { NavBar } from '../components/NavBar'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { CreateUserModal } from '../components/CreateUserModal'
import { EditUserModal } from '../components/EditUserModal'
import { DeleteUserModal } from '../components/DeleteUserModal'

type User = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
  emailVerified: boolean
  createdAt: string
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

async function fetchUsers() {
  const { data } = await axios.get<{ users: User[] }>('/api/users', {
    withCredentials: true,
  })
  return data.users
}

export function UsersPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const {
    data: users = [],
    isPending,
    isError,
  } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })

  return (
    <>
      <NavBar />
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8 max-md:px-5 max-md:py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-medium tracking-[-1.2px] text-gray-950 max-md:text-3xl">
            Users
          </h1>
          <Button onClick={() => setIsCreateModalOpen(true)}>Create user</Button>
        </div>
        <CreateUserModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
        <EditUserModal
          user={editingUser}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null)
          }}
        />
        <DeleteUserModal
          user={deletingUser}
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null)
          }}
        />

        {isPending && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-8 h-4 w-40" />
              <Skeleton className="ml-8 h-4 w-16" />
              <Skeleton className="ml-8 h-4 w-20" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-8 h-4 w-44" />
                <Skeleton className="ml-8 h-5 w-14 rounded-full" />
                <Skeleton className="ml-8 h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {isError && <p className="text-red-600">Couldn't load users. Please try again.</p>}

        {!isPending &&
          !isError &&
          (users.length === 0 ? (
            <p className="text-gray-500">No users found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-950">{user.name}</td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            user.role === 'ADMIN'
                              ? 'inline-flex rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-600'
                              : 'inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600'
                          }
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {dateFormatter.format(new Date(user.createdAt))}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${user.name}`}
                          onClick={() => setEditingUser(user)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            user.role === 'ADMIN' ? "Admin users can't be deleted" : `Delete ${user.name}`
                          }
                          disabled={user.role === 'ADMIN'}
                          title={user.role === 'ADMIN' ? "Admin users can't be deleted" : undefined}
                          className="text-red-500 hover:bg-red-50 hover:text-red-600 disabled:text-gray-300"
                          onClick={() => setDeletingUser(user)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </>
  )
}
