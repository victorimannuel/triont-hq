import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, RotateCw, ShoppingCart, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useList } from '@/lib/useList'
import { useFileCounts } from '@/lib/useFileCounts'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { Supply } from '@/types'
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
import { BuyDialog } from '@/components/BuyDialog'
import { FEATURES } from '@/lib/features'
import { CardList, Responsive } from '@/components/cards'
import { ErrorNote, PageHeader } from '@/components/bits'
import { FileCount } from '@/components/Files'
import { FilterSelect, SearchInput } from '@/components/filters'

/** "2" not "2.00", but "0.5" stays "0.5" — half a bottle is a real amount. */
const amount = (n: number) => (Number.isInteger(n) ? String(n) : String(n))

export default function Supplies() {
  const meta = useMeta()
  const { t, tOpt } = useT()
  const navigate = useNavigate()

  const list = useList(['q', 'category', 'low'], api.supplies, {
    supplies: [] as Supply[],
    low: 0,
  })
  const { loading, error, query, filtered, update, clear, reload } = list
  const fileCounts = useFileCounts('supply', FEATURES.supplyFiles)
  const supplies = list.data.supplies

  // Which item the buy dialog is open for. Adding stock asks why; taking it
  // away does not, because taking one off a shelf has no history worth having.
  const [buying, setBuying] = useState<Supply | null>(null)

  // Adjusting is the whole point of this page, so it never navigates away and
  // never asks for confirmation — it just moves the number and refetches.
  async function nudge(item: Supply, delta: number) {
    try {
      await api.adjustSupply(item.id, { delta })
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supply.adjustFailed'))
    }
  }

  const buttons = (item: Supply) => (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => nudge(item, -1)}
        disabled={item.quantity <= 0}
        aria-label="−1"
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-14 text-center tabular-nums">
        <span className="font-medium">{amount(item.quantity)}</span>{' '}
        <span className="text-xs text-muted-foreground">
          {tOpt('unit', item.unit)}
        </span>
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        // Without the buying history there is nothing to ask about: both
        // answers used to end in the same larger number, so the dialog would
        // only be a question with one meaningful reply.
        onClick={() => (FEATURES.supplyPurchases ? setBuying(item) : nudge(item, 1))}
        aria-label={t('supply.addStock')}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )

  return (
    <>
      <PageHeader
        title={t('supply.title')}
        description={
          loading
            ? t('common.loading')
            : list.data.low > 0
              ? t('supply.lowCount', { n: list.data.low })
              : t('supply.allStocked')
        }
        action={
          <Button asChild>
            <Link to="/supplies/new">
              <Plus className="size-4" />
              {t('supply.new')}
            </Link>
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query.q}
          onChange={(v) => update('q', v)}
          placeholder={t('supply.search')}
        />

        <FilterSelect
          label={t('supply.category')}
          value={query.category}
          onChange={(v) => update('category', v)}
          options={meta.supply_categories.map((item) => ({
            value: item.value,
            label: tOpt('supplycat', item.value, item.label),
          }))}
        />

        {/* The shopping list, one tap away. */}
        <Button
          variant={query.low === '1' ? 'default' : 'outline'}
          onClick={() => update('low', query.low === '1' ? '' : '1')}
        >
          <ShoppingCart className="size-4" />
          {t('supply.onlyLow')}
        </Button>

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
                  <TableHead>{t('supply.category')}</TableHead>
                  <TableHead>{t('supply.where')}</TableHead>
                  <TableHead className="w-[13rem]">{t('supply.left')}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplies.map((item) => (
                  <TableRow
                    key={item.id}
                    onClick={() => navigate(`/supplies/${item.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {item.name}
                        {FEATURES.supplyFiles && <FileCount n={fileCounts[item.id]} />}
                      </div>
                      {item.notes && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {item.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tOpt('supplycat', item.category)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.location || '—'}
                    </TableCell>
                    <TableCell>{buttons(item)}</TableCell>
                    <TableCell>
                      {item.low && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-warning/15 text-warning"
                        >
                          {t('supply.low')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && supplies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {query.low === '1' ? t('supply.noneLow') : t('supply.none')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        }
        cards={
          <CardList
            items={supplies}
            keyOf={(item) => item.id}
            onPick={(item) => navigate(`/supplies/${item.id}`)}
            empty={
              loading ? null : query.low === '1' ? t('supply.noneLow') : t('supply.none')
            }
            render={(item) => ({
              title: item.name,
              subtitle: item.location || undefined,
              meta: (
                <>
                  <span>{tOpt('supplycat', item.category)}</span>
                  {item.low && (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-warning/15 text-warning"
                    >
                      {t('supply.low')}
                    </Badge>
                  )}
                  {FEATURES.supplyFiles && <FileCount n={fileCounts[item.id]} />}
                </>
              ),
              footer: buttons(item),
            })}
          />
        }
      />

      {FEATURES.supplyPurchases && (
        <BuyDialog
          item={buying}
          onOpenChange={(open) => !open && setBuying(null)}
          onDone={() => {
            setBuying(null)
            reload()
          }}
        />
      )}

      {supplies.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          <RotateCw className="mr-1 inline size-3" />
          {t(FEATURES.supplyPurchases ? 'supply.hint' : 'supply.hintSimple')}
        </p>
      )}
    </>
  )
}
