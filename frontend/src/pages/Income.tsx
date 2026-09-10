import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { FxRate, IncomeStream } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorNote, formatMoney, Mark, PageHeader, RenewalBadge } from '@/components/bits'
import { SearchInput, FilterSelect } from '@/components/filters'
import { RowList } from '@/components/cards'
import { MonthlyTotal } from '@/components/Money'

export default function Income() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'status'], api.income, {
    income: [] as IncomeStream[],
    monthly: {} as Record<string, number>,
  })
  const { loading, error, query, filtered, update, clear } = list
  const streams = list.data.income
  const monthly = list.data.monthly

  // Rates change once a day at most, so they are fetched once rather than
  // alongside every filter change.
  const [rates, setRates] = useState<FxRate[]>([])
  useEffect(() => {
    api.rates().then((data) => setRates(data.rates)).catch(() => undefined)
  }, [])

  return (
    <>
      <PageHeader
        title={t('income.title')}
        description={
          loading ? (
            t('common.loading')
          ) : (
            <span className="flex flex-wrap items-center gap-x-2">
              <span>{t('income.countPrefix', { n: streams.length })}</span>
              <MonthlyTotal byCurrency={monthly} rates={rates} onRefreshed={setRates} />
            </span>
          )
        }
        action={
          <Button asChild>
            <Link to="/income/new">
              <Plus className="size-4" />
              {t('income.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('income.searchPlaceholder')}
        />
        <FilterSelect
          label={t('common.status')}
          value={query.status}
          onChange={(v) => update('status', v)}
          options={meta.income_statuses.map((item) => ({
            value: item.value,
            label: tOpt('incomestatus', item.value, item.label),
          }))}
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="size-4" />
            {t('common.reset')}
          </Button>
        )}
      </div>

      <RowList
        items={streams}
        keyOf={(s) => s.id}
        onPick={(s) => navigate(`/income/${s.id}`)}
        empty={loading ? null : t('income.none')}
        render={(s) => ({
          leading: <Mark name={s.name} />,
          title: s.name,
          subtitle: s.client_name || s.project_name || undefined,
          meta: (
            <>
              <Badge variant="outline">{tOpt('incomestatus', s.status)}</Badge>
              {s.next_due_on && <RenewalBadge renewsOn={s.next_due_on} />}
            </>
          ),
          trailing: (
            <>
              <span className="tabular-nums text-sm">
                {formatMoney(s.amount, s.currency)}
              </span>
              <span className="text-xs text-muted-foreground">{tOpt('cycle', s.cycle)}</span>
            </>
          ),
        })}
      />
    </>
  )
}
