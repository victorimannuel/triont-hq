import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Habit, HabitInput, Supply } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/confirm'
import { Files } from '@/components/Files'
import {
  AuditInfo,
  ErrorNote,
  Field,
  Loading,
  NameInput,
  PageHeader,
  Segmented,
  Spinner,
} from '@/components/bits'

/**
 * Editing one habit: what it is called, the note the check-in reads out under
 * it, whether it is still being asked about, and the picture.
 *
 * The picture is the reason this page carries an uploader at all. At half past
 * nine, answering six questions in a row goes faster when each one looks like
 * something rather than reading like something.
 */

const STATES = [
  { value: 'active', label: 'aktif' },
  { value: 'paused', label: 'dijeda' },
] as const

export default function HabitForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<HabitInput | null>(null)
  const [record, setRecord] = useState<Habit | null>(null)
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .habits(1)
      .then((data) => {
        const found = data.habits.find((habit) => habit.id === Number(id))
        if (!found) {
          setError(t('habit.notFound'))
          return
        }
        setRecord(found)
        setForm({
          name: found.name,
          notes: found.notes,
          unit: found.unit,
          active: found.active,
          // Carried through untouched: the board's eye toggles this, and a save
          // here must not quietly switch a hidden habit back on.
          private: found.private,
          supply_id: found.supply_id,
          per_day: found.per_day,
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('habit.failed')))
  }, [id, t])

  // The supplies this habit could draw down, for the picker below. Fetched
  // once; an empty shelf just leaves the picker with only "not linked".
  useEffect(() => {
    api
      .supplies({})
      .then((data) => setSupplies(data.supplies))
      .catch(() => setSupplies([]))
  }, [])

  function set<K extends keyof HabitInput>(key: K, value: HabitInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form || !id) return
    setBusy(true)
    setError('')
    try {
      await api.updateHabit(Number(id), form)
      navigate('/habits')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !record) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: record.name }),
      body: t('habit.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: record.name }),
      doubleBody: t('habit.deleteBody'),
    })
    if (!ok) return

    try {
      await api.deleteHabit(Number(id))
      navigate('/habits')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.deleteFailed'))
    }
  }

  if (error && !form) return <ErrorNote>{error}</ErrorNote>
  if (!form) return <Loading />

  // The supply the habit is linked to right now, for the "per day" field to
  // show its unit beside the number.
  const linked = supplies.find((item) => item.id === form.supply_id)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back="/habits" title={form.name || t('habit.edit')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label={t('habit.name')} htmlFor="name">
              <NameInput
                id="name"
                required
                autoFocus
                value={form.name}
                onValue={(v) => set('name', v)}
              />
            </Field>

            <Field label={t('habit.notes')} htmlFor="notes" hint={t('habit.notesHint')}>
              <Input
                id="notes"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder={t('habit.notesPlaceholder')}
              />
            </Field>

            {/* Left blank on purpose by most habits. Filling it in turns the
                nightly question from "did you" into "how many", which is what
                you want for the ones that are a quantity rather than an act. */}
            <Field label={t('habit.unit')} htmlFor="unit" hint={t('habit.unitHint')}>
              <Input
                id="unit"
                value={form.unit}
                onChange={(event) => set('unit', event.target.value)}
                placeholder={t('habit.unitPlaceholder')}
              />
            </Field>

            {/* Draw a supply down as this gets done. Radix Select has no empty
                value, so "not linked" carries a sentinel that maps back to null. */}
            <Field label={t('habit.supply')} hint={t('habit.supplyHint')}>
              <Select
                value={form.supply_id === null ? 'none' : String(form.supply_id)}
                onValueChange={(value) =>
                  set('supply_id', value === 'none' ? null : Number(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('habit.supplyNone')}</SelectItem>
                  {supplies.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* How much one tick takes off the shelf — two for fish oil, one for
                most things. Only worth asking once a supply is actually linked. */}
            {form.supply_id !== null && (
              <Field label={t('habit.perDay')} htmlFor="perDay" hint={t('habit.perDayHint')}>
                <div className="flex items-center gap-2">
                  <Input
                    id="perDay"
                    type="number"
                    min="1"
                    step="1"
                    className="w-28"
                    value={String(form.per_day)}
                    onChange={(event) => set('per_day', Number(event.target.value) || 1)}
                  />
                  {linked?.unit && (
                    <span className="text-sm text-muted-foreground">{linked.unit}</span>
                  )}
                </div>
              </Field>
            )}

            {/* Paused rather than deleted. Giving one up is exactly when the
                record of having kept it becomes worth having. */}
            <Field label={t('habit.state')} hint={t('habit.stateHint')}>
              <Segmented
                value={form.active ? 'active' : 'paused'}
                onChange={(value) => set('active', value === 'active')}
                options={STATES}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            </div>
          </form>

          {record && (
            <AuditInfo
              createdBy={record.created_by}
              createdAt={record.created_at}
              updatedBy={record.updated_by}
              updatedAt={record.updated_at}
            />
          )}
        </CardContent>
      </Card>

      {/* Outside the form, because an upload saves itself the moment it is
          picked and has nothing to do with the save button above. */}
      <div className="mt-6">
        <Files
          entity="habit"
          id={Number(id)}
          title={t('habit.picture')}
          hint={t('habit.pictureHint')}
        />
      </div>
    </div>
  )
}
