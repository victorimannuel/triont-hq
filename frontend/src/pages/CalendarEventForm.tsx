import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { CalendarEventInput } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, Field, Loading, NameInput, PageHeader, Spinner } from '@/components/bits'

/** Local YYYY-MM-DD for a new event's default date. */
function today() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Adding or editing an event that lives on the calendar itself, rather than a
 * date read off some other record. Reached from the calendar's "+" and from
 * tapping an event already on it.
 */
export default function CalendarEventForm() {
  const { id } = useParams()
  const editing = Boolean(id && id !== 'new')
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()
  const [params] = useSearchParams()

  // A new event opens on the day that was tapped, when one was, else today.
  const [form, setForm] = useState<CalendarEventInput>({
    title: '',
    on_date: params.get('date') || today(),
    end_on: '',
    notes: '',
  })
  const [loading, setLoading] = useState(editing)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    api
      .calendarEvent(Number(id))
      .then((event) =>
        setForm({
          title: event.title,
          on_date: event.on_date.slice(0, 10),
          end_on: event.end_on ? event.end_on.slice(0, 10) : '',
          notes: event.notes,
        }),
      )
      .catch((err) => setError(err instanceof Error ? err.message : t('common.requestFailed')))
      .finally(() => setLoading(false))
  }, [editing, id, t])

  function set<K extends keyof CalendarEventInput>(key: K, value: CalendarEventInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!form.title.trim() || !form.on_date) {
      setError(t('cal.event.required'))
      return
    }
    setBusy(true)
    setError('')
    try {
      if (editing) await api.updateCalendarEvent(Number(id), form)
      else await api.createCalendarEvent(form)
      navigate('/calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.title }),
      body: t('cal.event.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteCalendarEvent(Number(id))
      navigate('/calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.deleteFailed'))
    }
  }

  if (loading) return <Loading />

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/calendar"
        title={editing ? form.title || t('cal.event.edit') : t('cal.event.new')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label={t('cal.event.title')} htmlFor="title">
              <NameInput
                id="title"
                required
                autoFocus
                value={form.title}
                onValue={(v) => set('title', v)}
              />
            </Field>

            <Field label={t('cal.event.date')} htmlFor="date">
              <Input
                id="date"
                type="date"
                required
                className="w-48"
                value={form.on_date}
                onChange={(event) => set('on_date', event.target.value)}
              />
            </Field>

            <Field label={t('cal.event.end')} htmlFor="end" hint={t('cal.event.endHint')}>
              <Input
                id="end"
                type="date"
                className="w-48"
                min={form.on_date}
                value={form.end_on}
                onChange={(event) => set('end_on', event.target.value)}
              />
            </Field>

            <Field label={t('cal.event.notes')} htmlFor="notes">
              <Input
                id="notes"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder={t('cal.event.notesPlaceholder')}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
