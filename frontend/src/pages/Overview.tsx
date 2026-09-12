import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ListTodo, NotebookPen, PenLine, Repeat2, ShoppingBasket } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { CalendarEntry, Overview as OverviewData, TaskKind } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { EntryRow } from '@/components/EntryRow'
import { daysUntil, ErrorNote, Loading, PageHeader, Segmented, since } from '@/components/bits'
import { useRemembered } from '@/lib/useRemembered'
import { cn } from '@/lib/utils'

// How far ahead the upcoming list looks. The server sends a month; this is
// only which slice of it the page draws.
const WINDOWS = ['7', '30'] as const
const WINDOW_OPTIONS = WINDOWS.map((days) => ({ value: days, label: `${days}d` }))

function todayKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, '0')}`
}

/*
One line in, filed in one tap.

The reason this exists is that everything else here costs four: open the menu,
find the module, open its form, type, save. A thought does not survive that,
and what it does instead is end up in the phone's notes app — which is the
thing HQ is supposed to replace.

So the box asks for nothing but the words. Where they go is chosen after they
are typed, which is also when you actually know, and the destinations only
appear once there is something to file.

The default is the scribble list rather than the to-do list, because catching a
thought and committing to doing something about it are two different decisions
and the second one can wait. A line filed as a job you have not agreed to is
how a to-do list stops being believed.
*/
function Capture({ onFiled }: { onFiled: () => void }) {
  const { t } = useT()
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const typed = line.trim()

  async function file(where: TaskKind | 'journal') {
    if (!typed || busy) return
    setBusy(true)
    try {
      if (where === 'journal') {
        // The day holds one piece of text, so a captured line is appended to
        // it rather than replacing what is already written there.
        const on = todayKey()
        const day = await api.journalDay(on)
        await api.setJournalLine(on, day.line ? `${day.line}\n${typed}` : typed)
      } else {
        await api.createTask(where, { title: typed, due_on: '' })
      }
      setLine('')
      toast.success(t(`home.filed.${where}`))
      onFiled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('home.captureFailed'))
    } finally {
      setBusy(false)
    }
  }

  const where: { key: TaskKind | 'journal'; icon: typeof ListTodo }[] = [
    { key: 'note', icon: PenLine },
    { key: 'todo', icon: ListTodo },
    { key: 'buy', icon: ShoppingBasket },
    { key: 'journal', icon: NotebookPen },
  ]

  return (
    <form
      className="mt-2 mb-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        void file('note')
      }}
    >
      {/* Several lines, because a thought caught on the way past is rarely one.
          Enter therefore makes a new line and ctrl-enter files it, which is the
          opposite of the one-line boxes elsewhere and the right way round for a
          box you are meant to think in. */}
      <Textarea
        value={line}
        onChange={(event) => setLine(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void file('note')
        }}
        placeholder={t('home.capture')}
        disabled={busy}
        rows={2}
        aria-label={t('home.capture')}
        className="resize-y"
      />
      {/* Hidden until there is something to file, so an empty home page stays
          one quiet line rather than a row of buttons waiting to be understood. */}
      <div className={cn('mt-2 flex flex-wrap gap-2', !typed && 'hidden')}>
        {where.map((one) => (
          <Button
            key={one.key}
            type="button"
            variant={one.key === 'note' ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => void file(one.key)}
          >
            <one.icon className="size-4" />
            {t(`home.fileTo.${one.key}`)}
          </Button>
        ))}
      </div>
    </form>
  )
}

/*
Only what wants doing: what is broken, what is due, tonight's habits, what has
run out. Every row here has a next step, starting with the box that puts one
there. The page used to carry record counts, the month's recurring money and
recently touched projects as well — reference figures that change when
something is edited, not things to check on, and each has a page of its own.
*/
export default function Overview() {
  const { t, tOpt } = useT()
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState('')
  const [range, setRange] = useRemembered('hq.window', WINDOWS, '7')
  // The row whose actions are open, or null. One sheet for the whole list
  // rather than one per row.
  const [acting, setActing] = useState<CalendarEntry | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    api
      .overview()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />

  const low = data.low_supplies ?? []
  const trouble = data.trouble ?? []
  const quiet = data.stale_monitors ?? []
  /*
  Closing off a date, and saying what you did about it.

  A bare tick would record that something happened and lose the one part worth
  keeping. A menu of guessed-at actions is no better: what was actually done
  about a birthday is a sentence, not one of three buttons. So the sheet asks,
  and takes whatever is typed — including nothing, because a date dealt with
  and not written up is still dealt with.

  The note is filed against the occurrence rather than the person, so next
  year's comes back on its own with nothing written on it yet.
  */
  async function act(entry: CalendarEntry, note: string) {
    setActing(null)
    setNote('')
    try {
      await api.markCalendarEntry(entry.kind, entry.url, entry.date, true, note.trim())
      toast.success(t('cal.marked'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('home.captureFailed'))
    }
  }

  const counts = data.open_tasks ?? {}
  const piles = ([
    ['note', '/notes', 'home.openNote'],
    ['todo', '/todo', 'home.openTodo'],
    ['buy', '/shopping', 'home.openBuy'],
  ] as const).filter(([kind]) => (counts[kind] ?? 0) > 0)
  const ahead = Number(range)
  const overdue = (data.upcoming ?? []).filter((e) => (daysUntil(e.date) ?? 0) < 0)
  const soon = (data.upcoming ?? []).filter((e) => {
    const days = daysUntil(e.date) ?? 0
    return days >= 0 && days <= ahead
  })

  return (
    <>
      <PageHeader title={t('home.title')} />

      <Capture onFiled={load} />

      {/* What capture has piled up. None of these lists carries a deadline, so
          this line is the only thing on the page that would ever mention them
          again. */}
      {piles.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {piles.map(([kind, to, key]) => (
            <Link key={kind} to={to} className="hover:text-foreground hover:underline">
              {t(key, { n: counts[kind] ?? 0 })}
            </Link>
          ))}
        </div>
      )}

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
      {quiet.length + trouble.length + overdue.length + soon.length === 0 ? (
        <Card className="px-4 py-3 text-sm text-muted-foreground">
          {t('home.needsActionEmpty', { n: ahead })}
        </Card>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {/* A checker that has gone quiet comes first, above whatever it last
              managed to report: it cannot report its own death, so silence is
              the one failure nothing else on this page would ever mention.
              Amber rather than red — it is not known to be broken, it is
              unknown, which is a different thing to walk into. */}
          {quiet.map((monitor) => (
            <Link
              key={monitor.source}
              to="/monitor"
              className="flex items-center gap-3 border-l-2 border-l-warning px-4 py-3 transition-colors hover:bg-accent"
            >
              <span className="size-2 shrink-0 rounded-full bg-warning ring-3 ring-warning/20" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{monitor.source}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {t('monitor.silent', { for: since(monitor.last_seen_at, t) })}
                </div>
              </div>
            </Link>
          ))}
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
            <EntryRow
              key={`${entry.kind}-${entry.url}-${entry.date}`}
              entry={entry}
              onActions={() => {
                setNote('')
                setActing(entry)
              }}
            />
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

      {/* Centred rather than a sheet up from the foot of the screen. The
          calendar uses a sheet, but what it puts in one is a whole day's list,
          which wants the width. This is a single line about a single row, and
          a bar across the bottom of a desktop window for that reads as more
          than it is. */}
      <Dialog open={acting !== null} onOpenChange={(open) => !open && setActing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="lowercase">{t('cal.actions')}</DialogTitle>
          <DialogDescription>
            {acting?.label}
            <span className="ml-2 text-muted-foreground">{acting?.detail}</span>
          </DialogDescription>
          {acting && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                void act(acting, note)
              }}
            >
              <Textarea
                value={note}
                autoFocus
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    void act(acting, note)
                  }
                }}
                placeholder={t('cal.actionPlaceholder')}
                rows={3}
                aria-label={t('cal.actions')}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button type="submit">{t('cal.actionSave')}</Button>
                {/* An empty note still closes the date off. Saying so out loud
                    keeps the box from reading as something you have to fill. */}
                <span className="text-xs text-muted-foreground">{t('cal.actionHint')}</span>
                {/* The row used to be a link and is now a button, so the way to
                    the record itself lives in here. */}
                <Link
                  to={acting.url}
                  onClick={() => setActing(null)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  {t('cal.actionOpen')}
                </Link>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
