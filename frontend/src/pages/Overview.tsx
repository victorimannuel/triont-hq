import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  FolderGit2,
  KeyRound,
  Package,
  Receipt,
  Repeat2,
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
  daysUntil,
  ErrorNote,
  formatDate,
  formatMoney,
  Loading,
  Mark,
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

/*
A counter that links to its list. Deliberately the quietest thing on the page:
no card of its own, no border, no shadow. Ten of them in boxes competed with
the money and the timeline above, which are the two reasons to open this page
at all — so they read as an index at the foot of it instead.
*/
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
      className="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
    >
      {Icon && (
        <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'ml-auto text-lg font-semibold tabular-nums tracking-tight',
          // A count of nothing is not news. Keeping it legible but faint stops
          // ten zeroes from reading as ten things worth looking at.
          value === 0 && 'font-normal text-muted-foreground/50',
        )}
      >
        {value}
      </span>
    </Link>
  )
}

// Money in and money out. Colour carries the meaning here, green earns and red
// spends, so the label takes the tone and the figure stays plain.
const MONEY_TONE = {
  in: { wash: 'bg-success/[0.07]', label: 'text-success', chip: 'bg-success/15 text-success' },
  out: {
    wash: 'bg-destructive/[0.07]',
    label: 'text-destructive',
    chip: 'bg-destructive/15 text-destructive',
  },
} as const

function MoneyTile({
  to,
  tone,
  icon: Icon,
  label,
  value,
  big,
  className,
}: {
  to?: string
  tone: keyof typeof MONEY_TONE
  icon: LucideIcon
  label: string
  value: ReactNode
  /** One converted figure gets the big type. Left off when the tile is showing
   *  every currency at once, where the line is long enough to wrap. */
  big?: boolean
  className?: string
}) {
  const skin = MONEY_TONE[tone]
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', skin.chip)}>
          <Icon className="size-3.5" />
        </span>
        <span
          className={cn(
            'text-[10.5px] font-semibold uppercase tracking-wider',
            skin.label,
          )}
        >
          {label}
        </span>
      </div>
      {/* The figure is the reason the card exists, so it gets the size to say
          so. Everything above it is a caption. */}
      <div
        className={cn(
          'mt-2.5 font-semibold tabular-nums tracking-tight',
          big ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl',
        )}
      >
        {value}
      </div>
    </>
  )
  const shell = cn('card-surface rounded-xl border px-4 py-3.5', skin.wash, className)

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
  // Rupiah has no useful cents; a dollar figure does.
  const money = (amount: number) =>
    formatMoney(currency === 'IDR' ? Math.round(amount) : amount, currency)

  return (
    <>
      <PageHeader title={t('home.title')} />

      {/* One timeline: what is broken, then what today already owes, then what
          is coming. A monitor has no date, so it sits above the dated rows.
          The card below is clipped: its rows carry a stripe down their left
          edge, and a square stripe runs straight past a rounded corner. */}
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
        <Card className="gap-0 divide-y overflow-hidden py-0">
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

      {/* Straight to the check-in rather than to the board. The board is for
          looking back; the reason to open this from the home page is that
          tonight's ticking has not been done yet, and the tally says so
          without having to go and count. Hidden entirely when there are no
          habits, so the page does not advertise an empty feature. */}
      {data.habits_total > 0 && (
        <Link
          to="/habits/checkin"
          className="card-surface mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-accent"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Repeat2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t('home.habits')}</div>
            <div className="text-xs text-muted-foreground">
              {data.habits_done >= data.habits_total
                ? t('home.habitsAllDone')
                : t('home.habitsLeft', { n: data.habits_total - data.habits_done })}
            </div>
          </div>
          <span className="shrink-0 tabular-nums text-lg font-semibold tracking-tight">
            {data.habits_done}/{data.habits_total}
          </span>
        </Link>
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
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <MoneyTile
          to="/income"
          tone="in"
          icon={TrendingUp}
          big={converting}
          label={t('home.inPerMonth')}
          value={converting ? money(income.total) : eachCurrency(data.monthly_income)}
        />
        <MoneyTile
          to="/expenses"
          tone="out"
          icon={TrendingDown}
          big={converting}
          label={t('home.outPerMonth')}
          value={converting ? money(expense.total) : eachCurrency(data.monthly_expense)}
        />
        {/* No third card subtracting one from the other. HQ only knows the
            recurring half of what goes out, so any figure it called a balance
            would be one the spreadsheet keeps properly, wrong by whatever was
            spent on food and fuel that month. Two honest numbers beat three
            with a made-up one at the end. */}
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

      {/* Rows rather than a table. The columns it used to carry were a client
          and two counts that are nearly always zero, which is a lot of ruled
          lines around very little — and the link and credential tallies are on
          the project's own page anyway. */}
      <Card className="gap-0 divide-y overflow-hidden py-0">
        {data.recent.map((project) => (
          <Link
            key={project.id}
            to={`/projects/${project.slug}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
          >
            <Mark name={project.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{project.name}</div>
              <div className="truncate text-xs text-muted-foreground">{project.client || '—'}</div>
            </div>
            <StatusBadge status={project.status} label={tOpt('status', project.status)} />
          </Link>
        ))}
        {data.recent.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            {t('home.empty')}{' '}
            <Link to="/projects/new" className="text-primary hover:underline">
              {t('home.addOne')}
            </Link>
            .
          </div>
        )}
      </Card>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">{t('home.counts')}</h2>
      {/* One card holding all of them, instead of ten cards holding one each. */}
      <Card className="grid grid-cols-2 gap-0.5 p-2 sm:grid-cols-4 lg:grid-cols-5">
        {totals.map((item) => (
          <Tile key={item.label} to={item.to} label={item.label} value={item.value} icon={item.icon} />
        ))}
      </Card>
    </>
  )
}
