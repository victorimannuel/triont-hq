import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Globe, List } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { CalendarEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ErrorNote, daysUntil, Loading, PageHeader } from '@/components/bits'
import { EntryRow, KIND_ICON, tone, type Kind } from '@/components/EntryRow'
import { cn } from '@/lib/utils'

const VIEW_KEY = 'hq-calendar-view'

// A month grid on a 375px screen is a wall of coloured dots with no room for
// the words, so a phone starts on the list unless it has been told otherwise.
function readView(): 'grid' | 'list' {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored === 'list' || stored === 'grid') return stored
  } catch {
    // Remembering the view is a nicety, not a requirement.
  }
  return window.matchMedia('(max-width: 639px)').matches ? 'list' : 'grid'
}

/** Local YYYY-MM-DD; toISOString would shift the day in +07:00. */
function key(date: Date) {
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export default function Calendar() {
  const { t, lang } = useT()
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(readView)
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const locale = lang === 'en' ? 'en-GB' : 'id-ID'
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  )
  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale],
  )

  useEffect(() => {
    api
      .calendar()
      .then((data) => setEntries(data.entries))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // Remembering the view is a nicety, not a requirement.
    }
  }, [view])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const entry of entries ?? []) {
      const day = entry.date.slice(0, 10)
      const list = map.get(day)
      if (list) list.push(entry)
      else map.set(day, [entry])
    }
    return map
  }, [entries])

  const months = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>()
    for (const entry of entries ?? []) {
      const month = entry.date.slice(0, 7)
      const list = grouped.get(month)
      if (list) list.push(entry)
      else grouped.set(month, [entry])
    }
    return [...grouped.entries()]
  }, [entries])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!entries) return <Loading />

  const toggle = (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      <Button
        variant={view === 'grid' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setView('grid')}
        aria-label="kalender"
      >
        <CalendarDays className="size-4" />
      </Button>
      <Button
        variant={view === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setView('list')}
        aria-label="list"
      >
        <List className="size-4" />
      </Button>
    </div>
  )

  return (
    <>
      <PageHeader title={t('cal.title')} description={t('cal.subtitle')} action={toggle} />

      {entries.length === 0 && (
        <Card className="py-10 text-center text-muted-foreground">{t('cal.empty')}</Card>
      )}

      {entries.length > 0 && view === 'grid' && (
        <MonthGrid
          cursor={cursor}
          setCursor={setCursor}
          byDay={byDay}
          monthLabel={monthFormat.format(cursor)}
          weekdayFormat={weekdayFormat}
        />
      )}

      {entries.length > 0 &&
        view === 'list' &&
        months.map(([month, list]) => (
          <section key={month} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {monthFormat.format(new Date(`${month}-01T00:00:00`))}
            </h2>
            <Card className="divide-y py-0">
              {list.map((entry, index) => (
                <EntryRow key={`${entry.kind}-${entry.url}-${index}`} entry={entry} />
              ))}
            </Card>
          </section>
        ))}
    </>
  )
}

function MonthGrid({
  cursor,
  setCursor,
  byDay,
  monthLabel,
  weekdayFormat,
}: {
  cursor: Date
  setCursor: (date: Date) => void
  byDay: Map<string, CalendarEntry[]>
  monthLabel: string
  weekdayFormat: Intl.DateTimeFormat
}) {
  const { t, lang } = useT()

  // Which day a phone tapped open. Never set on desktop, where the labels are
  // already in the cells.
  const [picked, setPicked] = useState<string | null>(null)

  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [lang],
  )

  // Weeks start on Monday, which is how a working calendar reads here.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)

  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return date
  })

  const todayKey = key(new Date())
  const weekdays = days.slice(0, 7)

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="←"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-[10rem] text-center text-sm font-semibold lowercase">
          {monthLabel}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label="→"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const now = new Date()
            setCursor(new Date(now.getFullYear(), now.getMonth(), 1))
          }}
        >
          {t('cal.today')}
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weekdays.map((day) => (
            <div
              key={day.toISOString()}
              className="px-2 py-1.5 text-center text-[11px] font-medium lowercase text-muted-foreground"
            >
              {weekdayFormat.format(day)}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayKey = key(day)
            const items = byDay.get(dayKey) ?? []
            const outside = day.getMonth() !== cursor.getMonth()
            const isToday = dayKey === todayKey

            return (
              <div
                key={dayKey}
                // A phone cell is too narrow to read a label in, so tapping it
                // opens the day. From sm up the labels are already there and a
                // tap would only be a surprise.
                onClick={items.length ? () => setPicked(dayKey) : undefined}
                className={cn(
                  'min-h-14 border-b border-r p-1 last:border-r-0 sm:min-h-[5.5rem] sm:p-1.5',
                  outside && 'bg-muted/30 text-muted-foreground',
                  items.length > 0 && 'cursor-pointer active:bg-accent sm:cursor-default',
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex size-4 items-center justify-center rounded-full text-[10px] sm:size-5 sm:text-[11px]',
                    isToday && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {day.getDate()}
                </div>

                {/* A label does not fit a 55px cell, but its icon does, and an
                    icon says which kind without having to remember a colour. */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {items.slice(0, 6).map((entry, index) => {
                    const Mark = KIND_ICON[entry.kind as Kind] ?? Globe
                    return (
                      <span
                        key={`${entry.url}-${index}`}
                        title={`${entry.label} · ${entry.detail}`}
                        className={cn(
                          'grid size-3.5 place-items-center rounded-[3px]',
                          tone(entry.kind),
                        )}
                      >
                        <Mark className="size-2.5" />
                      </span>
                    )
                  })}
                </div>

                <div className="hidden space-y-0.5 sm:block">
                  {items.slice(0, 3).map((entry, index) => {
                    const Icon = KIND_ICON[entry.kind as Kind] ?? Globe
                    const days = daysUntil(entry.date)
                    const late = days !== null && days < 0
                    return (
                      <Link
                        key={`${entry.url}-${index}`}
                        to={entry.url}
                        title={`${entry.label} · ${entry.detail}`}
                        className={cn(
                          'flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-opacity hover:opacity-80',
                          tone(entry.kind),
                          late && 'ring-1 ring-destructive/40',
                        )}
                      >
                        <Icon className="size-3 shrink-0" />
                        <span className="truncate">{entry.label}</span>
                      </Link>
                    )
                  })}
                  {items.length > 3 && (
                    <div className="px-1 text-[11px] text-muted-foreground">
                      +{items.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* What the dots stand for. Same rows the list view uses, so an entry
          reads and behaves the same wherever it is opened from. */}
      <Sheet open={picked !== null} onOpenChange={(open) => !open && setPicked(null)}>
        <SheetContent side="bottom" className="p-0">
          <SheetTitle className="border-b px-4 py-4 lowercase">
            {picked && dayFormat.format(new Date(`${picked}T00:00:00`))}
          </SheetTitle>
          <div className="divide-y overflow-y-auto">
            {(picked ? (byDay.get(picked) ?? []) : []).map((entry, index) => (
              <EntryRow
                key={`${entry.kind}-${entry.url}-${index}`}
                entry={entry}
                onPick={() => setPicked(null)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
