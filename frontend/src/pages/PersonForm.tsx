import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Client, Person, PersonInput } from '@/types'
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
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import {
  AuditInfo,
  daysUntil,
  ErrorNote,
  Field,
  formatCount,
  formatDate,
  NameInput,
  PageHeader,
  Spinner,
} from '@/components/bits'
import { cn } from '@/lib/utils'
import { Files } from '@/components/Files'

const NONE = '__none__'

/*
Round numbers of days lived — the same ones the calendar announces, so the two
never disagree. Nobody works these out by hand, which is exactly why they are
worth being shown a date for.
*/
const MILESTONES = [7777, 10000, 15000, 20000, 25000, 30000]

// Counted in UTC so a birthday that arrives as a bare date is not nudged onto
// the day before or after by whatever zone the browser is in.
function milestoneDates(birthday: string) {
  const born = new Date(birthday)
  if (Number.isNaN(born.getTime())) return []
  return MILESTONES.map((n) => {
    const on = new Date(
      Date.UTC(born.getUTCFullYear(), born.getUTCMonth(), born.getUTCDate() + n),
    )
    return { n, date: on.toISOString().slice(0, 10) }
  })
}

const blank: PersonInput = {
  client_id: null,
  name: '',
  nickname: '',
  role: '',
  email: '',
  phone: '',
  notes: '',
  birthday: '',
  last_contacted_on: '',
  reach_every_days: 0,
}

export default function PersonForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<PersonInput>(blank)
  const [record, setRecord] = useState<Person | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .clients()
      .then((data) => setClients(data.clients))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) return
    api
      .person(Number(id))
      .then((p) => {
        setRecord(p)
        setForm({
          client_id: p.client_id,
          name: p.name,
          nickname: p.nickname,
          role: p.role,
          email: p.email,
          phone: p.phone,
          notes: p.notes,
          birthday: p.birthday ? p.birthday.slice(0, 10) : '',
          last_contacted_on: p.last_contacted_on ? p.last_contacted_on.slice(0, 10) : '',
          reach_every_days: p.reach_every_days,
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  function set<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updatePerson(Number(id), form)
      else await api.createPerson(form)
      toast.success(t('people.saved'))
      navigate('/people')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failed'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.name }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: form.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deletePerson(Number(id))
    toast.success(t('people.deleted'))
    navigate('/people')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/people"
        title={id ? form.name || t('people.title') : t('people.new')}
        description={t('people.subtitle')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('common.name')} htmlFor="name">
                <NameInput
                  id="name"
                  required
                  value={form.name}
                  onValue={(v) => set('name', v)}
                />
              </Field>
              <Field label={t('people.nickname')} htmlFor="nickname" hint={t('people.nicknameHint')}>
                <NameInput
                  id="nickname"
                  value={form.nickname}
                  onValue={(v) => set('nickname', v)}
                />
              </Field>
              <Field label={t('people.role')} htmlFor="role">
                <NameInput
                  id="role"
                  value={form.role}
                  onValue={(v) => set('role', v)}
                />
              </Field>
            </div>

            <Field label={t('project.client')}>
              <Select
                value={form.client_id ? String(form.client_id) : NONE}
                onValueChange={(v) => set('client_id', v === NONE ? null : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('people.noClient')}</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label={t('client.phone')} htmlFor="phone">
                <Input
                  id="phone"
                  className="font-mono text-xs"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label={t('people.birthday')} htmlFor="birthday">
                <Input
                  id="birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(e) => set('birthday', e.target.value)}
                />
              </Field>
              <Field label={t('people.lastTalked')} htmlFor="last">
                <Input
                  id="last"
                  type="date"
                  value={form.last_contacted_on}
                  onChange={(e) => set('last_contacted_on', e.target.value)}
                />
              </Field>
              <Field label={t('people.reachEvery')} htmlFor="reach" hint={t('people.reachEveryHint')}>
                <Input
                  id="reach"
                  type="number"
                  min={0}
                  className="tabular-nums"
                  value={form.reach_every_days || ''}
                  onChange={(e) => set('reach_every_days', Number(e.target.value))}
                />
              </Field>
            </div>

            {form.birthday && (
              <Field label={t('people.milestones')} hint={t('people.milestonesHint')}>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {milestoneDates(form.birthday).map((m) => {
                    const days = daysUntil(m.date)
                    const past = days !== null && days < 0
                    const soon = days !== null && days >= 0 && days <= 30
                    return (
                      <div
                        key={m.n}
                        className={cn(
                          'flex items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-xs',
                          // A milestone already gone by is history, not a plan.
                          past && 'opacity-45',
                          soon && 'border-warning/50',
                        )}

            <Field label={t('common.notes')} htmlFor="notes">
              <Textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/people">{t('common.cancel')}</Link>
              </Button>
              {id && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              )}
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

      {id && <Files entity="person" id={Number(id)} />}
    </div>
  )
}
