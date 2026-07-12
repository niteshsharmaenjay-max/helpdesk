import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketsPage } from './TicketsPage'

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

function renderTicketsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// axios.get is called for both /api/tickets and (for admins) /api/users —
// route by URL so each test only has to describe the tickets response.
function mockTickets(tickets: Record<string, unknown>[]) {
  mockedAxios.get.mockImplementation((url: string) => {
    if (url === '/api/users') return Promise.resolve({ data: { users: [] } })
    return Promise.resolve({ data: { tickets, total: tickets.length } })
  })
}

describe('TicketsPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset()
  })

  it('shows a loading skeleton while the request is in flight', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}))

    renderTicketsPage()

    expect(screen.getByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders the ticket list once loaded, newest first as returned by the API', async () => {
    mockTickets([
      {
        id: 'newest',
        subject: 'Refund for order 42',
        fromEmail: 'newest@example.com',
        fromName: 'Newest Customer',
        status: 'OPEN',
        category: 'REFUND_REQUEST',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        assignedTo: null,
      },
      {
        id: 'oldest',
        subject: 'How do I reset my password',
        fromEmail: 'oldest@example.com',
        fromName: 'Oldest Customer',
        status: 'RESOLVED',
        category: 'GENERAL_QUESTION',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assignedTo: { id: 'agent-1', name: 'Agent Smith' },
      },
    ])

    renderTicketsPage()

    expect(await screen.findByText('Refund for order 42')).toBeInTheDocument()
    expect(screen.getByText('How do I reset my password')).toBeInTheDocument()
    expect(screen.getByText('Agent Smith')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Unassigned')).toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Refund for order 42')
    expect(rows[1]).toHaveTextContent('How do I reset my password')

    expect(screen.getByRole('link', { name: 'Refund for order 42' })).toHaveAttribute(
      'href',
      '/tickets/newest',
    )
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/tickets', {
      withCredentials: true,
      params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 20 },
    })
  })

  it('sorts on the server: clicking a column header re-requests with that column, then toggles direction on a second click', async () => {
    mockTickets([
      {
        id: '1',
        subject: 'A ticket',
        fromEmail: 'customer@example.com',
        fromName: 'A Customer',
        status: 'OPEN',
        category: 'GENERAL_QUESTION',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assignedTo: null,
      },
    ])

    renderTicketsPage()
    await screen.findByText('A ticket')

    // Re-querying for the header between clicks matters: sorting into a
    // never-seen-before query key briefly shows the loading skeleton
    // (which has no headers), so a plain synchronous re-query would race it.
    const callsBeforeFirstClick = mockedAxios.get.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: /Subject/ }))
    await vi.waitFor(() =>
      expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBeforeFirstClick),
    )
    expect(mockedAxios.get.mock.calls.at(-1)?.[1]?.params).toEqual({
      sortBy: 'subject',
      sortOrder: 'asc',
      page: 1,
      pageSize: 20,
    })

    const callsBeforeSecondClick = mockedAxios.get.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: /Subject/ }))
    await vi.waitFor(() =>
      expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBeforeSecondClick),
    )
    expect(mockedAxios.get.mock.calls.at(-1)?.[1]?.params).toEqual({
      sortBy: 'subject',
      sortOrder: 'desc',
      page: 1,
      pageSize: 20,
    })
  })

  it('filters on the server: changing the status filter re-requests with that status and resets to page 1', async () => {
    mockTickets([
      {
        id: '1',
        subject: 'A ticket',
        fromEmail: 'customer@example.com',
        fromName: 'A Customer',
        status: 'OPEN',
        category: 'GENERAL_QUESTION',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assignedTo: null,
      },
    ])

    renderTicketsPage()
    await screen.findByText('A ticket')

    const callsBefore = mockedAxios.get.mock.calls.length
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'RESOLVED' } })
    await vi.waitFor(() => expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBefore))

    const ticketsCall = mockedAxios.get.mock.calls.filter((call) => call[0] === '/api/tickets').at(-1)
    expect(ticketsCall?.[1]?.params).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: 'RESOLVED',
      page: 1,
      pageSize: 20,
    })
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('debounces the subject search before requesting the server', async () => {
    mockTickets([
      {
        id: '1',
        subject: 'A ticket',
        fromEmail: 'customer@example.com',
        fromName: 'A Customer',
        status: 'OPEN',
        category: 'GENERAL_QUESTION',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assignedTo: null,
      },
    ])

    renderTicketsPage()
    await screen.findByText('A ticket')

    const callsBefore = mockedAxios.get.mock.calls.length
    fireEvent.change(screen.getByLabelText('Search by subject'), { target: { value: 'refund' } })

    // Debounced — no request fires on the immediate keystroke.
    expect(mockedAxios.get.mock.calls.length).toBe(callsBefore)

    await vi.waitFor(
      () => expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBefore),
      { timeout: 1000 },
    )
    const ticketsCall = mockedAxios.get.mock.calls.filter((call) => call[0] === '/api/tickets').at(-1)
    expect(ticketsCall?.[1]?.params).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: 'refund',
      page: 1,
      pageSize: 20,
    })
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('clears all filters when "Clear filters" is clicked', async () => {
    mockTickets([
      {
        id: '1',
        subject: 'A ticket',
        fromEmail: 'customer@example.com',
        fromName: 'A Customer',
        status: 'OPEN',
        category: 'GENERAL_QUESTION',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        assignedTo: null,
      },
    ])

    renderTicketsPage()
    await screen.findByText('A ticket')

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TECHNICAL_QUESTION' } })
    fireEvent.change(screen.getByLabelText('Search by subject'), { target: { value: 'refund' } })
    const clearButton = await screen.findByRole('button', { name: 'Clear filters' })

    const callsBefore = mockedAxios.get.mock.calls.length
    fireEvent.click(clearButton)
    await vi.waitFor(() => expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBefore))

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search by subject')).toHaveValue('')
    const ticketsCall = mockedAxios.get.mock.calls.filter((call) => call[0] === '/api/tickets').at(-1)
    expect(ticketsCall?.[1]?.params).toEqual({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 20 })
  })

  it('paginates on the server: clicking Next requests page 2', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === '/api/users') return Promise.resolve({ data: { users: [] } })
      return Promise.resolve({
        data: {
          tickets: [
            {
              id: '1',
              subject: 'A ticket',
              fromEmail: 'customer@example.com',
              fromName: 'A Customer',
              status: 'OPEN',
              category: 'GENERAL_QUESTION',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              assignedTo: null,
            },
          ],
          total: 25,
        },
      })
    })

    renderTicketsPage()
    await screen.findByText('A ticket')

    expect(await screen.findByText('Page 1 of 2 (25 tickets)')).toBeInTheDocument()

    const callsBefore = mockedAxios.get.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    await vi.waitFor(() => expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(callsBefore))

    const ticketsCall = mockedAxios.get.mock.calls.filter((call) => call[0] === '/api/tickets').at(-1)
    expect(ticketsCall?.[1]?.params).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 2,
      pageSize: 20,
    })
  })

  it('shows an empty state when there are no tickets', async () => {
    mockTickets([])

    renderTicketsPage()

    expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'))

    renderTicketsPage()

    expect(
      await screen.findByText("Couldn't load tickets. Please try again."),
    ).toBeInTheDocument()
  })
})
