import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Inbox,
  LineChart as LineChartIcon,
  Users as UsersIcon,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { NavBar } from '../components/NavBar'
import { Skeleton } from '../components/ui/skeleton'
import { useSession } from '../lib/auth-client'
import { fetchTicketAnalytics } from '../lib/analytics'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
} from '../lib/ticket'
import type { TicketCategory, TicketStatus } from '../lib/ticket'

// Status is a state (open -> resolved -> closed), not a nominal identity
// list, so each color is validated on its own (WCAG contrast) rather than as
// a categorical set — see the dataviz skill. These match the badge colors
// already used on the tickets table (client/src/lib/ticket.ts).
const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: '#2563eb',
  RESOLVED: '#059669',
  CLOSED: '#4b5563',
}

// Ticket category is nominal categorical identity (swapping the order
// wouldn't change its meaning), so this 3-hue set is validated as a group
// with scripts/validate_palette.js from the dataviz skill (all checks pass).
const CATEGORY_COLORS: Record<TicketCategory, string> = {
  GENERAL_QUESTION: '#8b5cf6',
  TECHNICAL_QUESTION: '#f59e0b',
  REFUND_REQUEST: '#f43f5e',
}

// Single-series accent for the time-series line and the agent-workload
// bars — the app's existing violet brand hue.
const ACCENT_COLOR = '#8b5cf6'

const chartDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid var(--color-border, #e5e7eb)',
  fontSize: 13,
}

function ticketCountTooltip(suffix: string) {
  return (value: unknown): [string, string] => [`${value} ${suffix}`, '']
}

// Emphasizes the most recent day's point on the tickets-over-time chart —
// every other point stays a plain small dot so the eye lands on "now".
function EndpointDot(props: { cx?: number; cy?: number; index?: number; totalPoints: number }) {
  const { cx, cy, index, totalPoints } = props
  if (cx == null || cy == null) return null
  const isLast = index === totalPoints - 1
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isLast ? 5 : 3}
      fill={ACCENT_COLOR}
      stroke="white"
      strokeWidth={isLast ? 2 : 0}
    />
  )
}

const STAT_TILES = {
  total: { icon: Inbox, chip: 'bg-gray-100 text-gray-500' },
  open: { icon: CircleDot, chip: 'bg-blue-500/10 text-blue-600' },
  resolved: { icon: CheckCircle2, chip: 'bg-emerald-500/10 text-emerald-600' },
  closed: { icon: Archive, chip: 'bg-gray-100 text-gray-600' },
} as const

function StatTile({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: keyof typeof STAT_TILES
}) {
  const { icon: Icon, chip } = STAT_TILES[variant]
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${chip}`}>
          <Icon size={15} />
        </span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <span className="text-3xl font-medium tracking-[-0.6px] text-gray-950 tabular-nums">{value}</span>
    </div>
  )
}

function ChartCard({
  title,
  icon: Icon,
  height,
  children,
}: {
  title: string
  icon: typeof BarChart3
  height: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-medium text-gray-950">
        <Icon size={16} className="text-gray-400" />
        {title}
      </h2>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data: session } = useSession()
  const {
    data: analytics,
    isPending,
    isError,
  } = useQuery({ queryKey: ['analytics', 'tickets'], queryFn: fetchTicketAnalytics })

  const statusData = useMemo(
    () =>
      TICKET_STATUSES.map((status) => ({
        status,
        label: TICKET_STATUS_LABELS[status],
        count: analytics?.statusCounts[status] ?? 0,
      })),
    [analytics],
  )

  const categoryData = useMemo(
    () =>
      TICKET_CATEGORIES.map((category) => ({
        category,
        label: TICKET_CATEGORY_LABELS[category],
        count: analytics?.categoryCounts[category] ?? 0,
      })),
    [analytics],
  )

  const ticketsByDay = useMemo(
    () =>
      (analytics?.ticketsByDay ?? []).map((point) => ({
        ...point,
        label: chartDateFormatter.format(new Date(`${point.date}T00:00:00Z`)),
      })),
    [analytics],
  )

  const isAdmin = session?.user.role === 'ADMIN'
  const agentWorkload = analytics?.agentWorkload ?? []

  return (
    <>
      <NavBar />
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8 max-md:px-5 max-md:py-8">
        <h1 className="text-4xl font-medium tracking-[-1.2px] text-gray-950 max-md:text-3xl">
          Dashboard
        </h1>

        {isError && <p className="text-red-600">Couldn't load ticket analytics. Please try again.</p>}

        {isPending && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Skeleton className="h-64 rounded-lg" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
            <Skeleton className="h-72 rounded-lg" />
          </div>
        )}

        {!isPending && !isError && analytics && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Total tickets" value={analytics.totalTickets} variant="total" />
              <StatTile label="Open" value={analytics.statusCounts.OPEN} variant="open" />
              <StatTile label="Resolved" value={analytics.statusCounts.RESOLVED} variant="resolved" />
              <StatTile label="Closed" value={analytics.statusCounts.CLOSED} variant="closed" />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ChartCard title="Tickets by status" icon={BarChart3} height={220}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" width={70} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={ticketCountTooltip('tickets')}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {statusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title="Tickets by category" icon={BarChart3} height={220}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" width={110} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={ticketCountTooltip('tickets')}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {categoryData.map((entry) => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>

            <ChartCard title="Tickets created, last 14 days" icon={LineChartIcon} height={260}>
              <AreaChart data={ticketsByDay} margin={{ left: 8, right: 16, top: 8 }}>
                <defs>
                  <linearGradient id="ticketsByDayFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_COLOR} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={ticketCountTooltip('tickets')}
                  labelFormatter={(_, payload) => payload[0]?.payload.date ?? ''}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={ACCENT_COLOR}
                  strokeWidth={2}
                  fill="url(#ticketsByDayFill)"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => (
                    <EndpointDot key={props.index} {...props} totalPoints={ticketsByDay.length} />
                  )}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ChartCard>

            {isAdmin && agentWorkload.length > 0 && (
              <ChartCard
                title="Open tickets by agent"
                icon={UsersIcon}
                height={Math.max(160, agentWorkload.length * 44)}
              >
                <BarChart data={agentWorkload} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis
                    type="category"
                    dataKey="agentName"
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    width={110}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={ticketCountTooltip('open tickets')}
                  />
                  <Bar dataKey="openCount" fill={ACCENT_COLOR} radius={[0, 4, 4, 0]} maxBarSize={28} />
                </BarChart>
              </ChartCard>
            )}
          </div>
        )}
      </section>
    </>
  )
}
