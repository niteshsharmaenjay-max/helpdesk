import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateUserModal } from './CreateUserModal'

vi.mock('axios')

const mockedAxios = vi.mocked(axios)

function renderModal(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CreateUserModal open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    ),
  }
}

function fillForm({
  name = 'Ada Lovelace',
  email = 'ada@example.com',
  password = 'password123',
}: { name?: string; email?: string; password?: string } = {}) {
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } })
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: password } })
}

describe('CreateUserModal', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset()
    vi.spyOn(axios, 'isAxiosError').mockImplementation(
      (error) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
    )
  })

  it('shows validation errors and does not submit when fields are invalid', async () => {
    renderModal()

    fillForm({ name: 'Ab', password: 'short' })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('submits the form and closes the modal on success', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { user: { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'AGENT' } },
    })
    const { onOpenChange } = renderModal()

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await vi.waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/users',
        { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' },
        { withCredentials: true },
      )
    })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('shows an inline error and keeps the modal open on duplicate email', async () => {
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'A user with this email already exists' } },
    })
    const { onOpenChange } = renderModal()

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('disables the submit button while the request is pending', async () => {
    mockedAxios.post.mockReturnValue(new Promise(() => {}))
    renderModal()

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
  })

  it('shows a distinct message when the server cannot be reached, not a generic failure', async () => {
    mockedAxios.post.mockRejectedValue({ isAxiosError: true, response: undefined })
    renderModal()

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(screen.queryByText('Failed to create user')).not.toBeInTheDocument()
  })
})
