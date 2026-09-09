import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Flame, ListChecks, Plus, Repeat2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { currentLocale, useT } from '@/i18n'
import type { Habit } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, formatDate, Loading, PageHeader, Segmented } from '@/components/bits'

/**
 * The board: habits down the side, days across, and a cell you tap. Everything
 * else about a habit tracker is decoration — the only thing that makes one get
 * used is that ticking today costs one tap.
 */

/*
How far back it looks, and what shape that takes.

A week is the one you tick on: seven cells fit a phone at a size you can hit.
Anything longer is a thing you read rather than press, so the cells shrink to
squares thirty to a line — a month reads as one line and a quarter as three.
*/
const WINDOWS = [
  { value: '7', label: '7h' },
  { value: '30', label: '30h' },
  { value: '90', label: '90h' },
] as const

type Span = (typeof WINDOWS)[number]['value']

type Day = { key: string; label: string; today: boolean }

// The local date, not an ISO timestamp: a tick belongs to the day the person
// standing there thinks it is.
function dayKey(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

// Oldest first, today last. Noon rather than midnight so a daylight-saving
// shift cannot roll a date backwards while stepping through them.
function recentDays(span: number): Day[] {
  const short = new Intl.DateTimeFormat(currentLocale(), { weekday: 'narrow' })
  const out: Day[] = []
  for (let back = span - 1; back >= 0; back--) {
    const day = new Date()
    day.setHours(12, 0, 0, 0)
    day.setDate(day.getDate() - back)
    out.push({ key: dayKey(day), label: short.format(day), today: back === 0 })
  }
  return out
}

/*
Everything past a week: small squares left to right, oldest to today, wrapping
when they run out of room. A month comes to one line and a quarter to three,
against the seven a week-column grid costs — and a grid that small, stranded
in a wide card, reads as a stray object rather than a chart.

Nothing here is pressable. A nine pixel target is a mis-tap waiting to happen,
and a mis-tap records the wrong day without saying so; ticking belongs on the
week view and the evening check-in.
*/
function Strip({ habit, days }: { habit: Habit; days: Day[] }) {
  return (
    // Thirty to a line, which is what both the size and the width are for:
    // nine pixels and a two pixel gap comes to 328, inside the 341 a phone has
    // left once the bin is beside the name. So a month is one line and a
    // quarter is three, and a line always means the same span.
    <span className="flex max-w-[330px] flex-wrap gap-[2px] sm:max-w-[450px] sm:gap-[3px]">
      {days.map((day) => (
        <span
          key={day.key}
          title={day.key}
          className={cn(
            'size-[9px] rounded-[2px] border sm:size-3',
            habit.days.includes(day.key)
              ? 'border-primary bg-primary'
              : 'border-border',
            !habit.days.includes(day.key) && day.today && 'border-foreground/50',
          )}
        />
      ))}
    </span>
  )
}

export default function Habits() {
  const { t } = useT()
  const ask = useConfirm()
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [span, setSpan] = useState<Span>('7')
  const days = useMemo(() => recentDays(Number(span)), [span])
  const wide = span !== '7'

  const load = useCallback(() => {
    api
      .habits(Number(span))
      .then((data) => {
        setHabits(data.habits)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('habit.failed')))
  }, [span, t])

  useEffect(load, [load])

  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (busy) return
    if (!trimmed) {
      toast.error(t('habit.nameRequired'))
      return
    }
    setBusy(true)
    try {
      await api.createHabit({ name: trimmed, notes: '', active: true })
      setName('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('habit.failed'))
    } finally {
      setBusy(false)
    }
  }

  /*
  Asked before it happens. A cell is a small target and the answer it records
  is invisible until you go looking for it, so a mis-tap would otherwise write
  the wrong day and say nothing about it.

  Then ticked in place and re-read: the cell filling in is the whole feedback
  of a tap, and the re-read is for the run of days, which only the server knows
  how to count.
  */
  async function toggle(habit: Habit, day: string) {
    const done = !habit.days.includes(day)
    const ok = await ask({
      title: t(done ? 'habit.confirmTick' : 'habit.confirmUntick', {
        name: habit.name,
        date: formatDate(day),
      }),
      confirmLabel: t(done ? 'habit.yesTick' : 'habit.yesUntick'),
      danger: !done,
    })
    if (!ok) return

    setHabits((list) =>
      (list ?? []).map((row) =>
        row.id === habit.id
          ? { ...row, days: done ? [...row.days, day] : row.days.filter((d) => d !== day) }
          : row,
      ),
    )
    try {
      await api.setHabitDay(habit.id, day, done)
      load()
    } catch {
      toast.error(t('habit.failed'))
      load()
    }
  }

  async function remove(habit: Habit) {
    const ok = await ask({
      title: t('confirm.deleteTitle', { name: habit.name }),
      body: t('habit.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    setHabits((list) => (list ?? []).filter((row) => row.id !== habit.id))
    try {
      await api.deleteHabit(habit.id)
    } catch {
      toast.error(t('habit.failed'))
      load()
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('habit.title')}
        description={t(wide ? 'habit.subtitleWide' : 'habit.subtitle')}
        // The evening notification opens this page too. Here so it can be
        // started on purpose rather than only when asked.
        action={
          <div className="flex items-center gap-2">
            <Segmented value={span} onChange={setSpan} options={WINDOWS} />
            {habits && habits.length > 0 && (
              <Button asChild variant="outline">
                <Link to="/habits/checkin">
                  <ListChecks className="size-4" />
                  {t('habit.checkin')}
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={create}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('habit.placeholder')}
          className="min-w-40 flex-1"
        />
        <Button type="submit" disabled={busy}>
          <Plus className="size-4" />
          {t('habit.new')}
        </Button>
      </form>

      {habits === null ? (
        <Loading />
      ) : habits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Repeat2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('habit.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            {/* The day letters, once, above every row. They sit over the
                cells, which is the right edge on a wide screen and the left
                on a phone, where the cells drop to a line of their own. The
                wider windows put their own letters down the side instead. */}
            {!wide && (
              <div className="flex items-center gap-3 border-b px-4 py-2">
                <span className="hidden min-w-0 flex-1 sm:block" />
                <span className="flex shrink-0 gap-1">
                  {days.map((day) => (
                    <span
                      key={day.key}
                      className={cn(
                        'w-8 text-center text-[11px] uppercase',
                        day.today ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {day.label}
                    </span>
                  ))}
                </span>
                <span className="hidden w-9 shrink-0 sm:block" />
              </div>
            )}

            {/* Seven cells and a name do not both fit a phone, so below sm the
                cells wrap to a line of their own rather than squeezing the
                name down to nothing. */}
            <div className="divide-y">
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  {/* The basis is what does the wrapping. Left to flex-1 the
                      name would rather shrink to nothing than push the cells
                      onto a second line, which is exactly what it did. The
                      3rem it gives back is the bin button, so that comes up
                      beside the name instead of taking a third line. */}
                  <div className="order-1 min-w-0 grow basis-[calc(100%-3rem)] sm:basis-0">
                    {/* The name is the way in to renaming, pausing and the
                        picture. A row this dense has no room for a pencil. */}
                    <Link
                      to={`/habits/${habit.id}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {habit.name}
                      {!habit.active && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {t('habit.paused')}
                        </span>
                      )}
                    </Link>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {habit.streak > 0 && (
                        <span className="flex items-center gap-1 whitespace-nowrap text-warning">
                          <Flame className="size-3" />
                          {t('habit.streak', { n: habit.streak })}
                        </span>
                      )}
                      <span className="whitespace-nowrap">
                        {t('habit.lastSeven', { n: habit.last_seven })}
                      </span>
                    </p>
                  </div>

                  <span className="order-3 shrink-0 sm:order-2">
                    {wide ? (
                      <Strip habit={habit} days={days} />
                    ) : (
                      <span className="flex gap-1">
                        {days.map((day) => (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => toggle(habit, day.key)}
                            aria-pressed={habit.days.includes(day.key)}
                            aria-label={`${habit.name} · ${day.key}`}
                            title={day.key}
                            className={cn(
                              'grid size-8 place-items-center rounded border transition-colors',
                              habit.days.includes(day.key)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'hover:border-primary',
                              // Today is the one you are aiming at, so it is
                              // the one with an edge even while empty.
                              !habit.days.includes(day.key) &&
                                day.today &&
                                'border-foreground/40',
                            )}
                          >
                            {habit.days.includes(day.key) && <Check className="size-4" />}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>

                  <div className="order-2 w-9 shrink-0 sm:order-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(habit)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
