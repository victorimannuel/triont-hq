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
import { ErrorNote, formatDate, formatMoney, Mark, PageHeader, RenewalBadge } from '@/components/bits'
import { FileCount } from '@/components/Files'
import { SearchInput, FilterSelect } from '@/components/filters'
import { RowList } from '@/components/cards'

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

      <RowList
        items={items}
        keyOf={(i) => i.id}
        onPick={(i) => navigate(`/belongings/${i.id}`)}
        empty={loading ? null : t('thing.none')}
        render={(i) => ({
          leading: <Mark name={i.name} />,
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
