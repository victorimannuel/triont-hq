import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Asset } from '@/types'
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

const ALL = '__all__'

export default function Assets() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [assets, setAssets] = useState<Asset[]>([])
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
      .assets(query)
      .then((data) => {
        setAssets(data.assets)
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

  // Only recurring, live assets belong in a monthly figure.
  const perMonth = assets
    .filter((a) => a.status === 'active' && a.cost_currency === 'IDR')
    .reduce((sum, a) => {
      if (a.billing_cycle === 'monthly') return sum + a.cost_amount
      if (a.billing_cycle === 'quarterly') return sum + a.cost_amount / 3
      if (a.billing_cycle === 'yearly') return sum + a.cost_amount / 12
      return sum
    }, 0)

  return (
    <>
      <PageHeader
        title={t('asset.title')}
        description={
          loading
            ? t('common.loading')
            : t('asset.count', {
                n: assets.length,
                cost: formatMoney(Math.round(perMonth), 'IDR'),
              })
        }
        action={
          <Button asChild>
            <Link to="/assets/new">
              <Plus className="size-4" />
              {t('asset.new')}
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
            placeholder={t('asset.searchPlaceholder')}
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
            {meta.asset_kinds.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('assetkind', item.value, item.label)}
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
            {meta.asset_statuses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {tOpt('assetstatus', item.value, item.label)}
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
                  <TableHead>{t('asset.provider')}</TableHead>
                  <TableHead>{t('asset.cost')}</TableHead>
                  <TableHead>{t('asset.renewal')}</TableHead>
                  <TableHead className="text-right">{t('nav.projects')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow
                    key={asset.id}
                    onClick={() => navigate(`/assets/${asset.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="font-medium">{asset.name}</div>
                      {asset.identifier && (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {asset.identifier}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('assetkind', asset.kind)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                  <div>{asset.provider || '—'}</div>
                  {asset.credential_label && (
                    <div className="mt-0.5 text-xs">
                      {asset.credential_user || asset.credential_label}
                    </div>
                  )}
                </TableCell>
                    <TableCell>
                      <div className="tabular-nums">
                        {formatMoney(asset.cost_amount, asset.cost_currency)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tOpt('cycle', asset.billing_cycle)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {asset.status === 'active' ? (
                        <RenewalBadge renewsOn={asset.renews_on} />
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          {tOpt('assetstatus', asset.status)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {asset.project_count}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && assets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t('asset.none')}{' '}
                      <Link to="/assets/new" className="text-primary hover:underline">
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
            items={assets}
            keyOf={(a) => a.id}
            onPick={(a) => navigate(`/assets/${a.id}`)}
            empty={loading ? null : t('asset.none')}
            render={(a) => ({
              title: a.name,
              subtitle: a.identifier || undefined,
              meta: (
                <>
                  <span>{tOpt('assetkind', a.kind)}</span>
                  {a.provider && <span>{a.provider}</span>}
                  {a.credential_label && (
                    <span className="font-mono">
                      {a.credential_user || a.credential_label}
                    </span>
                  )}
                  <span>
                    {a.project_count} {t('nav.projects')}
                  </span>
                </>
              ),
              trailing: (
                <>
                  <span className="tabular-nums text-sm">
                    {formatMoney(a.cost_amount, a.cost_currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tOpt('cycle', a.billing_cycle)}
                  </span>
                  {a.status === 'active' ? (
                    <RenewalBadge renewsOn={a.renews_on} />
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {tOpt('assetstatus', a.status)}
                    </Badge>
                  )}
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}
