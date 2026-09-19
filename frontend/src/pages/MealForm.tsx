import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Food, Meal, MealItemInput } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/confirm'
import { Files } from '@/components/Files'
import { ErrorNote, Field, Loading, PageHeader, Stepper } from '@/components/bits'

/**
 * One sitting.
 *
 * The photo does the naming and a person does the counting. That split is the
 * whole design: a model can tell rice from noodles off a photograph, but a
 * portion has no scale in a picture, so every count it proposes arrives marked
 * as a guess and stays marked until it has been touched.
 */

// One line on the plate while it is being edited. The food behind it is kept
// as the whole row rather than an id, because the numbers on screen — grams,
// calories — come from it on every keystroke.
type Row = {
  food: Food | null
  name: string
  unit: string
  count: number
  guessed: boolean
}

const round = (n: number) => Math.round(n)

/** What one row comes to, given the food behind it. */
function rowTotals(row: Row) {
  if (!row.food) return { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 }
  const grams = row.count * row.food.grams
  const per = grams / 100
  return {
    kcal: row.food.kcal * per,
    protein: row.food.protein_g * per,
    carbs: row.food.carbs_g * per,
    fat: row.food.fat_g * per,
    grams,
  }
}

export default function MealForm() {
  const { id } = useParams()
  const mealID = Number(id)
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const meta = useMeta()
  const confirm = useConfirm()

  const [meal, setMeal] = useState<Meal | null>(null)
  const [foods, setFoods] = useState<Food[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [kind, setKind] = useState('other')
  const [eatenAt, setEatenAt] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [guessing, setGuessing] = useState(false)

  const load = useCallback(() => {
    Promise.all([api.meal(mealID), api.foods()])
      .then(([one, list]) => {
        setMeal(one)
        setFoods(list.foods)
        setKind(one.kind)
        setNotes(one.notes)
        setEatenAt(localTime(one.eaten_at))
        setRows(
          one.items.map((item) => ({
            food: list.foods.find((food) => food.id === item.food_id) ?? null,
            name: item.name,
            unit: item.unit,
            count: item.count,
            guessed: item.guessed,
          })),
        )
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('meal.failed')))
  }, [mealID, t])

  useEffect(load, [load])

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => {
          const one = rowTotals(row)
          return {
            kcal: sum.kcal + one.kcal,
            protein: sum.protein + one.protein,
            carbs: sum.carbs + one.carbs,
            fat: sum.fat + one.fat,
          }
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [rows],
  )

  const replace = (at: number, row: Row) =>
    setRows(rows.map((one, i) => (i === at ? row : one)))

  /*
  Changing a count is what un-guesses a row.

  It is the only signal available that a person has actually looked at the
  number, and it is an honest one: the count is the single thing the photo
  could not know, so touching it is exactly the act of confirming it.
  */
  const setCount = (at: number, count: number) =>
    replace(at, { ...rows[at], count, guessed: false })

  async function guess() {
    if (!meal?.image_id) {
      toast.error(t('meal.needPhoto'))
      return
    }
    setGuessing(true)
    try {
      const { items } = await api.guessMeal(mealID)
      if (items.length === 0) {
        toast.info(t('meal.guessEmpty'))
        return
      }
      setRows(
        items.map((item) => ({
          food: foods.find((food) => food.id === item.food_id) ?? null,
          name: item.name,
          unit: item.unit,
          count: item.count,
          guessed: true,
        })),
      )
      toast.success(t('meal.guessNote'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meal.guessFailed'))
    } finally {
      setGuessing(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const items: MealItemInput[] = rows
        .filter((row) => row.food !== null)
        .map((row) => ({
          food_id: row.food!.id,
          name: row.food!.name,
          count: row.count,
          guessed: row.guessed,
        }))
      await api.updateMeal(mealID, {
        eaten_at: new Date(eatenAt).toISOString(),
        kind,
        notes,
        items,
      })
      toast.success(t('meal.saved'))
      navigate('/makan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meal.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function drop() {
    if (!(await confirm({ title: t('meal.confirmDelete'), danger: true }))) return
    try {
      await api.deleteMeal(mealID)
      toast.success(t('meal.deleted'))
      navigate('/makan')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meal.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (meal === null) return <Loading />

  const unknown = rows.filter((row) => row.food === null).length

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <PageHeader
        title={t('meal.edit')}
        back="/makan"
        action={
          <Button variant="ghost" size="icon" onClick={drop} aria-label={t('common.delete')}>
            <Trash2 className="size-4" />
          </Button>
        }
      />

      <Files entity="meal" id={mealID} title={t('meal.photo')} />

      <div className="my-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={guess}
          disabled={guessing || !meal.image_id}
        >
          <Sparkles className={cn('size-4', guessing && 'animate-pulse')} />
          {t(guessing ? 'meal.guessing' : 'meal.guess')}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 px-4 py-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium lowercase">{t('meal.items')}</p>
            <p className="text-lg font-semibold tabular-nums">
              {round(totals.kcal)}{' '}
              <span className="text-xs font-normal text-muted-foreground">{t('meal.kcal')}</span>
            </p>
          </div>

          {rows.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('meal.noItems')}</p>
          )}

          {rows.map((row, at) => (
            <div key={at} className="space-y-2 border-t pt-3 first:border-0 first:pt-0">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <FoodPicker
                    foods={foods}
                    value={row.food}
                    name={row.name}
                    onPick={(food) =>
                      replace(at, { ...row, food, name: food.name, unit: food.unit })
                    }
                  />
                  {row.food ? (
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {round(rowTotals(row).grams)} g · {round(rowTotals(row).kcal)}{' '}
                      {t('meal.kcal')}
                    </p>
                  ) : (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <TriangleAlert className="size-3" />
                      {t('meal.unknownFood')}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={() => setRows(rows.filter((_, i) => i !== at))}
                  aria-label={t('meal.dropItem')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Stepper
                  value={String(row.count)}
                  onValue={(value) => setCount(at, Number(value) || 0)}
                  label={t('meal.count')}
                  caption={row.food?.unit ?? row.unit}
                />
                {row.guessed && (
                  <Badge variant="outline" className="border-transparent bg-warning/15 text-warning">
                    {t('meal.guessedRow')}
                  </Badge>
                )}
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              setRows([...rows, { food: null, name: '', unit: '', count: 1, guessed: false }])
            }
          >
            <Plus className="size-4" />
            {t('meal.addItem')}
          </Button>

          {unknown > 0 && (
            <p className="text-xs text-muted-foreground">{t('food.approx')}</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t('meal.kind')}>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meta.meal_kinds.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {tOpt('mealkind', option.value, option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('meal.eatenAt')}>
          <Input
            type="datetime-local"
            value={eatenAt}
            onChange={(event) => setEatenAt(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label={t('meal.notes')}>
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/makan')}>
          {t('common.cancel')}
        </Button>
        <Button onClick={save} disabled={busy}>
          <Check className="size-4" />
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Picking a food.
 *
 * A native datalist rather than a dropdown: the list runs to dozens of rows and
 * the fast way through it is to type three letters, which is what this does on
 * a phone keyboard without a custom combobox to maintain.
 */
function FoodPicker({
  foods,
  value,
  name,
  onPick,
}: {
  foods: Food[]
  value: Food | null
  name: string
  onPick: (food: Food) => void
}) {
  const { t } = useT()
  const [text, setText] = useState(value?.name ?? name)
  useEffect(() => setText(value?.name ?? name), [value, name])

  return (
    <>
      <Input
        list="hq-foods"
        value={text}
        placeholder={t('meal.pickFood')}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => {
          setText(event.target.value)
          const found = foods.find(
            (food) => food.name.toLowerCase() === event.target.value.trim().toLowerCase(),
          )
          if (found) onPick(found)
        }}
      />
      <datalist id="hq-foods">
        {foods.map((food) => (
          <option key={food.id} value={food.name} />
        ))}
      </datalist>
    </>
  )
}

/** An ISO instant as the value a datetime-local input wants. */
function localTime(iso: string) {
  const at = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}
