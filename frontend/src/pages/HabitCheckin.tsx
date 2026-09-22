import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, LayoutGrid, NotebookPen, PartyPopper, Repeat2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Habit } from '@/types'
import { cn } from '@/lib/utils'
import { todayKey } from '@/lib/day'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, formatDay, Loading, PageHeader, Stepper } from '@/components/bits'

/**
 * The evening check-in, which is where the notification lands. One habit at a
 * time and two big buttons: from a lock screen at half past nine, the whole
 * thing has to be answerable without aiming at anything.
 *
 * It asks about every habit, not only the ones still open, so a tick made by
 * mistake earlier can be taken back in the same pass.
 */

/**
 * The way to the seven-day board. The arrow beside the title goes there too,
 * but an arrow says "back" and on a phone this page is where you arrived, not
 * somewhere you came through — so the board needs saying by name.
 */
function BoardLink() {
  const { t } = useT()
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/habits">
        <LayoutGrid className="size-4" />
        {t('checkin.board')}
      </Link>
    </Button>
  )
}

type Mode = 'focus' | 'full'

/*
Focus or the full cycle. Focus is the default and the point of the page; the
full cycle is here for the night you want to walk past everything, ticked or
not. Flipping it starts the run over in the new order.
*/
function ModeToggle({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const { t } = useT()
  return (
    <div className="flex rounded-md border p-0.5 text-xs font-medium">
      {(['focus', 'full'] as Mode[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onMode(option)}
          className={cn(
            'rounded px-2 py-1 transition-colors',
            mode === option
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`checkin.${option}`)}
        </button>
      ))}
    </div>
  )
}

/*
The run is a frame rather than a page that grows around what is in it.

Habits do not carry the same things: one has a picture, one has a note, one
asks how many. If the card simply took the height of whatever it held, the two
answer buttons would land somewhere different on every question, and they are
the one part of this page a thumb aims at without looking. So the frame is a
fixed height, the buttons are pinned to the foot of it, and the reading matter
takes whatever room is left above.

The counter rides directly above the buttons for the same reason: on the
habits that have one it is the second thing touched, so it sits in the same
place too, and its absence is absorbed by the space above rather than by
sliding everything down.
*/
// The frame is free to grow with its header; what must hold still is the answer
// card, so that carries a fixed height of its own (below). A minimum here rather
// than a fixed height means a tall header on a small screen scrolls instead of
// clipping the card.
const FRAME = 'mx-auto flex min-h-[calc(100dvh-15rem)] max-w-lg flex-col md:min-h-[32rem]'

/** A bar rather than a number: it says "nearly there" at a glance. */
function Progress({ at, steps }: { at: number; steps: number }) {
  return (
    <div className="mb-4 h-1 shrink-0 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${(at / steps) * 100}%` }}
      />
    </div>
  )
}

/** Always drawn, invisible on the first question, so the frame keeps its shape. */
function BackStep({ show, onBack }: { show: boolean; onBack: () => void }) {
  const { t } = useT()
  return (
    <div className="mt-3 flex shrink-0 justify-start">
      <Button variant="ghost" size="sm" className={cn(!show && 'invisible')} onClick={onBack}>
        <ArrowLeft className="size-4" />
        {t('checkin.back')}
      </Button>
    </div>
  )
}

/*
The order the run walks its habits in. "full" is the plain stored order, every
habit. "focus" front-loads what still needs doing: the plain yes/no ones you tap
straight through, then the ones that want a number. The already-ticked ones come
after, there only to be looked over — and among those the countable ones lead,
since a recorded number is what you might come back and fix, a bare tick is not.
Worked out once when a run starts and then held still, so answering a habit does
not make it jump.
*/
function runOrder(list: Habit[], mode: Mode, today: string): number[] {
  if (mode === 'full') return list.map((habit) => habit.id)
  const undone = list.filter((habit) => !habit.days.includes(today))
  const done = list.filter((habit) => habit.days.includes(today))
  const counted = (rows: Habit[]) => rows.filter((habit) => habit.unit !== '')
  const plain = (rows: Habit[]) => rows.filter((habit) => habit.unit === '')
  return [...plain(undone), ...counted(undone), ...counted(done), ...plain(done)].map(
    (habit) => habit.id,
  )
}

export default function HabitCheckin() {
  const { t } = useT()
  const confirm = useConfirm()
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [error, setError] = useState('')
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)
  // The last question. Loaded with the habits so the whole run is offline
  // of the server once it starts.
  const [line, setLine] = useState<string | null>(null)
  // What the habit on screen counted today, for the ones that count. Held as
  // the typed string rather than a number so the field can be empty, which is
  // not the same as nought.
  const [count, setCount] = useState('')
  // Default to focus: the point of the evening is the ones still open. "full"
  // walks everything the way the board reads, for a deliberate review.
  const [mode, setMode] = useState<Mode>('focus')
  // The frozen run order as habit ids. Set on load, on a mode flip, and on
  // "again" — never mid-run, so a habit stays put as it is answered.
  const [order, setOrder] = useState<number[]>([])
  const today = useMemo(todayKey, [])

  // The habits in run order, but live: the order is frozen while each habit
  // still reflects what it recorded, so a tick shows without moving the row.
  const seq = useMemo(
    () =>
      order
        .map((id) => habits?.find((habit) => habit.id === id))
        .filter((habit): habit is Habit => Boolean(habit)),
    [order, habits],
  )

  const load = useCallback(() => {
    api
      .habits(1)
      .then((data) => {
        // Private habits stay in the run: hiding is about the board a passing
        // audience sees, not about the owner's own evening routine.
        const active = data.habits.filter((habit) => habit.active)
        setHabits(active)
        setOrder(runOrder(active, 'focus', todayKey()))
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('habit.failed')))
  }, [t])

  useEffect(() => {
    api
      .journalDay(todayKey())
      .then((entry) => setLine(entry.line))
      .catch(() => setLine(''))
  }, [])

  useEffect(load, [load])

  /*
  Each question starts on what that habit already recorded today, so a second
  pass through corrects a number instead of asking for it again. A day with
  nothing on it starts at one, which is the answer most nights.

  It has to be a real value and not a placeholder: a greyed-out 1 that is
  really an empty field means the first press of + moves the number from
  nothing to one and looks like it did nothing at all.
  */
  useEffect(() => {
    const current = seq[at]
    // Starts on what today already recorded, else the habit's per-day figure —
    // so fish oil comes up as two without a tap, and a plain habit as one.
    setCount(current && current.today > 0 ? String(current.today) : String(current?.per_day || 1))
  }, [at, seq])

  async function answer(habit: Habit, done: boolean, amount = 0) {
    if (busy) return
    setBusy(true)
    // Recorded in place so the next question comes up at once. The counts on
    // the board are re-read when it is opened; nothing here shows them.
    setHabits((list) =>
      (list ?? []).map((row) =>
        row.id === habit.id
          ? {
              ...row,
              days: done ? [today] : row.days.filter((d) => d !== today),
              today: done ? amount || 1 : 0,
            }
          : row,
      ),
    )
    setAt((n) => n + 1)
    try {
      await api.setHabitDay(habit.id, today, done, amount)
    } catch {
      toast.error(t('habit.failed'))
    } finally {
      setBusy(false)
    }
  }

  // Saying "belum" on a habit already ticked today throws away a real check, so
  // it asks first. On one that is not ticked there is nothing to undo, so it
  // goes straight through to the next question.
  async function markNo(habit: Habit) {
    if (busy) return
    if (habit.days.includes(today)) {
      const ok = await confirm({
        title: t('checkin.uncheckTitle'),
        body: t('checkin.uncheckBody', { name: habit.name }),
        confirmLabel: t('checkin.uncheckYes'),
        danger: true,
      })
      if (!ok) return
    }
    answer(habit, false)
  }

  // Flip focus/full and start the run over in the new order. A no-op on the
  // mode already showing, and before the habits are in.
  function switchMode(next: Mode) {
    if (next === mode || !habits) return
    setMode(next)
    setOrder(runOrder(habits, next, today))
    setAt(0)
  }

  async function saveLine() {
    setAt((n) => n + 1)
    try {
      await api.setJournalLine(today, line ?? '')
    } catch {
      toast.error(t('journal.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (habits === null) return <Loading />

  if (habits.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader
          title={t('checkin.title')}
          description={formatDay(today)}
          back="/habits"
          action={<BoardLink />}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Repeat2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('habit.empty')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // The habits, then one more question. A journal you have to go and open is
  // one you stop writing, so it rides along at the end of a run you are
  // already doing.
  const steps = seq.length + 1

  if (at === seq.length) {
    return (
      <div className={FRAME}>
        <PageHeader
          title={t('checkin.title')}
          description={
            <>
              {formatDay(today)} · {t('checkin.progress', { n: steps, total: steps })}
            </>
          }
          back="/habits"
          action={<BoardLink />}
        />
        <Progress at={at} steps={steps} />

        <Card className="flex flex-1 flex-col">
          <CardContent className="flex flex-1 flex-col gap-6 py-8">
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto text-center">
              <NotebookPen className="mx-auto size-6 text-muted-foreground" />
              <h2 className="text-xl font-semibold tracking-tight">{t('checkin.journal')}</h2>
              <p className="text-sm text-muted-foreground">{t('checkin.journalHint')}</p>
            </div>

            {/* In the slot the counter uses on a habit, so the last question
                answers with the same two movements as the ones before it. */}
            <Input
              value={line ?? ''}
              autoFocus
              maxLength={500}
              placeholder={t('journal.placeholder')}
              onChange={(event) => setLine(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && saveLine()}
              className="shrink-0"
            />

            <div className="flex shrink-0 gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-16 flex-1 text-base"
                onClick={() => setAt((n) => n + 1)}
              >
                {t('checkin.skip')}
              </Button>
              <Button size="lg" className="h-16 flex-1 text-base" onClick={saveLine}>
                <Check className="size-5" />
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <BackStep show onBack={() => setAt((n) => n - 1)} />
      </div>
    )
  }

  // Past the last question: what the evening came to, and the way out.
  if (at > seq.length) {
    const done = habits.filter((habit) => habit.days.includes(today))
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader
          title={t('checkin.title')}
          description={formatDay(today)}
          back="/habits"
          action={<BoardLink />}
        />
        <Card>
          <CardContent className="space-y-5 py-10 text-center">
            <PartyPopper className="mx-auto size-8 text-primary" />
            <p className="text-lg font-medium">
              {t('checkin.done', { n: done.length, total: habits.length })}
            </p>

            <div className="mx-auto max-w-xs space-y-1 text-left">
              {habits.map((habit) => {
                const ticked = habit.days.includes(today)
                return (
                  <p key={habit.id} className="flex items-center gap-2 text-sm">
                    {ticked ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <X className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn('min-w-0 truncate', !ticked && 'text-muted-foreground')}>
                      {habit.name}
                    </span>
                    {ticked && habit.unit !== '' && (
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                        {habit.today} {habit.unit}
                      </span>
                    )}
                  </p>
                )
              })}
            </div>

            {line && line.trim() !== '' && (
              <p className="mx-auto max-w-xs border-t pt-4 text-sm italic text-muted-foreground">
                “{line}”
              </p>
            )}

            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  // Re-sort for the second pass: whatever got ticked drops to the back.
                  setOrder(runOrder(habits, mode, today))
                  setAt(0)
                }}
              >
                <ArrowLeft className="size-4" />
                {t('checkin.again')}
              </Button>
              <Button asChild>
                <Link to="/habits">{t('checkin.toBoard')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const habit = seq[at]
  const ticked = habit.days.includes(today)

  return (
    <div className={FRAME}>
      <PageHeader
        title={t('checkin.title')}
        description={
          <>
            {formatDay(today)} · {t('checkin.progress', { n: at + 1, total: steps })}
          </>
        }
        back="/habits"
        action={
          <div className="flex items-center gap-2">
            <ModeToggle mode={mode} onMode={switchMode} />
            <BoardLink />
          </div>
        }
      />

      <Progress at={at} steps={steps} />

      {/* A fixed height, so the answer buttons at its foot land in the same
          place every question. Whatever a habit carries above them — a picture,
          a note, the counter, the already-ticked line — is taken up by the
          reading area, which scrolls inside this height rather than growing the
          card and sliding the buttons down. */}
      <Card className="flex h-[26rem] shrink-0 flex-col md:h-[30rem]">
        <CardContent className="flex flex-1 flex-col gap-6 py-8">
          {/* Everything you read. It takes the room the answer does not, and
              scrolls within itself on a short screen rather than pushing the
              buttons about. */}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto">
            {/* The picture, above the question. This is what it is for: six
                questions at half past nine go faster when each one looks like
                something rather than reading like something. Cropped to a band,
                because a portrait photo shown whole would crowd out the rest. */}
            {habit.image_id !== null && (
              <img
                src={api.downloadUrl(habit.image_id)}
                alt=""
                className="mx-auto h-40 w-full max-w-sm shrink-0 rounded-lg object-cover"
              />
            )}

            <div className="space-y-2 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('checkin.question')}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">{habit.name}</h2>
              {habit.notes && <p className="text-sm text-muted-foreground">{habit.notes}</p>}
              {/* Only when it is already answered, so the pass can be a
                  correction rather than a fresh set of questions. */}
              {ticked && <p className="text-xs text-primary">{t('checkin.alreadyTicked')}</p>}
            </div>
          </div>

          {/* A habit with a unit asks how many rather than whether. The slot is
              always drawn at a fixed height, empty on a plain yes/no habit, so
              the two answer buttons below land in exactly the same place every
              question instead of dropping whenever a counter appears. The field
              left empty still means once, so a plain "ya" needs no number. */}
          <div className="flex h-24 shrink-0 items-center justify-center">
            {habit.unit !== '' && (
              <Stepper
                big
                value={count}
                onValue={setCount}
                label={habit.unit}
                caption={habit.unit}
                disabled={busy}
              />
            )}
          </div>

          <div className="flex shrink-0 gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-16 flex-1 text-base"
              disabled={busy}
              onClick={() => markNo(habit)}
            >
              <X className="size-5" />
              {t('checkin.no')}
            </Button>
            <Button
              size="lg"
              className="h-16 flex-1 text-base"
              disabled={busy}
              onClick={() => answer(habit, true, Number(count) || 0)}
            >
              <Check className="size-5" />
              {t('checkin.yes')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <BackStep show={at > 0} onBack={() => setAt((n) => n - 1)} />
    </div>
  )
}
