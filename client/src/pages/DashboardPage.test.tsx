import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

vi.mock('axios')

let mockRole: 'ADMIN' | 'AGENT' = 'ADMIN'

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({
    data: {
      user: { id: '1', name: 'Admin', email: 'admin@example.com', role: mockRole },
    },
  }),
  signOut: vi.fn(),
}))

const mockedAxios = vi.mocked(axios)

const ANALYTICS_RESPONSE = {
  totalTickets: 12,
  statusCounts: { OPEN: 5, RESOLVED: 4, CLOSED: 3 },
  categoryCounts: { GENERAL_QUESTION: 6, TECHNICAL_QUESTION: 4, REFUND_REQUEST: 2 },
  ticketsByDay: [
    { date: '2026-07-01', count: 1 },
    { date: '2026-07-02', count: 2 },
  ],
  agentWorkload: [{ agentId: 'a1', agentName: 'Grace Hopper', openCount: 3 }],
}

// recharts' ResponsiveContainer measures its container via ResizeObserver,
// which happy-dom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

function renderDashboardPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset()
    mockRole = 'ADMIN'
  })

  it('shows a loading skeleton while the request is in flight', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}))

    renderDashboardPage()

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByText('Total tickets')).not.toBeInTheDocument()
  })

  it('renders stat tiles and the agent workload chart for an admin', async () => {
    mockedAxios.get.mockResolvedValue({ data: ANALYTICS_RESPONSE })

    renderDashboardPage()

    expect(await screen.findByText('Total tickets')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open tickets by agent' })).toBeInTheDocument()
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/analytics/tickets', { withCredentials: true })
  })

  it('hides the agent workload chart for an agent', async () => {
    mockRole = 'AGENT'
    mockedAxios.get.mockResolvedValue({
      data: { ...ANALYTICS_RESPONSE, agentWorkload: null },
    })

    renderDashboardPage()

    expect(await screen.findByText('Total tickets')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Open tickets by agent' })).not.toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network error'))

    renderDashboardPage()

    expect(
      await screen.findByText("Couldn't load ticket analytics. Please try again."),
    ).toBeInTheDocument()
  })
})
