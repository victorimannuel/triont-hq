import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { currentLocale, useT } from '@/i18n'
import type { BudgetMonth, MoneyAccount } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
import { ErrorNote, formatMoney, Loading, PageHeader, Segmented } from '@/components/bits'
import { useConfirm } from '@/components/confirm'

/*
Deciding where a month's money goes, and ticking it off as it does.

This is not a record of spending and there is no row here for a cup of coffee.
A line is a promise — "Monthly Eats, 600k, Wants" — made once at the start of
the month, and the only thing that happens to it afterwards is that it gets
done. That is the shape of the spreadsheet this replaces, and the reason that
one survived where a per-purchase ledger would not have.

Income is a list for the same reason: it turns up as a salary and three
invoices and a handful of small fees, so a single figure at the top would only
mean adding them up somewhere else first.
*/

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shift(month: string, by: number) {
  const [year, index] = month.split('-').map(Number)
  return monthKey(new Date(year, index - 1 + by, 1))
}

// Day nought of the next month is the last day of this one, which saves
// knowing which months are short and which February it is.
function lastDay(month: string) {
  const [year, index] = month.split('-').map(Number)
  const end = new Date(year, index, 0)
  return `${month}-${String(end.getDate()).padStart(2, '0')}`
}

/*
What sits under a row's name: the day it falls on, then the account.

The month and the year are already at the top of the page, so a full date would
be three quarters repetition — but the month name stays, because "25 Sep" is
read at a glance where a bare 25 has to be worked out.
*/
function beneath(due: string, account: string) {
  let day = ''
  if (due) {
    const date = new Date(due)
    if (!Number.isNaN(date.getTime())) {
      day = new Intl.DateTimeFormat(currentLocale(), {
        day: 'numeric',
        month: 'short',
      }).format(date)
    }
  }
  return [day, account].filter(Boolean).join(' · ')
}

function monthName(month: string) {
  if (!month) return ''
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(currentLocale(), {
    month: 'long',
  })
}

// The colour a bucket carries wherever it appears, so the bar and the badge
// agree without anybody having to read the label twice.
const BUCKET_TONE: Record<string, string> = {
  needs: 'bg-primary',
  wants: 'bg-warning',
  savings: 'bg-success',
  debt: 'bg-destructive',
}

export default function Budget() {
  const { t, tOpt } = useT()
  const meta = useMeta()
  const ask = useConfirm()

  const [month, setMonth] = useState(monthKey)
  const [data, setData] = useState<BudgetMonth | null>(null)
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Which row is open for editing, as "income-3" or "line-7". One at a time,
  // because two half-finished edits on one screen is a way to lose one.
  const [editing, setEditing] = useState<string | null>(null)
  // The target percentages while they are being typed, keyed by bucket. Null
  // when nobody is editing them, which is what puts the figures back.
  const [targets, setTargets] = useState<Record<string, string> | null>(null)
  /*
  Which list is on screen. Allocation opens first: income is three rows typed
  once at the start of the month, and the allocations are what the rest of it
  is spent adding to and ticking off.

  Only the lists are behind this. Every figure the page is read for — income,
  allocated, left — sits above the strip and stays put, so switching tabs never
  hides the number the other tab is measured against.
  */
  const [tab, setTab] = useState<'incomes' | 'lines'>('lines')

  const load = useCallback(() => {
    api
      .budget(month)
      .then((got) => {
        setData(got.budget)
        setAccounts(got.accounts)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('budget.failed')))
  }, [month, t])

  useEffect(load, [load])

  async function run(job: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    try {
      await job()
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('budget.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(name: string, job: () => Promise<unknown>) {
    const ok = await ask({
      title: t('confirm.deleteTitle', { name }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (ok) void run(job)
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <Loading />

  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const money = (amount: number) => formatMoney(Math.round(amount), data.currency)
  const empty = data.lines.length === 0 && data.incomes.length === 0

  return (
    <>
      <PageHeader
        title={t('budget.title')}
        description={t('budget.subtitle')}
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonth(shift(month, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium lowercase">
              {label}
            </span>
            <Button variant="outline" size="icon" onClick={() => setMonth(shift(month, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      {accounts.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {accounts.map((account) => (
            <div key={account.id} className="card-surface rounded-xl border bg-card px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="size-3.5 shrink-0" />
                <span className="truncate">{account.name}</span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold tabular-nums">
                {formatMoney(Math.round(account.balance), account.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Four figures, two across on a phone. They were on one flex line and
          collided with each other the moment the screen got narrow. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Figure
          label={t('budget.income', { month: monthName(data.pool_from) })}
          value={money(data.income)}
        />
        <Figure label={t('budget.received')} value={money(data.received)} />
        <Figure label={t('budget.allocated')} value={money(data.allocated)} />
        {/* The one the page exists for. Below zero means more has been promised
            than is coming in, so it says so in red. */}
        <Figure
          label={t('budget.left')}
          value={money(data.left)}
          tone={data.left < 0 ? 'text-destructive' : undefined}
        />
        <Figure label={t('budget.unpaid')} value={money(data.unpaid)} />
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-3">
          {/* The targets are edited in place rather than on a settings page of
              their own. They only mean anything next to the figures they are
              being compared with. */}
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('budget.buckets')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!targets) {
                  setTargets(
                    Object.fromEntries(
                      data.buckets.map((roll) => [roll.bucket, roll.target ? String(roll.target) : '']),
                    ),
                  )
                  return
                }
                const send = Object.fromEntries(
                  Object.entries(targets).map(([bucket, value]) => [bucket, Number(value) || 0]),
                )
                setTargets(null)
                void run(() => api.setBudgetTargets(send))
              }}
            >
              {targets ? t('common.save') : t('budget.setTargets')}
            </Button>
          </div>
          {data.buckets.map((roll) => (
            <div key={roll.bucket} className="space-y-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {tOpt('bucket', roll.bucket)}
                </span>
                <span className="shrink-0 tabular-nums">{money(roll.amount)}</span>
                {targets ? (
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="any"
                    value={targets[roll.bucket] ?? ''}
                    onChange={(event) =>
                      setTargets({ ...targets, [roll.bucket]: event.target.value })
                    }
                    placeholder="%"
                    className="h-7 w-20 shrink-0 text-right text-xs tabular-nums"
                  />
                ) : (
                  <span
                    className={cn(
                      'w-20 shrink-0 text-right text-xs tabular-nums',
                      roll.target > 0 && roll.percent > roll.target
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {roll.percent.toFixed(1)}%{roll.target > 0 && ` / ${roll.target}%`}
                  </span>
                )}
              </div>
              {/* Its own line, so the bar never has to fight the numbers for
                  room on a narrow screen. */}
              <span className="block h-1.5 overflow-hidden rounded-full bg-secondary">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    BUCKET_TONE[roll.bucket] ?? 'bg-foreground/40',
                  )}
                  style={{ width: `${Math.min(100, roll.percent)}%` }}
                />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {empty && (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('budget.empty')}</p>
            {/* Pressing it twice is safe: a month that has anything in it is
                left alone by the server. */}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { added } = await api.seedBudget(month)
                  toast.success(t('budget.seeded', { n: added }))
                })
              }
            >
              <Sparkles className="size-4" />
              {t('budget.seed')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Section
        title={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'incomes', label: `${t('budget.incomes')} ${data.incomes.length}` },
              { value: 'lines', label: `${t('budget.lines')} ${data.lines.length}` },
            ]}
          />
        }
      >
        {tab === 'incomes' && (
          <>
            <p className="px-3 py-2 text-xs text-muted-foreground sm:px-4">
              {t('budget.incomeNote')}
            </p>
            {data.incomes.map((income) =>
              editing === `income-${income.id}` ? (
                <RowForm
                  key={income.id}
                  month={month}
                  accounts={accounts}
                  currencies={meta.currencies ?? []}
                  busy={busy}
                  namePlaceholder={t('budget.incomePlaceholder')}
                  amountPlaceholder={t('budget.amount')}
                  addLabel={t('common.save')}
                  initial={{
                    name: income.name,
                    accountID: income.account_id,
                    currency: income.currency,
                    amount: income.amount,
                    percent: null,
                    dueOn: income.due_on,
                  }}
                  onCancel={() => setEditing(null)}
                  onAdd={(got) => {
                    setEditing(null)
                    void run(() =>
                      api.updateBudgetIncome(income.id, {
                        name: got.name,
                        amount: got.amount,
                        currency: got.currency ?? 'IDR',
                        account_id: got.accountID,
                        due_on: got.dueOn,
                        notes: income.notes,
                      }),
                    )
                  }}
                />
              ) : (
              <Row
                key={income.id}
                ticked={income.received}
                name={income.name}
                under={beneath(income.due_on, income.account_name)}
                right={
                  <>
                    {formatMoney(Math.round(income.amount), income.currency)}
                    {/* What it comes to in the month's own money, but only when
                        that is a different question. */}
                    {income.currency !== data.currency && (
                      <div className="text-xs text-muted-foreground">
                        ≈ {money(income.converted)}
                      </div>
                    )}
                  </>
                }
                busy={busy}
                onTick={(next) => run(() => api.setBudgetIncomeReceived(income.id, next))}
                onEdit={() => setEditing(`income-${income.id}`)}
                onRemove={() => remove(income.name, () => api.deleteBudgetIncome(income.id))}
                deleteLabel={t('common.delete')}
              />
              ),
            )}
            <RowForm
              month={month}
              accounts={accounts}
              currencies={meta.currencies ?? []}
              busy={busy}
              namePlaceholder={t('budget.incomePlaceholder')}
              amountPlaceholder={t('budget.amount')}
              addLabel={t('common.add')}
              onAdd={(got) =>
                run(() =>
                  api.createBudgetIncome(month, {
                    name: got.name,
                    amount: got.amount,
                    currency: got.currency ?? 'IDR',
                    account_id: got.accountID,
                    due_on: got.dueOn,
                    notes: '',
                  }),
                )
              }
            />
          </>
        )}

        {tab === 'lines' && (
          <>
            {data.lines.map((line) =>
              editing === `line-${line.id}` ? (
                <RowForm
                  key={line.id}
                  month={month}
                  accounts={accounts}
                  buckets={meta.budget_buckets ?? []}
                  busy={busy}
                  namePlaceholder={t('budget.linePlaceholder')}
                  amountPlaceholder={t('budget.amount')}
                  addLabel={t('common.save')}
                  initial={{
                    name: line.name,
                    accountID: line.account_id,
                    bucket: line.bucket,
                    amount: line.amount,
                    percent: line.percent,
                    dueOn: line.due_on,
                  }}
                  onCancel={() => setEditing(null)}
                  onAdd={(got) => {
                    setEditing(null)
                    void run(() =>
                      api.updateBudgetLine(line.id, {
                        name: got.name,
                        account_id: got.accountID,
                        bucket: got.bucket ?? 'needs',
                        amount: got.amount,
                        percent: got.percent,
                        due_on: got.dueOn,
                        notes: line.notes,
                      }),
                    )
                  }}
                />
              ) : (
              <Row
                key={line.id}
                ticked={line.paid}
                name={line.name}
                under={beneath(line.due_on, line.account_name)}
                badge={tOpt('bucket', line.bucket)}
                right={
                  <>
                    {money(line.amount)}
                    {line.percent !== null && (
                      <span className="ml-1 text-xs text-muted-foreground">{line.percent}%</span>
                    )}
                  </>
                }
                busy={busy}
                onTick={(next) => run(() => api.setBudgetLinePaid(line.id, next))}
                onEdit={() => setEditing(`line-${line.id}`)}
                onRemove={() => remove(line.name, () => api.deleteBudgetLine(line.id))}
                deleteLabel={t('common.delete')}
              />
              ),
            )}
            <RowForm
              month={month}
              accounts={accounts}
              buckets={meta.budget_buckets ?? []}
              busy={busy}
              namePlaceholder={t('budget.linePlaceholder')}
              amountPlaceholder={t('budget.amount')}
              addLabel={t('common.add')}
              onAdd={(got) =>
                run(() =>
                  api.createBudgetLine(month, {
                    name: got.name,
                    account_id: got.accountID,
                    bucket: got.bucket ?? 'needs',
                    amount: got.amount,
                    percent: got.percent,
                    due_on: got.dueOn,
                    notes: '',
                  }),
                )
              }
            />
          </>
        )}
      </Section>

      {tab === 'incomes' && data.missing && (
        <p className="mt-2 text-xs text-muted-foreground">{t('budget.missingRate')}</p>
      )}
    </>
  )
}

// The heading is a node rather than a string because on this page it is the
// tab strip that names the section.
function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <Card className="overflow-hidden py-0">
        <CardContent className="divide-y px-0">{children}</CardContent>
      </Card>
    </>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card-surface min-w-0 rounded-xl border bg-card px-3 py-2.5">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-1 truncate text-lg font-semibold tabular-nums tracking-tight', tone)}>
        {value}
      </div>
    </div>
  )
}

/*
One line, whether it is money coming in or money promised out. Both are a name,
a tick and an amount, so both are drawn by this — which is also what keeps them
looking like halves of the same page.
*/
function Row({
  ticked,
  name,
  under,
  badge,
  right,
  busy,
  onTick,
  onEdit,
  onRemove,
  deleteLabel,
}: {
  ticked: boolean
  name: string
  under?: string
  badge?: string
  right: ReactNode
  busy: boolean
  onTick: (next: boolean) => void
  onEdit: () => void
  onRemove: () => void
  deleteLabel: string
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
      <input
        type="checkbox"
        checked={ticked}
        disabled={busy}
        onChange={(event) => onTick(event.target.checked)}
        aria-label={name}
        className="size-4 shrink-0 accent-primary"
      />
      {/* The name is the way in to changing anything about the row. A pencil
          of its own would be a fourth control on a line that already has a
          tick, an amount and a bin. */}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left hover:text-primary"
      >
        <div className={cn('truncate text-sm', ticked && 'text-muted-foreground line-through')}>
          {name}
        </div>
        {under && <div className="truncate text-xs text-muted-foreground">{under}</div>}
      </button>
      {badge && (
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {badge}
        </Badge>
      )}
      <span className="shrink-0 whitespace-nowrap text-right text-sm tabular-nums">{right}</span>
      <Button
        variant="ghost"
        size="icon"
        className="-mr-1 size-8 shrink-0"
        onClick={onRemove}
        aria-label={deleteLabel}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

/*
The row that adds one.

Where buckets are offered, an amount can be given outright or as a share of
income, never both: filling one box disables the other. A share is the useful
form for anything phrased as "5% of salary", because it then follows a raise on
its own instead of being retyped every time.
*/
export type RowValues = {
  name: string
  accountID: number | null
  bucket?: string
  currency?: string
  amount: number
  percent: number | null
  dueOn: string
}

/*
The row that adds one, and the same row editing one.

Both are the same set of boxes over the same fields, so they are one component
with the existing values handed in — which is also why editing cannot drift
into offering something adding does not.

Where buckets are offered, an amount can be given outright or as a share of
income, never both: filling one box disables the other. A share is the useful
form for anything phrased as "5% of salary", because it then follows a raise on
its own instead of being retyped every time.
*/
function RowForm({
  month,
  accounts,
  buckets,
  currencies,
  busy,
  namePlaceholder,
  amountPlaceholder,
  addLabel,
  initial,
  onCancel,
  onAdd,
}: {
  /** The month on screen, as YYYY-MM. Only the date box uses it. */
  month: string
  accounts: MoneyAccount[]
  buckets?: { value: string; label: string }[]
  /** Offered on the income side only: what a source pays in varies, what a
   *  month is budgeted in does not. */
  currencies?: { value: string; label: string }[]
  busy: boolean
  namePlaceholder: string
  amountPlaceholder: string
  addLabel: string
  /** Present when this is editing a row rather than adding one. */
  initial?: RowValues
  onCancel?: () => void
  onAdd: (got: RowValues) => void
}) {
  const { t, tOpt } = useT()
  const [name, setName] = useState(initial?.name ?? '')
  const [bucket, setBucket] = useState(initial?.bucket ?? 'needs')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IDR')
  const [account, setAccount] = useState(initial?.accountID ? String(initial.accountID) : '')
  const [amount, setAmount] = useState(
    initial && initial.percent === null && initial.amount ? String(initial.amount) : '',
  )
  const [percent, setPercent] = useState(
    initial?.percent != null ? String(initial.percent) : '',
  )
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onAdd({
      name: name.trim(),
      accountID: account ? Number(account) : null,
      bucket: buckets ? bucket : undefined,
      currency: currencies ? currency : undefined,
      amount: Number(amount) || 0,
      percent: percent ? Number(percent) : null,
      dueOn,
    })
    if (initial) return
    setName('')
    setAmount('')
    setPercent('')
    setDueOn('')
  }

  return (
    <form className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4" onSubmit={submit}>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={namePlaceholder}
        className="min-w-[10rem] flex-1"
      />
      {buckets && (
        <Select value={bucket} onValueChange={setBucket}>
          <SelectTrigger className="w-[8.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buckets.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {tOpt('bucket', option.value, option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {accounts.length > 0 && (
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-[8.5rem]">
            <SelectValue placeholder="akun" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((one) => (
              <SelectItem key={one.id} value={String(one.id)}>
                {one.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        type="number"
        inputMode="numeric"
        min="0"
        value={amount}
        disabled={percent !== ''}
        onChange={(event) => setAmount(event.target.value)}
        placeholder={amountPlaceholder}
        className="w-32 tabular-nums"
      />
      {currencies && currencies.length > 0 && (
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-[6rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {buckets && (
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="any"
          value={percent}
          disabled={amount !== ''}
          onChange={(event) => setPercent(event.target.value)}
          placeholder="%"
          className="w-20 tabular-nums"
        />
      )}
      {/* Last, and optional, because most rows have no particular day: the rent
          falls on the 3rd and the salary lands on the 25th, but "some time this
          month" is the usual answer. Held inside the month on screen — a row
          belongs to one month, and a date outside it would only be a typo. */}
      <Input
        type="date"
        value={dueOn}
        min={`${month}-01`}
        max={lastDay(month)}
        onChange={(event) => setDueOn(event.target.value)}
        aria-label={t('budget.due')}
        className="w-[9.5rem]"
      />
      <Button type="submit" size="icon" disabled={busy || !name.trim()} aria-label={addLabel}>
        {initial ? <Check className="size-4" /> : <Plus className="size-4" />}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="batal">
          <X className="size-4" />
        </Button>
      )}
    </form>
  )
}
