import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, Flame, GripVertical, ListChecks, Plus, Repeat2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { currentLocale, useT } from '@/i18n'
import type { Habit } from '@/types'
import { cn } from '@/lib/utils'
import { hqDay, keyOf } from '@/lib/day'
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

// Oldest first, today last. The run starts from the day it is now by the
// three-o'clock rule, so the last cell is the same day the check-in ticks and
// the small hours after midnight sit on the day that just ended. Noon rather
// than midnight so a daylight-saving shift cannot roll a date backwards while
// stepping through them.
function recentDays(span: number): Day[] {
  const short = new Intl.DateTimeFormat(currentLocale(), { weekday: 'narrow' })
  const out: Day[] = []
  for (let back = span - 1; back >= 0; back--) {
    const day = hqDay()
    day.setHours(12, 0, 0, 0)
    day.setDate(day.getDate() - back)
    out.push({ key: keyOf(day), label: short.format(day), today: back === 0 })
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
  // Hidden habits drop off the board the moment they are hidden; this reveals
  // them again so they can be unhidden or managed.
  const [showHidden, setShowHidden] = useState(false)
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [span, setSpan] = useState<Span>('7')
  // Which row is being dragged, for the grip reorder below. dragRef mirrors it
  // for the pointer handlers to read without a stale closure; rowRefs and
  // habitsRef give them the live row positions and order.
  const [dragId, setDragId] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)
  const rowRefs = useRef(new Map<number, HTMLElement>())
  const habitsRef = useRef<Habit[]>([])
  habitsRef.current = habits ?? []
  // The list itself, so the drag reads positions relative to it, and the last
  // top of every row, so a reorder can be played as a slide rather than a jump.
  const listRef = useRef<HTMLDivElement>(null)
  const prevTops = useRef(new Map<number, number>())
  // Where inside the held row the finger took hold, and where it is now, so the
  // row can be kept pinned under it as the list reshuffles beneath.
  const grabOffset = useRef(0)
  const pointerY = useRef(0)

  /*
  FLIP: after the order changes, each row that moved is slid from where it was
  to where it landed, so a reorder reads as motion instead of a teleport.

  Positions come off offsetTop, not getBoundingClientRect, on purpose: offsetTop
  is the layout position and ignores the transform this animation rides on, so
  the drag's own hit-testing below stays honest even while rows are mid-slide.
  The Web Animations API plays the slide without leaving any inline style behind.
  The held row is left out of this — it does not slide between slots, it follows
  the finger, which placeDragged handles once the shuffle has re-rendered it.
  */
  useLayoutEffect(() => {
    const rows = rowRefs.current
    const next = new Map<number, number>()
    for (const [id, el] of rows) next.set(id, el.offsetTop)
    for (const [id, el] of rows) {
      const was = prevTops.current.get(id)
      const now = next.get(id)!
      if (was !== undefined && was !== now && id !== dragRef.current) {
        el.animate(
          [{ transform: `translateY(${was - now}px)` }, { transform: 'translateY(0)' }],
          { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        )
      }
    }
    prevTops.current = next
    // The shuffle just moved the held row's slot; pin it back to the finger.
    placeDragged()
  })
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
      await api.createHabit({
        name: trimmed,
        notes: '',
        unit: '',
        active: true,
        private: false,
        supply_id: null,
        per_day: 1,
      })
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
    // A habit that counts something is asked how many rather than whether: the
    // tick is already implied by there being a number. Unticking asks nothing
    // extra, and a habit without a unit is worth one as it always was.
    const counted = done && habit.unit !== ''
    // One done-day defaults to the habit's per-day figure — two fish oil, one of
    // most things — so a linked habit takes the right amount off the shelf even
    // when it has no unit to be asked about.
    const step = habit.per_day || 1
    let typed = String(habit.amounts[day] ?? step)
    const ok = await ask({
      title: t(done ? 'habit.confirmTick' : 'habit.confirmUntick', {
        name: habit.name,
        date: formatDate(day),
      }),
      confirmLabel: t(done ? 'habit.yesTick' : 'habit.yesUntick'),
      danger: !done,
      input: counted
        ? {
            label: t('habit.howMany', { unit: habit.unit }),
            initial: typed,
            onValue: (value) => {
              typed = value
            },
          }
        : undefined,
    })
    if (!ok) return

    // An emptied box means the same as leaving it alone: the per-day figure,
    // which is what the tick would have meant anyway.
    const amount = counted ? Number(typed) || step : done ? step : 1

    setHabits((list) =>
      (list ?? []).map((row) =>
        row.id === habit.id
          ? {
              ...row,
              days: done ? [...row.days, day] : row.days.filter((d) => d !== day),
              // load() below replaces this with what was stored; it is here so
              // the cell fills in with the right number under the finger. Only
              // for a counted habit: the others draw a tick, and a stray 1 here
              // would flash a number in a column that never shows one.
              amounts:
                done && counted
                  ? { ...row.amounts, [day]: amount }
                  : Object.fromEntries(
                      Object.entries(row.amounts).filter(([key]) => key !== day),
                    ),
            }
          : row,
      ),
    )
    try {
      await api.setHabitDay(habit.id, day, done, amount)
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

  // Mark a habit private, or unmark it. A private one drops off the board while
  // the eye by the heading has the page covered, so it can be shown to someone
  // without them seeing it.
  async function togglePrivate(habit: Habit) {
    const next = !habit.private
    setHabits((list) =>
      (list ?? []).map((row) => (row.id === habit.id ? { ...row, private: next } : row)),
    )
    try {
      await api.updateHabit(habit.id, {
        name: habit.name,
        notes: habit.notes,
        unit: habit.unit,
        active: habit.active,
        private: next,
        supply_id: habit.supply_id,
        per_day: habit.per_day,
      })
    } catch {
      toast.error(t('habit.failed'))
      load()
    }
  }

  /*
  Drag a row by its grip to reorder.

  Pointer events rather than the native HTML5 drag, because that one never fires
  under a thumb; touch-none on the handle stops the page scrolling while a row is
  moving. The held row follows the finger; the rest slide out of its way and the
  order is saved once it lifts.
  */

  // Pin the held row to the finger. Its slot in the layout may be anywhere as
  // the list reshuffles under it, so it is translated from that slot to where
  // the finger holds it. offsetTop is the untransformed slot, so this reads
  // right even though the row already wears a transform.
  function placeDragged() {
    const id = dragRef.current
    if (id === null) return
    const el = rowRefs.current.get(id)
    const list = listRef.current
    if (!el || !list) return
    const slotTop = list.getBoundingClientRect().top + el.offsetTop
    const y = pointerY.current - grabOffset.current - slotTop
    el.style.transform = `translateY(${y}px) scale(1.03)`
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: number) {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer has nothing to capture; harmless.
    }
    const row = rowRefs.current.get(id)
    // How far down the row the finger landed, held constant so the row does not
    // jump under it on the first move.
    grabOffset.current = event.clientY - (row?.getBoundingClientRect().top ?? event.clientY)
    pointerY.current = event.clientY
    dragRef.current = id
    setDragId(id)
  }

  function onDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current === null) return
    pointerY.current = event.clientY
    const list = listRef.current
    if (!list) return
    const order = habitsRef.current
    // The pointer in the list's own coordinates, tested against each row's
    // offsetTop. offsetTop rather than a live rect on purpose: a row sliding
    // mid-animation must not move the target out from under the finger.
    const y = event.clientY - list.getBoundingClientRect().top
    // The first row whose middle the pointer has passed is where the dragged
    // row belongs; past the last middle, it belongs at the end.
    let target = order.length - 1
    for (let i = 0; i < order.length; i++) {
      const el = rowRefs.current.get(order[i].id)
      if (!el) continue
      if (y < el.offsetTop + el.offsetHeight / 2) {
        target = i
        break
      }
    }
    const from = order.findIndex((h) => h.id === dragRef.current)
    if (from !== -1 && from !== target) {
      const next = [...order]
      const [moved] = next.splice(from, 1)
      next.splice(target, 0, moved)
      setHabits(next)
    }
    // Follow the finger now; if the line above reshuffled, the layout effect
    // re-pins it from its new slot so it never lurches.
    placeDragged()
  }

  async function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current === null) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Capture may already be gone; nothing to release.
    }
    const id = dragRef.current
    const el = rowRefs.current.get(id)
    // Let go: settle from where the finger left it down into its slot rather
    // than blinking there.
    if (el) {
      const from = el.style.transform
      el.style.transform = ''
      if (from) {
        el.animate(
          [{ transform: from }, { transform: 'none' }],
          { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        )
      }
    }
    dragRef.current = null
    setDragId(null)
    try {
      await api.reorderHabits(habitsRef.current.map((row) => row.id))
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
            {/* relative so a row's offsetTop is measured against this list, which
                is what the drag's hit-testing reads. */}
            <div ref={listRef} className="relative divide-y">
              {/* Hidden habits are off the board unless "show hidden" is on. */}
              {(showHidden ? habits : habits.filter((row) => !row.private)).map((habit) => (
                <div
                  key={habit.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(habit.id, el)
                    else rowRefs.current.delete(habit.id)
                  }}
                  className={cn(
                    // Only the shadow eases; the transform is driven every frame
                    // to follow the finger, so a transition on it would lag.
                    'flex flex-wrap items-center gap-x-3 gap-y-2 bg-card px-4 py-3 transition-shadow duration-150',
                    // Only visible while revealed, and dimmed so it reads as one
                    // of the hidden ones.
                    habit.private && 'opacity-60',
                    // Picked up: lifted with a shadow and pinned to the finger.
                    // The scale rides on the same inline transform the follow
                    // sets, so it is not applied here.
                    dragId === habit.id && 'relative z-20 rounded-lg shadow-lg',
                  )}
                >
                  {/* Drag by the grip to reorder — on the left, where a handle
                      is looked for. Pointer events, not native HTML5 drag, so it
                      works under a thumb; touch-none stops the page scrolling
                      while a row is moving. */}
                  <button
                    type="button"
                    aria-label={t('habit.drag')}
                    title={t('habit.drag')}
                    onPointerDown={(event) => startDrag(event, habit.id)}
                    onPointerMove={onDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="order-0 -ml-1 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" />
                  </button>
                  {/* The name grows to fill the row, which pushes the hide and
                      delete buttons hard to the right rather than leaving them
                      stranded on a line of their own. The cells take a full
                      basis on a phone so they drop below instead of squeezing
                      the name; a wide screen puts them back inline. */}
                  <div className="order-1 min-w-0 flex-1">
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
                    {/* Wraps rather than running under the buttons: a counted
                        habit's total makes this line long, and the name column
                        is only as wide as the row minus the grip and the two
                        buttons. */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {habit.streak > 0 && (
                        <span className="flex items-center gap-1 whitespace-nowrap text-warning">
                          <Flame className="size-3" />
                          {t('habit.streak', { n: habit.streak })}
                        </span>
                      )}
                      <span className="whitespace-nowrap">
                        {t('habit.lastSeven', { n: habit.last_seven })}
                      </span>
                      {/* Only for the ones that count something. A total of
                          days is already the number to the left of this. */}
                      {habit.unit !== '' && habit.total > 0 && (
                        <span className="whitespace-nowrap font-medium text-foreground">
                          {habit.total} {habit.unit}
                        </span>
                      )}
                    </p>
                  </div>

                  <span className="order-3 basis-full shrink-0 sm:order-2 sm:basis-auto">
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
                            {/* The number when there is one, the tick when
                                there is not. A habit that counts something
                                has already answered "did you" by being
                                filled in, so the cell can spend itself on
                                the part you cannot see otherwise. */}
                            {habit.days.includes(day.key) &&
                              (habit.amounts[day.key] ? (
                                <span className="text-xs font-semibold tabular-nums">
                                  {habit.amounts[day.key]}
                                </span>
                              ) : (
                                <Check className="size-4" />
                              ))}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>

                  <div className="order-2 flex shrink-0 items-center sm:order-3">
                    {/* Hide this one: it drops off the board at once, so a habit
                        not meant for a passing audience is gone with a tap. The
                        eye-off marks it while "show hidden" has it revealed. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePrivate(habit)}
                      aria-label={habit.private ? t('habit.unhide') : t('habit.hide')}
                      title={habit.private ? t('habit.unhide') : t('habit.hide')}
                      className={cn(habit.private ? 'text-primary' : 'text-muted-foreground')}
                    >
                      {habit.private ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
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

      {/* The way back to anything hidden — only shown when there is something to
          reveal, so it is invisible until the feature is used. */}
      {habits && habits.some((row) => row.private) && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showHidden
              ? t('habit.hideHidden')
              : t('habit.showHidden', { n: habits.filter((row) => row.private).length })}
          </Button>
        </div>
      )}
    </div>
  )
}
