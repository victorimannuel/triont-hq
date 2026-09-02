import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  FolderGit2,
  KeyRound,
  Package,
  Receipt,
  Scale,
  Server,
  ShoppingBasket,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Overview as OverviewData } from '@/types'
import { Card } from '@/components/ui/card'
import { EntryRow } from '@/components/EntryRow'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  daysUntil,
  ErrorNote,
  formatDate,
  formatMoney,
  Loading,
  PageHeader,
  Segmented,
  StatusBadge,
} from '@/components/bits'
import {
  convert,
  CurrencyToggle,
  eachCurrency,
  latestFetch,
  RefreshRates,
  useDisplayCurrency,
} from '@/components/Money'
import { useRemembered } from '@/lib/useRemembered'
import { cn } from '@/lib/utils'

// How far ahead the upcoming list looks. The server sends a month; this is
// only which slice of it the page draws.
const WINDOWS = ['7', '30'] as const
const WINDOW_OPTIONS = WINDOWS.map((days) => ({ value: days, label: `${days}d` }))

/** A counter that links to its list. One line, so a phone still has room
 *  below for the parts of this page that need acting on. */
function Tile({
  to,
  label,
  value,
  icon: Icon,
}: {
  to: string
  label: string
  value: number
  icon?: LucideIcon
}) {
  return (
    <Link
      to={to}
      className="card-surface flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent"
    >
      {Icon && (
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground/[0.06] text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      )}
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto text-lg font-semibold tabular-nums tracking-tight">{value}</span>
    </Link>
  )
}

// Money in, money out, and what is left. Colour carries the meaning here —
// green earns, red spends — so the label takes the tone and the figure stays
// plain, which keeps a negative "sisa" readable rather than alarming.
const MONEY_TONE = {
  in: { wash: 'bg-success/[0.07]', label: 'text-success' },
  out: { wash: 'bg-destructive/[0.07]', label: 'text-destructive' },
  net: { wash: 'bg-primary/[0.07]', label: 'text-primary' },
} as const

function MoneyTile({
  to,
  tone,
  icon: Icon,
  label,
  value,
  className,
}: {
  to?: string
  tone: keyof typeof MONEY_TONE
  icon: LucideIcon
  label: string
  value: ReactNode
  className?: string
}) {
  const skin = MONEY_TONE[tone]
  const body = (
    <>
      <div className={cn('flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider', skin.label)}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{value}</div>
    </>
  )
  const shell = cn('card-surface rounded-lg border px-3.5 py-3', skin.wash, className)

  return to ? (
    <Link to={to} className={cn(shell, 'transition-colors hover:bg-accent')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}

export default function Overview() {
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [currency, setCurrency] = useDisplayCurrency()
  const [range, setRange] = useRemembered('hq.window', WINDOWS, '7')

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />

  const totals = [
    { label: t('nav.projects'), value: data.total_projects, icon: FolderGit2, to: '/projects' },
    { label: t('nav.clients'), value: data.total_clients, icon: Users, to: '/clients' },
    { label: t('nav.assets'), value: data.total_assets, icon: Server, to: '/assets' },
    { label: t('nav.credentials'), value: data.total_credentials, icon: KeyRound, to: '/credentials' },
    { label: t('nav.documents'), value: data.total_documents, icon: FileText, to: '/documents' },
    { label: t('nav.belongings'), value: data.total_belongings, icon: Package, to: '/belongings' },
    { label: t('nav.people'), value: data.total_people, icon: UserRound, to: '/people' },
    { label: t('nav.income'), value: data.total_income, icon: Wallet, to: '/income' },
    { label: t('nav.expenses'), value: data.total_expenses, icon: Receipt, to: '/expenses' },
    { label: t('nav.supplies'), value: data.total_supplies, icon: ShoppingBasket, to: '/supplies' },
  ]

  const low = data.low_supplies ?? []
  const trouble = data.trouble ?? []
  const ahead = Number(range)
  const overdue = (data.upcoming ?? []).filter((e) => (daysUntil(e.date) ?? 0) < 0)
  const soon = (data.upcoming ?? []).filter((e) => {
    const days = daysUntil(e.date) ?? 0
    return days >= 0 && days <= ahead
  })

  // Two currencies side by side is arithmetic left to the reader, so the page
  // does it and says which rate it used.
  const rates = data.rates ?? []
  const converting = currency !== 'all'
  const income = convert(data.monthly_income, rates, currency)
  const expense = convert(data.monthly_expense, rates, currency)
  const stamp = latestFetch(rates)
  // What is left over, currency by currency, for the reading that does not
  // convert. A negative figure is the point here, so it is kept.
  const net: Record<string, number> = {}
  for (const currency of new Set([
    ...Object.keys(data.monthly_income ?? {}),
    ...Object.keys(data.monthly_expense ?? {}),
  ])) {
    net[currency] = (data.monthly_income?.[currency] ?? 0) - (data.monthly_expense?.[currency] ?? 0)
  }
  // Rupiah has no useful cents; a dollar figure does.
  const money = (amount: number) =>
    formatMoney(currency === 'IDR' ? Math.round(amount) : amount, currency)

  return (
    <>
      <PageHeader title={t('home.title')} />

      {/* One timeline: what is broken, then what today already owes, then what
          is coming. A monitor has no date, so it sits above the dated rows. */}
      <div className="mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('home.needsAction')}</h2>
        <Segmented value={range} onChange={setRange} options={WINDOW_OPTIONS} />
        <Link to="/calendar" className="ml-auto text-sm text-primary hover:underline">
          {t('home.seeCalendar')}
        </Link>
      </div>
      {trouble.length + overdue.length + soon.length === 0 ? (
        <Card className="px-4 py-3 text-sm text-muted-foreground">
          {t('home.needsActionEmpty', { n: ahead })}
        </Card>
      ) : (
        <Card className="divide-y py-0">
          {trouble.map((check) => (
            <Link
              key={check.id}
              to="/monitor"
              className="flex items-center gap-3 border-l-2 border-l-destructive px-4 py-3 transition-colors hover:bg-accent"
            >
              <span className="size-2 shrink-0 rounded-full bg-destructive ring-3 ring-destructive/20" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{check.name}</div>
                {check.detail && (
                  <div className="truncate text-xs text-muted-foreground">{check.detail}</div>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{check.source}</span>
            </Link>
          ))}
          {[...overdue, ...soon].map((entry) => (
            <EntryRow key={`${entry.kind}-${entry.url}-${entry.date}`} entry={entry} />
          ))}
        </Card>
      )}

      {/* The rates are stored, not live: the date says how old they are and
          the button is the only thing that changes them. */}
      <div className="mt-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('home.money')}</h2>
        <CurrencyToggle value={currency} onChange={setCurrency} />
        {/* Nothing to date or refresh when no rate is being applied. */}
        {converting && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            {stamp ? t('fx.asOf', { date: formatDate(stamp) }) : t('fx.never')}
            <RefreshRates
              onRefreshed={(next) => setData((current) => (current ? { ...current, rates: next } : current))}
            />
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <MoneyTile
          to="/income"
          tone="in"
          icon={TrendingUp}
          label={t('home.inPerMonth')}
          value={converting ? money(income.total) : eachCurrency(data.monthly_income)}
        />
        <MoneyTile
          to="/expenses"
          tone="out"
          icon={TrendingDown}
          label={t('home.outPerMonth')}
          value={converting ? money(expense.total) : eachCurrency(data.monthly_expense)}
        />
        <MoneyTile
          tone="net"
          icon={Scale}
          label={t('home.net')}
          value={converting ? money(income.total - expense.total) : eachCurrency(net)}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      {converting && (income.missing || expense.missing) && (
        <p className="mt-2 text-xs text-muted-foreground">{t('fx.missing')}</p>
      )}

      {/* The shopping list is short and immediately actionable, so it sits on
          the page rather than behind a number you would have to click. */}
      {low.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            {t('home.lowSupplies')}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('home.lowSuppliesHint')}
            </span>
          </h2>
          <Card className="flex flex-row flex-wrap gap-2 p-4">
            {low.map((item) => (
              <Link
                key={item.id}
                to={`/supplies/${item.id}`}
                className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-sm transition-colors hover:bg-warning/20"
              >
                {item.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {item.quantity} {tOpt('unit', item.unit)}
                </span>
              </Link>
            ))}
          </Card>
        </>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">{t('home.recent')}</h2>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('nav.projects')}</TableHead>
              <TableHead>{t('project.client')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('link.title')}</TableHead>
              <TableHead className="text-right">{t('nav.credentials')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent.map((project) => (
              <TableRow
                key={project.id}
                onClick={() => navigate(`/projects/${project.slug}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/projects/${project.slug}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{project.client || '—'}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={project.status}
                    label={
                      tOpt('status', project.status)
                    }
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {project.link_count}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {project.credential_count}
                </TableCell>
              </TableRow>
            ))}
            {data.recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t('home.empty')}{' '}
                  <Link to="/projects/new" className="text-primary hover:underline">
                    {t('home.addOne')}
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">{t('home.counts')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
        {totals.map((item) => (
          <Tile key={item.label} to={item.to} label={item.label} value={item.value} icon={item.icon} />
        ))}
      </div>
    </>
  )
}
