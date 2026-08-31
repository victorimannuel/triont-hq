import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { FxRate, ExpenseStream } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorNote, formatMoney, PageHeader, RenewalBadge } from '@/components/bits'
import { SearchInput, FilterSelect } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'
import { MonthlyTotal } from '@/components/Money'

export default function Expenses() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'status'], api.expenses, {
    expenses: [] as ExpenseStream[],
    monthly: {} as Record<string, number>,
  })
  const { loading, error, query, filtered, update, clear } = list
  const streams = list.data.expenses
  const monthly = list.data.monthly

  const [rates, setRates] = useState<FxRate[]>([])
  useEffect(() => {
    api.rates().then((data) => setRates(data.rates)).catch(() => undefined)
  }, [])

  return (
    <>
      <PageHeader
        title={t('expense.title')}
        description={
          loading ? (
            t('common.loading')
          ) : (
            <span className="flex flex-wrap items-center gap-x-2">
              <span>{t('expense.countPrefix', { n: streams.length })}</span>
              <MonthlyTotal byCurrency={monthly} rates={rates} onRefreshed={setRates} />
            </span>
          )
        }
        action={
          <Button asChild>
            <Link to="/expenses/new">
              <Plus className="size-4" />
              {t('expense.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('expense.searchPlaceholder')}
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

      <Responsive
        table={
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('expense.category')}</TableHead>
                  <TableHead>{t('nav.projects')}</TableHead>
                  <TableHead>{t('expense.amount')}</TableHead>
                  <TableHead>{t('expense.nextDue')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((stream) => (
                  <TableRow
                    key={`${stream.source}-${stream.id}`}
                    onClick={() =>
                      navigate(
                        stream.source === 'asset'
                          ? `/expenses/new?asset=${stream.asset_id}`
                          : `/expenses/${stream.id}`,
                      )
                    }
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">
                      {stream.name}
                      {stream.source === 'asset' && (
                        <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
                          {t('expense.fromAsset')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('expcat', stream.category)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {stream.project_slug ? (
                        <Link
                          to={`/projects/${stream.project_slug}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {stream.project_name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="tabular-nums">{formatMoney(stream.amount, stream.currency)}</div>
                      <div className="text-xs text-muted-foreground">
                        {tOpt('cycle', stream.cycle)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {stream.next_due_on ? (
                        <RenewalBadge renewsOn={stream.next_due_on} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tOpt('incomestatus', stream.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && streams.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t('expense.none')}{' '}
                      <Link to="/expenses/new" className="text-primary hover:underline">
                        {t('home.addOne')}
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        }
        cards={
          <CardList
            items={streams}
            keyOf={(s) => `${s.source}-${s.id}`}
            onPick={(s) =>
              navigate(
                s.source === 'asset'
                  ? `/expenses/new?asset=${s.asset_id}`
                  : `/expenses/${s.id}`,
              )
            }
            empty={loading ? null : t('expense.none')}
            render={(s) => ({
              title: (
                <span className="flex items-center gap-2">
                  {s.name}
                  {s.source === 'asset' && (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      {t('expense.fromAsset')}
                    </Badge>
                  )}
                </span>
              ),
              subtitle: s.project_name || undefined,
              meta: (
                <>
                  <span>{tOpt('expcat', s.category)}</span>
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
        }
      />
    </>
  )
}
