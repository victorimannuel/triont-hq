import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Client, IncomeInput, IncomeStream, Project } from '@/types'
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
  ErrorNote,
  Field,
  MoneyInput,
  NameInput,
  PageHeader,
  Spinner,
} from '@/components/bits'

const NONE = '__none__'

const blank: IncomeInput = {
  name: '',
  client_id: null,
  project_id: null,
  amount: 0,
  currency: 'IDR',
  cycle: 'monthly',
  status: 'active',
  started_on: '',
  ended_on: '',
  next_due_on: '',
  notes: '',
}

export default function IncomeForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<IncomeInput>(blank)
  const [record, setRecord] = useState<IncomeStream | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.clients().then((d) => setClients(d.clients)).catch(() => undefined)
    api.projects({}).then((d) => setProjects(d.projects)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) {
      const preset = params.get('project')
      if (preset) setForm((prev) => ({ ...prev, project_id: Number(preset) }))
      return
    }
    api
      .incomeStream(Number(id))
      .then((s) => {
        setRecord(s)
        setForm({
          name: s.name,
          client_id: s.client_id,
          project_id: s.project_id,
          amount: s.amount,
          currency: s.currency,
          cycle: s.cycle,
          status: s.status,
          started_on: s.started_on ? s.started_on.slice(0, 10) : '',
          ended_on: s.ended_on ? s.ended_on.slice(0, 10) : '',
          next_due_on: s.next_due_on ? s.next_due_on.slice(0, 10) : '',
          notes: s.notes,
        })
      })
      .catch((err) => setError(err.message))
  }, [id, params])

  function set<K extends keyof IncomeInput>(key: K, value: IncomeInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateIncome(Number(id), form)
      else await api.createIncome(form)
      toast.success(t('income.saved'))
      navigate('/income')
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
    await api.deleteIncome(Number(id))
    toast.success(t('income.deleted'))
    navigate('/income')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={id ? form.name || t('income.title') : t('income.new')}
        description={t('income.subtitle')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <Field label={t('common.name')} htmlFor="name">
              <NameInput
                id="name"
                required
                value={form.name}
                onValue={(v) => set('name', v)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('project.client')}>
                <Select
                  value={form.client_id ? String(form.client_id) : NONE}
                  onValueChange={(v) => set('client_id', v === NONE ? null : Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.noClient')}</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('nav.projects')}>
                <Select
                  value={form.project_id ? String(form.project_id) : NONE}
                  onValueChange={(v) => set('project_id', v === NONE ? null : Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.noProject')}</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label={t('income.amount')} htmlFor="amount">
                <MoneyInput id="amount" value={form.amount} onValue={(v) => set('amount', v)} />
              </Field>
              <Field label={t('asset.currency')}>
                <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.currencies.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('asset.cycle')}>
                <Select value={form.cycle} onValueChange={(v) => set('cycle', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.billing_cycles.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('cycle', item.value, item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('income.nextDue')} htmlFor="next">
                <Input
                  id="next"
                  type="date"
                  value={form.next_due_on}
                  onChange={(e) => set('next_due_on', e.target.value)}
                />
              </Field>
              <Field label={t('common.status')}>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.income_statuses.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('incomestatus', item.value, item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('income.startedOn')} htmlFor="started">
                <Input
                  id="started"
                  type="date"
                  value={form.started_on}
                  onChange={(e) => set('started_on', e.target.value)}
                />
              </Field>
              <Field label={t('income.endedOn')} htmlFor="ended">
                <Input
                  id="ended"
                  type="date"
                  value={form.ended_on}
                  onChange={(e) => set('ended_on', e.target.value)}
                />
              </Field>
            </div>

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
                <Link to="/income">{t('common.cancel')}</Link>
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
    </div>
  )
}
