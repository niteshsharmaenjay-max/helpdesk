import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import { Link } from 'react-router'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { NavBar } from '../components/NavBar'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
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

type Ticket = {
  id: string
  subject: string
  fromEmail: string
  fromName: string
  status: TicketStatus
  category: TicketCategory
  createdAt: string
  updatedAt: string
  assignedTo: { id: string; name: string } | null
}

type TicketFilters = {
  search: string
  status: TicketStatus | ''
  category: TicketCategory | ''
  assignedTo: string // '' (all) | 'unassigned' | an agent id
}

const NO_FILTERS: TicketFilters = { search: '', status: '', category: '', assignedTo: '' }
const SEARCH_DEBOUNCE_MS = 300

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

async function fetchTickets(sorting: SortingState, filters: TicketFilters, pagination: PaginationState) {
  const sort = sorting[0]
  const { data } = await axios.get<{ tickets: Ticket[]; total: number }>('/api/tickets', {
    withCredentials: true,
    params: {
      ...(sort ? { sortBy: sort.id, sortOrder: sort.desc ? 'desc' : 'asc' } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.assignedTo ? { assignedTo: filters.assignedTo } : {}),
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
    },
  })
  return data
}

const columnHelper = createColumnHelper<Ticket>()

const columns = [
  columnHelper.accessor('subject', {
    header: 'Subject',
    cell: (info) => (
      <Link
        to={`/tickets/${info.row.original.id}`}
        className="font-medium text-gray-950 hover:text-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('fromName', {
    header: 'From',
    cell: (info) => (
      <div className="text-gray-600">
        {info.getValue()}
        <span className="block text-xs text-gray-400">{info.row.original.fromEmail}</span>
      </div>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TICKET_STATUS_STYLES[info.getValue()]}`}
      >
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TICKET_CATEGORY_STYLE}`}>
        {TICKET_CATEGORY_LABELS[info.getValue()]}
      </span>
    ),
  }),
  columnHelper.accessor((ticket) => ticket.assignedTo?.name ?? null, {
    id: 'assignedTo',
    header: 'Assigned to',
    cell: (info) => info.getValue() ?? <span className="text-gray-400">Unassigned</span>,
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => (
      <span className="text-gray-600">{dateFormatter.format(new Date(info.getValue()))}</span>
    ),
  }),
]

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-gray-950 outline-none focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TicketsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user.role === 'ADMIN'

  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [filters, setFilters] = useState<TicketFilters>(NO_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const hasActiveFilters =
    filters.search !== '' || filters.status !== '' || filters.category !== '' || filters.assignedTo !== ''

  // Sorting/filtering can change which page is even valid, so jump back to
  // page 1 whenever either changes rather than leaving pagination stale.
  const updateSorting: typeof setSorting = (updater) => {
    setSorting(updater)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }
  const updateFilters = (updater: TicketFilters | ((f: TicketFilters) => TicketFilters)) => {
    setFilters(updater)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  // Debounce the subject search so typing doesn't fire a request per
  // keystroke — only commit it into `filters` (and thus the query) once
  // the user pauses.
  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const clearFilters = () => {
    setSearchInput('')
    updateFilters(NO_FILTERS)
  }

  const {
    data,
    isPending,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['tickets', sorting, filters, pagination],
    queryFn: () => fetchTickets(sorting, filters, pagination),
    placeholderData: keepPreviousData,
  })
  const tickets = data?.tickets ?? []
  const total = data?.total ?? 0

  const { data: agents = [] } = useQuery({
    queryKey: ['users', 'agents'],
    queryFn: fetchAgents,
    enabled: isAdmin,
  })

  const table = useReactTable({
    data: tickets,
    columns,
    state: { sorting, pagination },
    onSortingChange: updateSorting,
    onPaginationChange: setPagination,
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    enableMultiSort: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  })

  const sortIcon = useMemo(
    () => ({
      asc: <ArrowUp size={13} />,
      desc: <ArrowDown size={13} />,
    }),
    [],
  )

  return (
    <>
      <NavBar />
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8 max-md:px-5 max-md:py-8">
        <h1 className="text-4xl font-medium tracking-[-1.2px] text-gray-950 max-md:text-3xl">
          Tickets
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="sr-only">Search by subject</span>
            <span className="flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/20">
              <Search size={14} className="shrink-0 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search subject…"
                className="w-44 border-none bg-transparent text-sm text-gray-950 outline-none placeholder:text-gray-400"
              />
            </span>
          </label>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => updateFilters((f) => ({ ...f, status: value as TicketStatus | '' }))}
            options={[
              { value: '', label: 'All statuses' },
              ...TICKET_STATUSES.map((status) => ({ value: status, label: status })),
            ]}
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            onChange={(value) => updateFilters((f) => ({ ...f, category: value as TicketCategory | '' }))}
            options={[
              { value: '', label: 'All categories' },
              ...TICKET_CATEGORIES.map((category) => ({ value: category, label: TICKET_CATEGORY_LABELS[category] })),
            ]}
          />
          {isAdmin && (
            <FilterSelect
              label="Assigned to"
              value={filters.assignedTo}
              onChange={(value) => updateFilters((f) => ({ ...f, assignedTo: value }))}
              options={[
                { value: '', label: 'Anyone' },
                { value: 'unassigned', label: 'Unassigned' },
                ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
              ]}
            />
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {isPending && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-8 h-4 w-32" />
              <Skeleton className="ml-8 h-4 w-16" />
              <Skeleton className="ml-8 h-4 w-28" />
              <Skeleton className="ml-8 h-4 w-24" />
              <Skeleton className="ml-8 h-4 w-20" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-8 h-4 w-36" />
                <Skeleton className="ml-8 h-5 w-14 rounded-full" />
                <Skeleton className="ml-8 h-5 w-28 rounded-full" />
                <Skeleton className="ml-8 h-4 w-24" />
                <Skeleton className="ml-8 h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {isError && <p className="text-red-600">Couldn't load tickets. Please try again.</p>}

        {!isPending &&
          !isError &&
          (tickets.length === 0 ? (
            <p className="text-gray-500">
              {hasActiveFilters ? 'No tickets match these filters.' : 'No tickets found.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50 text-gray-600">
                      {headerGroup.headers.map((header) => {
                        const sortDirection = header.column.getIsSorted()
                        return (
                          <th key={header.id} className="px-4 py-3 font-medium">
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sortDirection ? sortIcon[sortDirection] : <ArrowUpDown size={13} className="text-gray-300" />}
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-gray-950">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {!isPending && !isError && total > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ({total}{' '}
              {total === 1 ? 'ticket' : 'tickets'})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage() || isFetching}
              >
                <ArrowLeft size={14} />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage() || isFetching}
              >
                Next
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
