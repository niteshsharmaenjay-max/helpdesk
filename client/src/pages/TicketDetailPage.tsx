import { useState, type FormEvent } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { NavBar } from '../components/NavBar'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { useSession } from '../lib/auth-client'
import { fetchAgents } from '../lib/agents'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_STYLE,
  TICKET_STATUSES,
  TICKET_STATUS_STYLES,
} from '../lib/ticket'
import type { TicketCategory, TicketStatus } from '../lib/ticket'

type Message = {
  id: string
  body: string
  fromEmail: string
  fromName: string
  isAgent: boolean
  createdAt: string
}

type TicketDetail = {
  id: string
  subject: string
  fromEmail: string
  fromName: string
  status: TicketStatus
  category: TicketCategory
  aiSummary: string | null
  createdAt: string
  updatedAt: string
  assignedTo: { id: string; name: string } | null
  messages: Message[]
}

type TicketUpdate = { status?: TicketStatus; category?: TicketCategory; assignedToId?: string | null }

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

async function fetchTicket(id: string) {
  try {
    const { data } = await axios.get<{ ticket: TicketDetail }>(`/api/tickets/${id}`, {
      withCredentials: true,
    })
    return data.ticket
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

async function updateTicket(id: string, updates: TicketUpdate) {
  const { data } = await axios.patch<{ ticket: TicketDetail }>(`/api/tickets/${id}`, updates, {
    withCredentials: true,
  })
  return data.ticket
}

async function replyToTicket(id: string, body: string) {
  const { data } = await axios.post<{ ticket: TicketDetail }>(
    `/api/tickets/${id}/messages`,
    { body },
    { withCredentials: true },
  )
  return data.ticket
}

async function polishReply(id: string, body: string) {
  const { data } = await axios.post<{ text: string }>(
    `/api/tickets/${id}/polish-reply`,
    { body },
    { withCredentials: true },
  )
  return data.text
}

async function summarizeTicket(id: string) {
  const { data } = await axios.post<{ ticket: TicketDetail }>(
    `/api/tickets/${id}/summarize`,
    {},
    { withCredentials: true },
  )
  return data.ticket
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isAdmin = session?.user.role === 'ADMIN'
  const [replyBody, setReplyBody] = useState('')

  const {
    data: ticket,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => fetchTicket(id!),
    enabled: Boolean(id),
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['users', 'agents'],
    queryFn: fetchAgents,
    enabled: isAdmin,
  })

  const mutation = useMutation({
    mutationFn: (updates: TicketUpdate) => updateTicket(id!, updates),
    onSuccess: (updatedTicket) => {
      // Set this ticket's own cache entry directly (no need to await a
      // refetch of it), but invalidate the ticket *list* queries — keyed
      // as ['tickets', sorting, filters, pagination] — so the list reflects
      // the new status/category next time it's viewed.
      queryClient.setQueryData(['tickets', id], updatedTicket)
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'tickets' && query.queryKey[1] !== id,
      })
    },
  })

  const replyMutation = useMutation({
    mutationFn: (body: string) => replyToTicket(id!, body),
    onSuccess: (updatedTicket) => {
      queryClient.setQueryData(['tickets', id], updatedTicket)
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'tickets' && query.queryKey[1] !== id,
      })
      setReplyBody('')
    },
  })

  const handleReplySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = replyBody.trim()
    if (!trimmed) return
    replyMutation.mutate(trimmed)
  }

  const polishMutation = useMutation({
    mutationFn: (body: string) => polishReply(id!, body),
    onSuccess: (polishedText) => setReplyBody(polishedText),
  })

  const handlePolishClick = () => {
    const trimmed = replyBody.trim()
    if (!trimmed) return
    polishMutation.mutate(trimmed)
  }

  const summarizeMutation = useMutation({
    mutationFn: () => summarizeTicket(id!),
    onSuccess: (updatedTicket) => {
      queryClient.setQueryData(['tickets', id], updatedTicket)
    },
  })

  return (
    <>
      <NavBar />
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8 max-md:px-5 max-md:py-8">
        <Link
          to="/tickets"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-600 hover:text-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          <ArrowLeft size={14} />
          Back to tickets
        </Link>

        {isPending && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {isError && <p className="text-red-600">Couldn't load this ticket. Please try again.</p>}

        {!isPending && !isError && ticket === null && <p className="text-gray-500">Ticket not found.</p>}

        {ticket && (
          <>
            <div className="flex flex-col gap-3 border-b border-gray-200 pb-6">
              <h1 className="text-3xl font-medium tracking-[-1px] text-gray-950 max-md:text-2xl">
                {ticket.subject}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <label>
                  <span className="sr-only">Status</span>
                  <select
                    value={ticket.status}
                    onChange={(event) => mutation.mutate({ status: event.target.value as TicketStatus })}
                    disabled={mutation.isPending}
                    className={`rounded-full border-none px-2.5 py-0.5 text-xs font-medium outline-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${TICKET_STATUS_STYLES[ticket.status]}`}
                  >
                    {TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Category</span>
                  <select
                    value={ticket.category}
                    onChange={(event) => mutation.mutate({ category: event.target.value as TicketCategory })}
                    disabled={mutation.isPending}
                    className={`rounded-full border-none px-2.5 py-0.5 text-xs font-medium outline-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${TICKET_CATEGORY_STYLE}`}
                  >
                    {TICKET_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {TICKET_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {mutation.isError && (
                <p className="m-0 text-xs text-red-600" role="alert">
                  Couldn't update the ticket. Please try again.
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-gray-600">
                <dt className="text-gray-400">From</dt>
                <dd>
                  {ticket.fromName} <span className="text-gray-400">&lt;{ticket.fromEmail}&gt;</span>
                </dd>
                <dt className="text-gray-400">Assigned to</dt>
                <dd>
                  {isAdmin ? (
                    <label>
                      <span className="sr-only">Assigned to</span>
                      <select
                        value={ticket.assignedTo?.id ?? ''}
                        onChange={(event) =>
                          mutation.mutate({ assignedToId: event.target.value || null })
                        }
                        disabled={mutation.isPending}
                        className="rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-gray-950 outline-none disabled:opacity-60 focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                      >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    (ticket.assignedTo?.name ?? <span className="text-gray-400">Unassigned</span>)
                  )}
                </dd>
                <dt className="text-gray-400">Created</dt>
                <dd>{dateTimeFormatter.format(new Date(ticket.createdAt))}</dd>
              </dl>
            </div>

            <ol className="flex flex-col gap-4">
              {ticket.messages.map((message) => (
                <li
                  key={message.id}
                  className={`rounded-lg border p-4 ${
                    message.isAgent ? 'border-violet-200 bg-violet-500/5' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-950">
                      {message.fromName}
                      {message.isAgent ? (
                        <span className="ml-1.5 inline-flex rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                          Agent
                        </span>
                      ) : (
                        <span className="ml-1.5 inline-flex rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          Customer
                        </span>
                      )}
                    </span>
                    <span>{dateTimeFormatter.format(new Date(message.createdAt))}</span>
                  </div>
                  <p className="m-0 whitespace-pre-wrap text-sm text-gray-950">{message.body}</p>
                </li>
              ))}
            </ol>

            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-gray-950">Conversation summary</h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => summarizeMutation.mutate()}
                  disabled={summarizeMutation.isPending}
                  className="w-fit"
                >
                  <Sparkles size={14} />
                  {summarizeMutation.isPending
                    ? 'Summarizing…'
                    : ticket.aiSummary
                      ? 'Regenerate summary'
                      : 'Summarize'}
                </Button>
              </div>
              {summarizeMutation.isError && (
                <p className="m-0 text-xs text-red-600" role="alert">
                  Couldn't summarize the ticket. Please try again.
                </p>
              )}
              {ticket.aiSummary ? (
                <p className="m-0 whitespace-pre-wrap text-sm text-gray-600">{ticket.aiSummary}</p>
              ) : (
                !summarizeMutation.isPending && (
                  <p className="m-0 text-sm text-gray-400">No summary yet.</p>
                )
              )}
            </div>

            <form className="flex flex-col gap-2" onSubmit={handleReplySubmit}>
              <label htmlFor="reply-body" className="text-sm font-medium text-gray-950">
                Reply
              </label>
              <textarea
                id="reply-body"
                rows={4}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                disabled={replyMutation.isPending || polishMutation.isPending}
                placeholder="Write a reply…"
                className="resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-gray-950 outline-none disabled:opacity-60 focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/20"
              />
              {polishMutation.isError && (
                <p className="m-0 text-xs text-red-600" role="alert">
                  Couldn't polish the reply. Please try again.
                </p>
              )}
              {replyMutation.isError && (
                <p className="m-0 text-xs text-red-600" role="alert">
                  Couldn't send the reply. Please try again.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePolishClick}
                  disabled={polishMutation.isPending || replyMutation.isPending || !replyBody.trim()}
                  className="w-fit"
                >
                  <Sparkles size={14} />
                  {polishMutation.isPending ? 'Polishing…' : 'Polish'}
                </Button>
                <Button
                  type="submit"
                  disabled={replyMutation.isPending || polishMutation.isPending || !replyBody.trim()}
                  className="w-fit"
                >
                  {replyMutation.isPending ? 'Sending…' : 'Send reply'}
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </>
  )
}
