import axios from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

type DeleteUserModalProps = {
  user: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}

async function deleteUser(id: string) {
  await axios.delete(`/api/users/${id}`, { withCredentials: true })
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return error.response.data?.error ?? 'Failed to delete user'
    return "Couldn't reach the server. Check your connection and try again."
  }
  return 'Failed to delete user'
}

export function DeleteUserModal({ user, onOpenChange }: DeleteUserModalProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteUser(user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
    },
  })

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={user !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{user?.name}</strong>? They will lose access
            immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
        {mutation.isError && (
          <p className="m-0 text-center text-[13px] text-red-500" role="alert">
            {getErrorMessage(mutation.error)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
