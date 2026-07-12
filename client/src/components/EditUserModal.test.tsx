import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditUserModal } from './EditUserModal'

vi.mock('axios')

const mockedAxios = vi.mocked(axios)

const user = { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'AGENT' as const }

function renderModal(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <EditUserModal user={user} onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    ),
  }
}

describe('EditUserModal', () => {
  beforeEach(() => {
    mockedAxios.patch.mockReset()
    vi.spyOn(axios, 'isAxiosError').mockImplementation(
      (error) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
    )
  })

  it('is prefilled with the user being edited', () => {
    renderModal()

    expect(screen.getByLabelText('Name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Role')).toHaveValue('AGENT')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('submits without a password when the password field is left blank', async () => {
    mockedAxios.patch.mockResolvedValue({
      data: { user: { ...user, name: 'Ada L.' } },
    })
    const { onOpenChange } = renderModal()

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada L.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => {
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/users/1',
        { name: 'Ada L.', email: 'ada@example.com', role: 'AGENT', password: '' },
        { withCredentials: true },
      )
    })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('submits the new password when one is provided', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { user } })
    renderModal()

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => {
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/users/1',
        { name: 'Ada Lovelace', email: 'ada@example.com', role: 'AGENT', password: 'newpassword123' },
        { withCredentials: true },
      )
    })
  })

  it('shows a validation error for a too-short password instead of submitting', async () => {
    renderModal()

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(mockedAxios.patch).not.toHaveBeenCalled()
  })

  it('shows an inline error and keeps the modal open on duplicate email', async () => {
    mockedAxios.patch.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'A user with this email already exists' } },
    })
    const { onOpenChange } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('does not render a dialog when there is no user to edit', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EditUserModal user={null} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
