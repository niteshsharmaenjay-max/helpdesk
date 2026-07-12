import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteUserModal } from './DeleteUserModal'

vi.mock('axios')

const mockedAxios = vi.mocked(axios)

const user = { id: '1', name: 'Ada Lovelace' }

function renderModal(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <DeleteUserModal user={user} onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    ),
  }
}

describe('DeleteUserModal', () => {
  beforeEach(() => {
    mockedAxios.delete.mockReset()
    vi.spyOn(axios, 'isAxiosError').mockImplementation(
      (error) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
    )
  })

  it('shows a confirmation prompt naming the user', () => {
    renderModal()

    expect(screen.getByRole('heading', { name: 'Delete user' })).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('does not call the delete API until confirmed', () => {
    renderModal()

    expect(mockedAxios.delete).not.toHaveBeenCalled()
  })

  it('closes without deleting when Cancel is clicked', () => {
    const { onOpenChange } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockedAxios.delete).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('deletes the user and closes the modal when confirmed', async () => {
    mockedAxios.delete.mockResolvedValue({})
    const { onOpenChange } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => {
      expect(mockedAxios.delete).toHaveBeenCalledWith('/api/users/1', { withCredentials: true })
    })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('shows an error and keeps the dialog open when deletion fails', async () => {
    mockedAxios.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: "Admin users can't be deleted" } },
    })
    const { onOpenChange } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText("Admin users can't be deleted")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('does not render a dialog when there is no user to delete', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DeleteUserModal user={null} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
