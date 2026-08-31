import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { FxRate } from '@/types'
import { Button } from '@/components/ui/button'
import { formatDate, formatMoney, Segmented } from '@/components/bits'
import { useRemembered } from '@/lib/useRemembered'

/** Rupiah per unit, for every currency with a rate on file. Rupiah itself is
 *  always in there — it is what the rates are quoted in. */
function table(rates: FxRate[]) {
  const map = new Map((rates ?? []).map((rate) => [rate.currency, rate.rate]))
  map.set('IDR', 1)
  return map
}

/** Adds a per-currency map up into one currency. Anything with no rate on
 *  file is left out rather than guessed at, and says so. */
export function convert(byCurrency: Record<string, number>, rates: FxRate[], target: string) {
  const map = table(rates)
  const perTarget = map.get(target)
  let total = 0
  let missing = false
  for (const [currency, amount] of Object.entries(byCurrency ?? {})) {
    if (!amount) continue
    const rate = map.get(currency)
    if (!rate || !perTarget) {
      missing = true
      continue
    }
    total += (amount * rate) / perTarget
  }
  return { total, missing }
}

export function latestFetch(rates: FxRate[]) {
  const stamps = (rates ?? [])
    .map((rate) => rate.fetched_at)
    .filter(Boolean)
    .sort()
  return stamps.length ? stamps[stamps.length - 1] : ''
}

/** "all" is the reading with no conversion in it at all: one figure per
 *  currency, which is the only honest answer when no rate has been fetched. */
export const CURRENCIES = ['IDR', 'USD', 'all'] as const
export type DisplayCurrency = (typeof CURRENCIES)[number]

/** Which currency totals are shown in, remembered between visits. */
export function useDisplayCurrency() {
  return useRemembered<DisplayCurrency>('hq.currency', CURRENCIES, 'IDR')
}

export function CurrencyToggle({
  value,
  onChange,
}: {
  value: DisplayCurrency
  onChange: (value: DisplayCurrency) => void
}) {
  const { t } = useT()
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={CURRENCIES.map((currency) => ({
        value: currency,
        label: currency === 'all' ? t('fx.all') : currency,
      }))}
    />
  )
}

/** "Rp 750.000 + US$1.200" — one figure per currency, never a fake total. */
export function eachCurrency(byCurrency: Record<string, number>) {
  const parts = Object.entries(byCurrency ?? {})
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => formatMoney(Math.round(amount), currency))
  return parts.length ? parts.join(' + ') : '—'
}

/** Pulls fresh rates. Nothing refreshes on its own, so the date shown next to
 *  a converted figure is always one that was asked for. */
export function RefreshRates({ onRefreshed }: { onRefreshed?: (rates: FxRate[]) => void }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const data = await api.refreshRates()
      onRefreshed?.(data.rates)
      toast.success(t('fx.updated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('fx.failed'))
    } finally {
      setBusy(false)
    }
  }, [onRefreshed, t])

  return (
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
  )
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
  const [local, setLocal] = useState<FxRate[]>(rates)

  useEffect(() => setLocal(rates), [rates])

  const take = useCallback(
    (next: FxRate[]) => {
      setLocal(next)
      onRefreshed?.(next)
    },
    [onRefreshed],
  )

  const { total, missing } = convert(byCurrency, local, 'IDR')
  const stamp = latestFetch(local)
  const each = eachCurrency(byCurrency)

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{each}</span>
      {each !== '—' && (
        <>
          <span className="font-medium text-foreground">
            {t('fx.approx', { cost: formatMoney(Math.round(total), 'IDR') })}
            {missing && ' *'}
          </span>
          <span className="text-xs text-muted-foreground">
            {stamp ? t('fx.asOf', { date: formatDate(stamp) }) : t('fx.never')}
          </span>
          <RefreshRates onRefreshed={take} />
        </>
      )}
    </span>
  )
}
