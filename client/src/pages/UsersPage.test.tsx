import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersPage } from './UsersPage'

vi.mock('axios')

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({
    data: {
      user: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' },
    },
  }),
  signOut: vi.fn(),
}))

const mockedAxios = vi.mocked(axios)

function renderUsersPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UsersPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset()
  })

  it('shows a loading skeleton while the request is in flight', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}))

    renderUsersPage()

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders the user list once loaded', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        users: [
          {
            id: '1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
          {
            id: '2',
            name: 'Grace Hopper',
            email: 'grace@example.com',
            role: 'AGENT',
            emailVerified: false,
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      },
    })

    renderUsersPage()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('grace@example.com')).toBeInTheDocument()
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText('AGENT')).toBeInTheDocument()
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/users', { withCredentials: true })
  })

  it('shows an empty state when there are no users', async () => {
    mockedAxios.get.mockResolvedValue({ data: { users: [] } })

    renderUsersPage()

    expect(await screen.findByText('No users found.')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'))

    renderUsersPage()

    expect(
      await screen.findByText("Couldn't load users. Please try again."),
    ).toBeInTheDocument()
  })

  it('opens the create user modal when the button is clicked', async () => {
    mockedAxios.get.mockResolvedValue({ data: { users: [] } })

    renderUsersPage()
    await screen.findByText('No users found.')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create user' })).toBeInTheDocument()
  })

  it('opens the edit user modal prefilled with the selected user when the edit button is clicked', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        users: [
          {
            id: '1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        ],
      },
    })

    renderUsersPage()
    await screen.findByText('Ada Lovelace')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit user' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
  })

  it('opens the delete confirmation modal when the delete button is clicked for a non-admin user', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        users: [
          {
            id: '2',
            name: 'Grace Hopper',
            email: 'grace@example.com',
            role: 'AGENT',
            emailVerified: false,
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      },
    })

    renderUsersPage()
    await screen.findByText('Grace Hopper')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Grace Hopper' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Delete user' })).toBeInTheDocument()
  })

  it('disables the delete button for admin users', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        users: [
          {
            id: '1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'ADMIN',
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        ],
      },
    })

    renderUsersPage()
    await screen.findByText('Ada Lovelace')

    expect(screen.getByRole('button', { name: "Admin users can't be deleted" })).toBeDisabled()
  })
})
