import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  Cake,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  List,
  Home,
  Receipt,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { CalendarEntry } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorNote, daysUntil, formatDate, Loading, PageHeader } from '@/components/bits'
import { cn } from '@/lib/utils'

const KIND_ICON = {
  renewal: Globe,
  document: FileText,
  warranty: ShieldCheck,
  maintenance: Wrench,
  birthday: Cake,
  rent: Home,
  income: Banknote,
  expense: Receipt,
} as const

type Kind = keyof typeof KIND_ICON

// One colour per kind, so a month reads at a glance without opening anything.
const KIND_TONE: Record<Kind, string> = {
  renewal: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  document: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  warranty: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  maintenance: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  birthday: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  rent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  income: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  expense: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

const tone = (kind: string) => KIND_TONE[kind as Kind] ?? KIND_TONE.renewal

const VIEW_KEY = 'hq-calendar-view'

function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
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

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const { t } = useT()
  const Icon = KIND_ICON[entry.kind as Kind] ?? Globe
  const days = daysUntil(entry.date)
  const late = days !== null && days < 0
  const soon = days !== null && days >= 0 && days <= 14

  return (
    <Link
      to={entry.url}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
    >
      <span className={cn('grid size-6 shrink-0 place-items-center rounded', tone(entry.kind))}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{entry.label}</div>
        <div className="truncate text-xs text-muted-foreground">{entry.detail}</div>
      </div>
      <Badge variant="outline" className={cn('shrink-0 border-transparent text-[11px]', tone(entry.kind))}>
        {t(`cal.kind.${entry.kind}`)}
      </Badge>
      <div className="w-28 shrink-0 text-right text-xs">
        <div>{formatDate(entry.date)}</div>
        {days !== null && (
          <div className={cn(late ? 'text-destructive' : soon ? 'text-warning' : 'text-muted-foreground')}>
            {late
              ? t('cal.late', { n: Math.abs(days) })
              : days === 0
                ? t('cal.today')
                : t('cal.inDays', { n: days })}
          </div>
        )}
      </div>
    </Link>
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
  const { t } = useT()

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
                className={cn(
                  'min-h-[5.5rem] border-b border-r p-1.5 last:border-r-0',
                  outside && 'bg-muted/30 text-muted-foreground',
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex size-5 items-center justify-center rounded-full text-[11px]',
                    isToday && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {day.getDate()}
                </div>

                <div className="space-y-0.5">
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
    </>
  )
}
