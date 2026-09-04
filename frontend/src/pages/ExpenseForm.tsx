import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Asset, ExpenseInput, ExpenseStream, Project } from '@/types'
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
  MoreFields,
  MoneyInput,
  NameInput,
  PageHeader,
  Spinner,
} from '@/components/bits'

const NONE = '__none__'

const blank: ExpenseInput = {
  name: '',
  category: 'other',
  project_id: null,
  asset_id: null,
  amount: 0,
  currency: 'IDR',
  cycle: 'monthly',
  status: 'active',
  started_on: '',
  ended_on: '',
  next_due_on: '',
  notes: '',
}

export default function ExpenseForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<ExpenseInput>(blank)
  const [record, setRecord] = useState<ExpenseStream | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.projects({}).then((d) => setProjects(d.projects)).catch(() => undefined)
    api.assets({}).then((d) => setAssets(d.assets)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) {
      const preset = params.get('project')
      if (preset) setForm((prev) => ({ ...prev, project_id: Number(preset) }))

      // Opened from an asset row in the list: carry over what the asset
      // already knows, so recording its bill is a confirmation rather than
      // retyping something the app can see.
      const fromAsset = params.get('asset')
      if (fromAsset) {
        api
          .asset(Number(fromAsset))
          .then((asset) =>
            setForm((prev) => ({
              ...prev,
              name: asset.name,
              category: 'subscription',
              asset_id: asset.id,
              amount: asset.cost_amount,
              currency: asset.cost_currency,
              cycle: asset.billing_cycle,
              next_due_on: asset.renews_on ? asset.renews_on.slice(0, 10) : '',
            })),
          )
          .catch(() => undefined)
      }
      return
    }
    api
      .expenseStream(Number(id))
      .then((s) => {
        setRecord(s)
        setForm({
          name: s.name,
          category: s.category,
          project_id: s.project_id,
          asset_id: s.asset_id,
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

  function set<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateExpense(Number(id), form)
      else await api.createExpense(form)
      toast.success(t('expense.saved'))
      navigate('/expenses')
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
    await api.deleteExpense(Number(id))
    toast.success(t('expense.deleted'))
    navigate('/expenses')
  }

  // What sits in the folded half, so hiding it never hides that it is filled.
  const extras = [
    form.asset_id,
    form.started_on,
    form.ended_on,
    form.notes,
  ].filter(Boolean).length

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/expenses"
        title={id ? form.name || t('expense.title') : t('expense.new')}
        description={t('expense.subtitle')}
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
              <Field label={t('expense.category')}>
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.expense_categories.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('expcat', item.value, item.label)}
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
              <Field label={t('expense.amount')} htmlFor="amount">
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
              <Field label={t('expense.nextDue')} htmlFor="next">
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

            <MoreFields
              label={t('form.more')}
              note={extras ? t('form.filled', { n: extras }) : undefined}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('expense.asset')} hint={t('expense.assetHint')}>
                  <Select
                    value={form.asset_id ? String(form.asset_id) : NONE}
                    onValueChange={(v) => set('asset_id', v === NONE ? null : Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('expense.noAsset')}</SelectItem>
                      {assets.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('expense.startedOn')} htmlFor="started">
                  <Input
                    id="started"
                    type="date"
                    value={form.started_on}
                    onChange={(e) => set('started_on', e.target.value)}
                  />
                </Field>
                <Field label={t('expense.endedOn')} htmlFor="ended">
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
            </MoreFields>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {t('common.save')}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/expenses">{t('common.cancel')}</Link>
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
