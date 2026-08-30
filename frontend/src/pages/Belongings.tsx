import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Belonging } from '@/types'
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
import { ErrorNote, formatDate, formatMoney, PageHeader, RenewalBadge } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

const ALL = '__all__'

export default function Belongings() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<Belonging[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const query = {
    q: params.get('q') ?? '',
    kind: params.get('kind') ?? '',
    status: params.get('status') ?? '',
  }
  const filtered = Boolean(query.q || query.kind || query.status)

  useEffect(() => {
    setLoading(true)
    api
      .belongings(query)
      .then((data) => {
        setItems(data.belongings)
        setError('')
      })
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
        title={t('thing.title')}
        description={loading ? t('common.loading') : t('thing.count', { n: items.length })}
        action={
          <Button asChild>
            <Link to="/belongings/new">
              <Plus className="size-4" />
              {t('thing.new')}
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
            placeholder={t('thing.searchPlaceholder')}
            value={query.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <Select value={query.kind || ALL} onValueChange={(v) => update('kind', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('common.kind')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.belonging_kinds.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('thingkind', item.value, item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.status || ALL} onValueChange={(v) => update('status', v)}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('common.all')}</SelectItem>
            {meta.belonging_statuses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('thingstatus', item.value, item.label)}
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
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('thing.identifier')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('thing.nextService')}</TableHead>
                  <TableHead>{t('thing.warranty')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    onClick={() => navigate(`/belongings/${item.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {(item.brand || item.model) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[item.brand, item.model, item.year].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('thingkind', item.kind)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.identifier || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {tOpt('thingstatus', item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.next_due ? (
                        <RenewalBadge renewsOn={item.next_due} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.warranty_until ? <RenewalBadge renewsOn={item.warranty_until} /> : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t('thing.none')}{' '}
                      <Link to="/belongings/new" className="text-primary hover:underline">
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
            items={items}
            keyOf={(i) => i.id}
            onPick={(i) => navigate(`/belongings/${i.id}`)}
            empty={loading ? null : t('thing.none')}
            render={(i) => ({
              title: i.name,
              subtitle: [i.brand, i.model, i.year].filter(Boolean).join(' · ') || undefined,
              meta: (
                <>
                  <span>{tOpt('thingkind', i.kind)}</span>
                  {i.identifier && <span className="font-mono">{i.identifier}</span>}
                  {i.warranty_until && (
                    <span>
                      {t('thing.warranty')}: {formatDate(i.warranty_until)}
                    </span>
                  )}
                </>
              ),
              trailing: (
                <>
                  <Badge variant="outline">{tOpt('thingstatus', i.status)}</Badge>
                  {i.next_due && <RenewalBadge renewsOn={i.next_due} />}
                </>
              ),
            })}
          />
        }
      />

      {items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('thing.totalValue', {
            cost: formatMoney(
              items.filter((i) => i.currency === 'IDR').reduce((sum, i) => sum + i.price, 0),
              'IDR',
            ),
          })}
        </p>
      )}
    </>
  )
}
