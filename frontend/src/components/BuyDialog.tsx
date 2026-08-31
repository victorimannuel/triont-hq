import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, PackagePlus, Pencil, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { PurchaseInput, Supply } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, MoneyInput, NameInput, Spinner } from '@/components/bits'

/**
 * Stock goes up for one of two reasons and they are not the same thing. A
 * purchase belongs in the history — it is what makes "how often does this run
 * out" and "what did it cost last time" answerable. A miscount does not: the
 * shelf said three, the record said five, and nobody went shopping.
 *
 * So the button asks which, then shows only what that answer needs. Taking
 * something off the shelf still needs no dialog at all.
 */
type Mode = 'ask' | 'buy' | 'fix'

export function BuyDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: Supply | null
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { t, tOpt } = useT()
  const meta = useMeta()

  const [mode, setMode] = useState<Mode>('ask')
  const [busy, setBusy] = useState(false)
  const [buy, setBuy] = useState<PurchaseInput>({
    bought_on: '',
    quantity: 1,
    price: 0,
    currency: 'IDR',
    vendor: '',
    notes: '',
  })
  const [actual, setActual] = useState(0)

  // Opening on a different item starts over, with the correction field showing
  // what the record currently claims.
  useEffect(() => {
    if (!item) return
    setMode('ask')
    setBuy((prev) => ({ ...prev, quantity: 1, price: 0, bought_on: '' }))
    setActual(item.quantity)
  }, [item])

  async function record(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    setBusy(true)
    try {
      await api.addPurchase(item.id, buy)
      toast.success(t('supply.bought'))
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supply.buyFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function correct(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    setBusy(true)
    try {
      await api.adjustSupply(item.id, { to: actual })
      toast.success(t('supply.corrected'))
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supply.adjustFailed'))
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Button type="button" variant="ghost" size="sm" onClick={() => setMode('ask')}>
      <ArrowLeft className="size-4" />
      {t('common.back')}
    </Button>
  )

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{item?.name}</DialogTitle>
        <DialogDescription className="mb-4">
          {mode === 'ask'
            ? t('supply.buyAsk')
            : item &&
              t('supply.currently', {
                n: String(item.quantity),
                unit: tOpt('unit', item.unit),
              })}
        </DialogDescription>

        {mode === 'ask' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-auto flex-col gap-1 py-4" onClick={() => setMode('buy')}>
              <ShoppingCart className="size-5" />
              {t('supply.modeBuy')}
              <span className="text-xs font-normal opacity-80">
                {t('supply.modeBuyHint')}
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={() => setMode('fix')}
            >
              <Pencil className="size-5" />
              {t('supply.modeFix')}
              <span className="text-xs font-normal text-muted-foreground">
                {t('supply.modeFixHint')}
              </span>
            </Button>
          </div>
        )}

        {mode === 'buy' && (
          <form className="space-y-4" onSubmit={record}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('supply.howMany')} htmlFor="buy-qty">
                <MoneyInput
                  id="buy-qty"
                  value={buy.quantity}
                  onValue={(v) => setBuy({ ...buy, quantity: v })}
                />
              </Field>
              <Field label={t('supply.price')} htmlFor="buy-price">
                <MoneyInput
                  id="buy-price"
                  value={buy.price}
                  onValue={(v) => setBuy({ ...buy, price: v })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('supply.vendor')} htmlFor="buy-vendor">
                <NameInput
                  id="buy-vendor"
                  placeholder={t('supply.vendorHint')}
                  value={buy.vendor}
                  onValue={(v) => setBuy({ ...buy, vendor: v })}
                />
              </Field>
              <Field label={t('asset.currency')}>
                <Select
                  value={buy.currency}
                  onValueChange={(v) => setBuy({ ...buy, currency: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.currencies.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t('supply.boughtOn')} htmlFor="buy-date" hint={t('supply.todayHint')}>
              <Input
                id="buy-date"
                type="date"
                value={buy.bought_on}
                onChange={(e) => setBuy({ ...buy, bought_on: e.target.value })}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              {back}
              <Button type="submit" className="ml-auto" disabled={busy}>
                {busy ? <Spinner /> : <PackagePlus className="size-4" />}
                {t('supply.addPurchase')}
              </Button>
            </div>
          </form>
        )}

        {mode === 'fix' && (
          <form className="space-y-4" onSubmit={correct}>
            <Field
              label={t('supply.actual')}
              htmlFor="fix-qty"
              hint={t('supply.actualHint')}
            >
              <MoneyInput id="fix-qty" value={actual} onValue={setActual} autoFocus />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              {back}
              <Button type="submit" className="ml-auto" disabled={busy}>
                {busy ? <Spinner /> : <Pencil className="size-4" />}
                {t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
