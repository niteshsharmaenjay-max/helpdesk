import axios from 'axios'
import type { TicketCategory, TicketStatus } from './ticket'

export type TicketAnalytics = {
  totalTickets: number
  statusCounts: Record<TicketStatus, number>
  categoryCounts: Record<TicketCategory, number>
  ticketsByDay: { date: string; count: number }[]
  agentWorkload: { agentId: string | null; agentName: string; openCount: number }[] | null
}

export async function fetchTicketAnalytics() {
  const { data } = await axios.get<TicketAnalytics>('/api/analytics/tickets', {
    withCredentials: true,
  })
  return data
}
