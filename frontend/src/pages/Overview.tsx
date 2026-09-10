import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Repeat2 } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Overview as OverviewData } from '@/types'
import { Card } from '@/components/ui/card'
import { EntryRow } from '@/components/EntryRow'
import { daysUntil, ErrorNote, Loading, PageHeader, Segmented } from '@/components/bits'
import { useRemembered } from '@/lib/useRemembered'

// How far ahead the upcoming list looks. The server sends a month; this is
// only which slice of it the page draws.
const WINDOWS = ['7', '30'] as const
const WINDOW_OPTIONS = WINDOWS.map((days) => ({ value: days, label: `${days}d` }))

/*
Only what wants doing: what is broken, what is due, tonight's habits, what has
run out. Every row here has a next step. The page used to carry record counts,
the month's recurring money and recently touched projects as well — reference
figures that change when something is edited, not things to check on, and each
has a page of its own.
*/
export default function Overview() {
  const { t, tOpt } = useT()
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [range, setRange] = useRemembered('hq.window', WINDOWS, '7')

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />

  const low = data.low_supplies ?? []
  const trouble = data.trouble ?? []
  const ahead = Number(range)
  const overdue = (data.upcoming ?? []).filter((e) => (daysUntil(e.date) ?? 0) < 0)
  const soon = (data.upcoming ?? []).filter((e) => {
    const days = daysUntil(e.date) ?? 0
    return days >= 0 && days <= ahead
  })

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
            {/* Which ones, not only how many: a glance says what can be done
                now. Read here, ticked on the check-in — the whole card is the
                link there, so these are labels and nothing more. */}
            {data.habits_left.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {data.habits_left.map((name, at) => (
                  <span key={`${at}-${name}`} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 tabular-nums text-lg font-semibold tracking-tight">
            {data.habits_done}/{data.habits_total}
          </span>
        </Link>
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
    </>
  )
}
