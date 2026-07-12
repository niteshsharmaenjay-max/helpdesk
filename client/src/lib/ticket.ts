export type TicketStatus = 'OPEN' | 'RESOLVED' | 'CLOSED'
export type TicketCategory = 'GENERAL_QUESTION' | 'TECHNICAL_QUESTION' | 'REFUND_REQUEST'

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  GENERAL_QUESTION: 'General Question',
  TECHNICAL_QUESTION: 'Technical Question',
  REFUND_REQUEST: 'Refund Request',
}

export const TICKET_STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-500/10 text-blue-600',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600',
  CLOSED: 'bg-gray-100 text-gray-600',
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export const TICKET_CATEGORY_STYLE = 'bg-violet-500/10 text-violet-600'

// Derived from the records above rather than listed again, so there's a
// single source of truth for which statuses/categories exist.
export const TICKET_STATUSES = Object.keys(TICKET_STATUS_STYLES) as TicketStatus[]
export const TICKET_CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]
