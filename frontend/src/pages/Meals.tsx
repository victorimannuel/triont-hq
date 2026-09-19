import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { DayTotal, Meal, Nutrition } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'

/**
 * A day's eating, and the week behind it.
 *
 * The day is the unit because that is the question anyone actually asks of a
 * food log — not "what did I have on the 4th" but "how am I doing today". The
 * week sits underneath as a strip rather than a chart: it is there to say
 * whether today is unusual, and a bar is enough to answer that.
 */

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const round = (n: number) => Math.round(n)

/** The three macros under the headline number, in the order they get read. */
function Macros({ totals, className }: { totals: Nutrition; className?: string }) {
  const { t } = useT()
  const parts = [
    [t('meal.protein'), totals.protein_g],
    [t('meal.carbs'), totals.carbs_g],
    [t('meal.fat'), totals.fat_g],
  ] as const

  return (
    <div className={cn('flex gap-4 text-xs text-muted-foreground', className)}>
      {parts.map(([label, value]) => (
        <span key={label}>
          {label} <span className="tabular-nums text-foreground">{round(value)} g</span>
        </span>
      ))}
    </div>
  )
}

/*
The week, as bars.

Scaled to the tallest day rather than to a target, because there is no target
here and inventing one would be inventing a verdict. The tallest bar is simply
the biggest day; everything else is read against it.
*/
function Week({ days, on, onPick }: { days: DayTotal[]; on: string; onPick: (day: string) => void }) {
  const { t } = useT()
  const top = Math.max(1, ...days.map((day) => day.totals.kcal))
  const logged = days.filter((day) => day.meals > 0)
  const average = logged.length
    ? logged.reduce((sum, day) => sum + day.totals.kcal, 0) / logged.length
    : 0

  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium lowercase">{t('meal.week')}</p>
          {average > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {t('meal.perDay', { n: round(average) })}
            </p>
          )}
        </div>
        <div className="flex items-end gap-1.5">
          {days.map((day) => (
            <button
              key={day.on}
              type="button"
              onClick={() => onPick(day.on)}
              className="flex flex-1 flex-col items-center gap-1"
              aria-label={day.on}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {day.totals.kcal > 0 ? round(day.totals.kcal) : ''}
              </span>
              <span
                className={cn(
                  'w-full rounded-sm transition-all',
                  day.on === on ? 'bg-primary' : 'bg-primary/25',
                )}
                // A day with nothing on it still gets a sliver, so the gap is
                // visible as a gap rather than as an absence of anything.
                style={{ height: `${Math.max(2, (day.totals.kcal / top) * 56)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">
                {new Date(`${day.on}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Meals() {
  const { t, tOpt } = useT()
  const navigate = useNavigate()

  const [on, setOn] = useState(() => dayKey(new Date()))
  const [meals, setMeals] = useState<Meal[] | null>(null)
  const [totals, setTotals] = useState<Nutrition | null>(null)
  const [days, setDays] = useState<DayTotal[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .meals(on)
      .then((data) => {
        setMeals(data.meals)
        setTotals(data.totals)
        setDays(data.days)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('meal.failed')))
  }, [on, t])

  useEffect(load, [load])

  const today = useMemo(() => dayKey(new Date()), [])

  function shift(by: number) {
    const at = new Date(`${on}T00:00:00`)
    at.setDate(at.getDate() + by)
    setOn(dayKey(at))
  }

  /*
  A new meal is created before the form opens rather than after it is filled
  in. The photo is the point of this module and a photo has to attach to a row
  that exists, so the row exists first and the form is always an edit.
  */
  async function start() {
    setBusy(true)
    try {
      const meal = await api.createMeal({
        eaten_at: new Date().toISOString(),
        kind: guessKind(),
        notes: '',
        items: [],
      })
      navigate(`/makan/${meal.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meal.failed'))
      setBusy(false)
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (meals === null || totals === null) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('meal.title')}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/makan/daftar">{t('meal.foods')}</Link>
            </Button>
            <Button onClick={start} disabled={busy}>
              <Plus className="size-4" />
              {t('meal.new')}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="-1">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="font-medium lowercase">
            {on === today
              ? t('meal.today')
              : new Date(`${on}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t('meal.mealCount', { n: meals.length })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => shift(1)}
          disabled={on >= today}
          aria-label="+1"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-2 px-4 py-5 text-center">
          <p className="text-4xl font-semibold tabular-nums tracking-tight">
            {round(totals.kcal)}
            <span className="ml-1.5 text-base font-normal text-muted-foreground">
              {t('meal.kcal')}
            </span>
          </p>
          <Macros totals={totals} className="justify-center" />
        </CardContent>
      </Card>

      <Week days={days} on={on} onPick={setOn} />

      {meals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <UtensilsCrossed className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('meal.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {meals.map((meal) => (
            <Card key={meal.id} className="overflow-hidden">
              <Link to={`/makan/${meal.id}`} className="flex items-stretch gap-3">
                {meal.image_id !== null ? (
                  <img
                    src={api.downloadUrl(meal.image_id)}
                    alt=""
                    className="size-20 shrink-0 object-cover"
                  />
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center bg-muted/40">
                    <UtensilsCrossed className="size-5 text-muted-foreground" />
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1 py-3 pr-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium lowercase">
                      {tOpt('mealkind', meal.kind, meal.kind)}
                    </p>
                    <p className="shrink-0 text-sm tabular-nums">
                      {round(meal.totals.kcal)} {t('meal.kcal')}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {meal.items.length
                      ? meal.items.map((item) => `${trimCount(item.count)} ${item.name}`).join(', ')
                      : t('meal.noItems')}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {new Date(meal.eaten_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** "2" not "2.00", but half a centong stays half. */
export const trimCount = (n: number) => (Number.isInteger(n) ? String(n) : String(n))

/*
Which meal it probably is, from the clock.

Only a starting value — the dropdown is right there. It exists because getting
it right most of the time removes a decision from the one moment when nobody
wants to make one, which is while the food is going cold.
*/
function guessKind() {
  const hour = new Date().getHours()
  if (hour < 10) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}
