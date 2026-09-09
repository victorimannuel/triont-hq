import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Habit, HabitInput } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
        setForm({ name: found.name, notes: found.notes, active: found.active })
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('habit.failed')))
  }, [id, t])

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
