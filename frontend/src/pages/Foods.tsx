import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Utensils } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Food, FoodInput } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, Field, Loading, PageHeader } from '@/components/bits'
import { SearchInput } from '@/components/filters'

/**
 * The reference table the food log reads from.
 *
 * One row is a promise: a centong of this weighs that much and holds this many
 * calories. Every meal is that promise multiplied by a count, which is why
 * correcting a food here is worth more than correcting any single meal —
 * it fixes the next hundred of them at once.
 */

const blank: FoodInput = {
  name: '',
  unit: 'porsi',
  grams: 100,
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  notes: '',
}

/** A number field that lets a decimal point survive being typed into it. */
function NumberField({
  label,
  value,
  onValue,
  hint,
}: {
  label: string
  value: number
  onValue: (n: number) => void
  hint?: string
}) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => setRaw(String(value)), [value])

  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value)
          onValue(Number(event.target.value) || 0)
        }}
        className="tabular-nums"
      />
    </Field>
  )
}

export default function Foods() {
  const { t } = useT()
  const confirm = useConfirm()

  const [foods, setFoods] = useState<Food[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  // The food being edited, or a blank one being added. Null means the dialog
  // is shut.
  const [editing, setEditing] = useState<{ id: number | null; form: FoodInput } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .foods()
      .then((data) => {
        setFoods(data.foods)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('food.failed')))
  }, [t])

  useEffect(load, [load])

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      if (editing.id === null) await api.createFood(editing.form)
      else await api.updateFood(editing.id, editing.form)
      toast.success(t('food.saved'))
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('food.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function drop(food: Food) {
    if (!(await confirm({ title: t('food.confirmDelete', { name: food.name }), danger: true })))
      return
    try {
      await api.deleteFood(food.id)
      toast.success(t('food.deleted'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('food.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (foods === null) return <Loading />

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? foods.filter((food) => food.name.toLowerCase().includes(needle))
    : foods

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('food.title')}
        description={t('food.approx')}
        back="/makan"
        action={
          <Button onClick={() => setEditing({ id: null, form: { ...blank } })}>
            <Plus className="size-4" />
            {t('food.new')}
          </Button>
        }
      />

      <div className="mb-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t('food.search')} />
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Utensils className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('food.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {shown.map((food) => (
            <Card key={food.id}>
              <CardContent className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{food.name}</p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    {t('food.oneUnit', {
                      unit: food.unit,
                      grams: round(food.grams),
                      kcal: round((food.kcal * food.grams) / 100),
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={() => setEditing({ id: food.id, form: toInput(food) })}
                  aria-label={t('food.edit')}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={() => drop(food)}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogTitle className="lowercase">
            {t(editing?.id === null ? 'food.new' : 'food.edit')}
          </DialogTitle>

          {editing && (
            <div className="space-y-4">
              <Field label={t('food.name')}>
                <Input
                  value={editing.form.name}
                  autoFocus
                  onChange={(event) =>
                    setEditing({ ...editing, form: { ...editing.form, name: event.target.value } })
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('food.unit')} hint={t('food.unitHint')}>
                  <Input
                    value={editing.form.unit}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        form: { ...editing.form, unit: event.target.value },
                      })
                    }
                  />
                </Field>
                <NumberField
                  label={t('food.grams')}
                  value={editing.form.grams}
                  onValue={(grams) => setEditing({ ...editing, form: { ...editing.form, grams } })}
                />
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">{t('food.gramsHint')}</p>

              <p className="border-t pt-4 text-sm font-medium lowercase">{t('food.per100')}</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t('food.kcal')}
                  value={editing.form.kcal}
                  onValue={(kcal) => setEditing({ ...editing, form: { ...editing.form, kcal } })}
                />
                <NumberField
                  label={t('food.protein')}
                  value={editing.form.protein_g}
                  onValue={(protein_g) =>
                    setEditing({ ...editing, form: { ...editing.form, protein_g } })
                  }
                />
                <NumberField
                  label={t('food.carbs')}
                  value={editing.form.carbs_g}
                  onValue={(carbs_g) =>
                    setEditing({ ...editing, form: { ...editing.form, carbs_g } })
                  }
                />
                <NumberField
                  label={t('food.fat')}
                  value={editing.form.fat_g}
                  onValue={(fat_g) => setEditing({ ...editing, form: { ...editing.form, fat_g } })}
                />
              </div>

              <Field label={t('food.notes')}>
                <Textarea
                  rows={2}
                  value={editing.form.notes}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, notes: event.target.value },
                    })
                  }
                />
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={busy || !editing?.form.name.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const round = (n: number) => Math.round(n)

const toInput = (food: Food): FoodInput => ({
  name: food.name,
  unit: food.unit,
  grams: food.grams,
  kcal: food.kcal,
  protein_g: food.protein_g,
  carbs_g: food.carbs_g,
  fat_g: food.fat_g,
  notes: food.notes,
})
