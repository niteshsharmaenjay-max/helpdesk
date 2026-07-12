import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketDetailPage } from './TicketDetailPage'

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

function renderTicketDetailPage(id = 'ticket-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tickets/${id}`]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TicketDetailPage', () => {
  const baseTicket = {
    id: 'ticket-1',
    subject: 'Refund for order 42',
    fromEmail: 'customer@example.com',
    fromName: 'Curious Customer',
    status: 'OPEN' as const,
    category: 'REFUND_REQUEST' as const,
    aiSummary: null as string | null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    assignedTo: null,
    messages: [],
  }

  const agents = [
    { id: 'agent-1', name: 'Agent Smith', role: 'AGENT' },
    { id: 'agent-2', name: 'Agent Jones', role: 'AGENT' },
  ]

  // axios.get is called for both /api/tickets/:id and (for admins) /api/users
  // (to populate the assignee dropdown) — route by URL.
  function mockTicket(ticket: Record<string, unknown>) {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === '/api/users') return Promise.resolve({ data: { users: agents } })
      return Promise.resolve({ data: { ticket } })
    })
  }

  beforeEach(() => {
    mockedAxios.get.mockReset()
    mockedAxios.patch.mockReset()
    mockedAxios.post.mockReset()
    vi.spyOn(axios, 'isAxiosError').mockImplementation(
      (error) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
    )
  })

  it('shows a loading skeleton while the request is in flight', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}))

    renderTicketDetailPage()

    expect(screen.getByRole('link', { name: /Back to tickets/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders the ticket header and message thread once loaded', async () => {
    mockTicket({
      ...baseTicket,
      assignedTo: { id: 'agent-1', name: 'Agent Smith' },
      messages: [
        {
          id: 'm1',
          body: "I'd like a refund please.",
          fromEmail: 'customer@example.com',
          fromName: 'Curious Customer',
          isAgent: false,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
        {
          id: 'm2',
          body: 'Sure, processing that now.',
          fromEmail: 'agent@example.com',
          fromName: 'Agent Smith',
          isAgent: true,
          createdAt: '2026-01-15T01:00:00.000Z',
        },
      ],
    })

    renderTicketDetailPage('ticket-1')

    expect(await screen.findByRole('heading', { name: 'Refund for order 42' })).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
    expect(screen.getByText('Refund Request')).toBeInTheDocument()
    expect(screen.getByLabelText('Assigned to')).toHaveValue('agent-1')
    expect(screen.getAllByText('Agent Smith')).toHaveLength(2) // assignee option + message sender
    expect(screen.getByText("I'd like a refund please.")).toBeInTheDocument()
    expect(screen.getByText('Sure, processing that now.')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/tickets/ticket-1', { withCredentials: true })
  })

  it('shows an unassigned indicator when no agent is assigned', async () => {
    mockTicket({ ...baseTicket, category: 'GENERAL_QUESTION' })

    renderTicketDetailPage('ticket-1')

    expect(await screen.findByLabelText('Assigned to')).toHaveValue('')
  })

  it('shows a not-found message for a 404 response', async () => {
    mockedAxios.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: 'Ticket not found' } },
    })

    renderTicketDetailPage('missing-ticket')

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
  })

  it('shows a generic error message when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'))

    renderTicketDetailPage()

    expect(
      await screen.findByText("Couldn't load this ticket. Please try again."),
    ).toBeInTheDocument()
  })

  it('updates the status when a new value is selected', async () => {
    mockTicket(baseTicket)
    mockedAxios.patch.mockResolvedValue({ data: { ticket: { ...baseTicket, status: 'RESOLVED' } } })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'RESOLVED' } })

    await vi.waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/tickets/ticket-1',
        { status: 'RESOLVED' },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('RESOLVED'))
  })

  it('updates the category when a new value is selected', async () => {
    mockTicket(baseTicket)
    mockedAxios.patch.mockResolvedValue({
      data: { ticket: { ...baseTicket, category: 'TECHNICAL_QUESTION' } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TECHNICAL_QUESTION' } })

    await vi.waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/tickets/ticket-1',
        { category: 'TECHNICAL_QUESTION' },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('TECHNICAL_QUESTION'))
  })

  it('assigns the ticket to an agent when selected', async () => {
    mockTicket(baseTicket)
    mockedAxios.patch.mockResolvedValue({
      data: { ticket: { ...baseTicket, assignedTo: { id: 'agent-2', name: 'Agent Jones' } } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })
    expect(screen.getByLabelText('Assigned to')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Assigned to'), { target: { value: 'agent-2' } })

    await vi.waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/tickets/ticket-1',
        { assignedToId: 'agent-2' },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() => expect(screen.getByLabelText('Assigned to')).toHaveValue('agent-2'))
  })

  it('unassigns the ticket when "Unassigned" is selected', async () => {
    mockTicket({ ...baseTicket, assignedTo: { id: 'agent-1', name: 'Agent Smith' } })
    mockedAxios.patch.mockResolvedValue({ data: { ticket: { ...baseTicket, assignedTo: null } } })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })
    expect(screen.getByLabelText('Assigned to')).toHaveValue('agent-1')

    fireEvent.change(screen.getByLabelText('Assigned to'), { target: { value: '' } })

    await vi.waitFor(() =>
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/api/tickets/ticket-1',
        { assignedToId: null },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() => expect(screen.getByLabelText('Assigned to')).toHaveValue(''))
  })

  it('submits a reply and clears the textarea on success', async () => {
    mockTicket(baseTicket)
    const updatedTicket = {
      ...baseTicket,
      messages: [
        {
          id: 'm1',
          body: 'Thanks for reaching out, looking into it now.',
          fromEmail: 'admin@example.com',
          fromName: 'Admin',
          isAgent: true,
          createdAt: '2026-01-15T02:00:00.000Z',
        },
      ],
    }
    mockedAxios.post.mockResolvedValue({ data: { ticket: updatedTicket } })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    const textarea = screen.getByLabelText('Reply')
    fireEvent.change(textarea, { target: { value: 'Thanks for reaching out, looking into it now.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    await vi.waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/tickets/ticket-1/messages',
        { body: 'Thanks for reaching out, looking into it now.' },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() =>
      expect(screen.getByText('Thanks for reaching out, looking into it now.')).toBeInTheDocument(),
    )
    expect(textarea).toHaveValue('')
  })

  it('disables the send and polish buttons while the reply body is empty', async () => {
    mockTicket(baseTicket)

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Polish' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'Hello' } })
    expect(screen.getByRole('button', { name: 'Send reply' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Polish' })).not.toBeDisabled()
  })

  it('replaces the draft with the polished text on success', async () => {
    mockTicket(baseTicket)
    mockedAxios.post.mockResolvedValue({ data: { text: 'Thank you for reaching out — we appreciate your patience.' } })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    const textarea = screen.getByLabelText('Reply')
    fireEvent.change(textarea, { target: { value: 'thx for waiting we lookin into it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }))

    await vi.waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/tickets/ticket-1/polish-reply',
        { body: 'thx for waiting we lookin into it' },
        { withCredentials: true },
      ),
    )
    await vi.waitFor(() =>
      expect(textarea).toHaveValue('Thank you for reaching out — we appreciate your patience.'),
    )
  })

  it('shows an error message when polishing a reply fails', async () => {
    mockTicket(baseTicket)
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { error: "Couldn't polish the reply. Please try again." } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }))

    expect(
      await screen.findByText("Couldn't polish the reply. Please try again."),
    ).toBeInTheDocument()
    // The draft is left untouched so the agent doesn't lose their text.
    expect(screen.getByLabelText('Reply')).toHaveValue('Hello there')
  })

  it('shows an error message when sending a reply fails', async () => {
    mockTicket(baseTicket)
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: 'Failed to send reply' } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(
      await screen.findByText("Couldn't send the reply. Please try again."),
    ).toBeInTheDocument()
    // The textarea keeps the draft so the agent doesn't lose their reply.
    expect(screen.getByLabelText('Reply')).toHaveValue('Hello there')
  })

  it('shows "No summary yet." and a Summarize button when there is no summary', async () => {
    mockTicket(baseTicket)

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    expect(screen.getByText('No summary yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Summarize/ })).toBeInTheDocument()
  })

  it('generates and displays a summary, then offers to regenerate it', async () => {
    mockTicket(baseTicket)
    mockedAxios.post.mockResolvedValue({
      data: { ticket: { ...baseTicket, aiSummary: 'Customer wants a refund for order 42.' } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    await vi.waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/tickets/ticket-1/summarize',
        {},
        { withCredentials: true },
      ),
    )
    expect(await screen.findByText('Customer wants a refund for order 42.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regenerate summary/ })).toBeInTheDocument()
  })

  it('shows an error message when summarizing a ticket fails', async () => {
    mockTicket(baseTicket)
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { error: "Couldn't summarize the ticket. Please try again." } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(
      await screen.findByText("Couldn't summarize the ticket. Please try again."),
    ).toBeInTheDocument()
  })

  it('shows an error message when updating the ticket fails', async () => {
    mockTicket(baseTicket)
    mockedAxios.patch.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: 'Failed to update ticket' } },
    })

    renderTicketDetailPage('ticket-1')
    await screen.findByRole('heading', { name: 'Refund for order 42' })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CLOSED' } })

    expect(
      await screen.findByText("Couldn't update the ticket. Please try again."),
    ).toBeInTheDocument()
    // The select reverts to reflect the server's (unchanged) state.
    expect(screen.getByLabelText('Status')).toHaveValue('OPEN')
  })
})
