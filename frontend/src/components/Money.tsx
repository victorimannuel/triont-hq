import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { FxRate } from '@/types'
import { Button } from '@/components/ui/button'
import { formatDate, formatMoney } from '@/components/bits'

/** Converts each currency to rupiah with the stored rate and adds them up.
 *  Anything with no rate on file is left out rather than guessed at. */
export function toIDR(byCurrency: Record<string, number>, rates: FxRate[]) {
  const table = new Map(rates.map((r) => [r.currency, r.rate]))
  let total = 0
  let missing = false
  for (const [currency, amount] of Object.entries(byCurrency)) {
    if (amount <= 0) continue
    if (currency === 'IDR') {
      total += amount
      continue
    }
    const rate = table.get(currency)
    if (!rate) {
      missing = true
      continue
    }
    total += amount * rate
  }
  return { total, missing }
}

export function latestFetch(rates: FxRate[]) {
  const stamps = rates.map((r) => r.fetched_at).filter(Boolean).sort()
  return stamps.length ? stamps[stamps.length - 1] : ''
}

/** The monthly figure, converted, with the rate date and a way to refresh it
 *  right there — a converted number you cannot date or refresh is a trap. */
export function MonthlyTotal({
  byCurrency,
  rates,
  onRefreshed,
}: {
  byCurrency: Record<string, number>
  rates: FxRate[]
  onRefreshed?: (rates: FxRate[]) => void
}) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState<FxRate[]>(rates)

  useEffect(() => setLocal(rates), [rates])

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const data = await api.refreshRates()
      setLocal(data.rates)
      onRefreshed?.(data.rates)
      toast.success(t('fx.updated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('fx.failed'))
    } finally {
      setBusy(false)
    }
  }, [onRefreshed, t])

  const { total, missing } = toIDR(byCurrency, local)
  const stamp = latestFetch(local)
  const parts = Object.entries(byCurrency)
    .filter(([, amount]) => amount > 0)
    .map(([currency, amount]) => formatMoney(Math.round(amount), currency))

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{parts.length ? parts.join(' + ') : '—'}</span>
      {parts.length > 0 && (
        <>
          <span className="font-medium text-foreground">
            {t('fx.approx', { cost: formatMoney(Math.round(total), 'IDR') })}
            {missing && ' *'}
          </span>
          <span className="text-xs text-muted-foreground">
            {stamp ? t('fx.asOf', { date: formatDate(stamp) }) : t('fx.never')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={refresh}
            disabled={busy}
            aria-label={t('fx.update')}
            title={t('fx.update')}
          >
            <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
        </>
      )}
    </span>
  )
}
