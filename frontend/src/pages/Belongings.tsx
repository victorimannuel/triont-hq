import { Link, useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useFileCounts } from '@/lib/useFileCounts'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Belonging } from '@/types'
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
import {
  ErrorNote,
  formatDate,
  formatMoney,
  PageHeader,
  RenewalBadge,
} from '@/components/bits'
import { FileCount } from '@/components/Files'
import { SearchInput, FilterSelect } from '@/components/filters'
import { CardList, Responsive } from '@/components/cards'

export default function Belongings() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()
  const list = useList(['q', 'kind', 'status'], api.belongings, {
    belongings: [] as Belonging[],
  })
  const { loading, error, query, filtered, update, clear } = list
  const fileCounts = useFileCounts('belonging')
  const items = list.data.belongings

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
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('thing.searchPlaceholder')}
        />
        <FilterSelect
          label={t('common.kind')}
          value={query.kind}
          onChange={(v) => update('kind', v)}
          options={meta.belonging_kinds.map((item) => ({
            value: item.value,
            label: tOpt('thingkind', item.value, item.label),
          }))}
        />
        <FilterSelect
          label={t('common.status')}
          value={query.status}
          onChange={(v) => update('status', v)}
          options={meta.belonging_statuses.map((item) => ({
            value: item.value,
            label: tOpt('thingstatus', item.value, item.label),
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
                      <div className="flex items-center gap-2 font-medium">
                        {item.name}
                        <FileCount n={fileCounts[item.id]} />
                      </div>
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
                  <FileCount n={fileCounts[i.id]} />
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
