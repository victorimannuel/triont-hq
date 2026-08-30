import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { FxRate, IncomeStream } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorNote, formatMoney, PageHeader, RenewalBadge } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'
import { MonthlyTotal } from '@/components/Money'

const ALL = '__all__'

export default function Income() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [streams, setStreams] = useState<IncomeStream[]>([])
  const [monthly, setMonthly] = useState<Record<string, number>>({})
  const [rates, setRates] = useState<FxRate[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const query = { q: params.get('q') ?? '', status: params.get('status') ?? '' }
  const filtered = Boolean(query.q || query.status)

  useEffect(() => {
    setLoading(true)
    api
      .income(query)
      .then((data) => {
        setStreams(data.income)
        setMonthly(data.monthly)
        setError('')
      })
      .then(() => api.rates().then((data) => setRates(data.rates)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

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
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('income.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <Select value={query.status || ALL} onValueChange={(v) => update('status', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.income_statuses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('incomestatus', item.value, item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
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
                  <TableHead>{t('project.client')}</TableHead>
                  <TableHead>{t('nav.projects')}</TableHead>
                  <TableHead>{t('income.amount')}</TableHead>
                  <TableHead>{t('income.nextDue')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((stream) => (
                  <TableRow
                    key={stream.id}
                    onClick={() => navigate(`/income/${stream.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{stream.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {stream.client_slug ? (
                        <Link
                          to={`/clients/${stream.client_slug}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {stream.client_name}
                        </Link>
                      ) : (
                        '—'
                      )}
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
                      {t('income.none')}{' '}
                      <Link to="/income/new" className="text-primary hover:underline">
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
            keyOf={(s) => s.id}
            onPick={(s) => navigate(`/income/${s.id}`)}
            empty={loading ? null : t('income.none')}
            render={(s) => ({
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
        }
      />
    </>
  )
}
