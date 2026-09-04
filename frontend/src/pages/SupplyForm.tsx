import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PackagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useMeta } from '@/App'
import { useT } from '@/i18n'
import type { PurchaseInput, Supply, SupplyInput, SupplyPurchase } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import {
  AuditInfo,
  ErrorNote,
  Field,
  MoreFields,
  formatDate,
  formatMoney,
  MoneyInput,
  NameInput,
  PageHeader,
  SectionTitle,
  Spinner,
} from '@/components/bits'
import { Files } from '@/components/Files'
import { FEATURES } from '@/lib/features'

const blankBuy: PurchaseInput = {
  bought_on: '',
  quantity: 1,
  price: 0,
  currency: 'IDR',
  vendor: '',
  notes: '',
}

const blank: SupplyInput = {
  name: '',
  category: 'other',
  location: '',
  unit: 'pcs',
  quantity: 0,
  low_at: 1,
  notes: '',
  last_restocked_on: '',
}

export default function SupplyForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<SupplyInput>(blank)
  const [record, setRecord] = useState<Supply | null>(null)
  const [purchases, setPurchases] = useState<SupplyPurchase[]>([])
  const [typical, setTypical] = useState<number | null>(null)
  const [buy, setBuy] = useState<PurchaseInput>(blankBuy)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .supply(Number(id))
      .then(({ supply: item, purchases, typical_days }) => {
        setRecord(item)
        setPurchases(purchases)
        setTypical(typical_days)
        setForm({
          name: item.name,
          category: item.category,
          location: item.location,
          unit: item.unit,
          quantity: item.quantity,
          low_at: item.low_at,
          notes: item.notes,
          last_restocked_on: item.last_restocked_on
            ? item.last_restocked_on.slice(0, 10)
            : '',
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  function set<K extends keyof SupplyInput>(key: K, value: SupplyInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) await api.updateSupply(Number(id), form)
      else await api.createSupply(form)
      navigate('/supplies')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  // Recording a purchase is how stock goes up: the count and the history move
  // together, so neither can drift away from the other.
  async function addPurchase(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    try {
      const item = await api.addPurchase(Number(id), buy)
      setForm((prev) => ({
        ...prev,
        quantity: item.quantity,
        last_restocked_on: item.last_restocked_on?.slice(0, 10) ?? '',
      }))
      setBuy({ ...blankBuy, currency: buy.currency, vendor: buy.vendor })
      await reloadHistory()
      toast.success(t('supply.bought'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supply.buyFailed'))
    }
  }

  async function removePurchase(purchase: SupplyPurchase) {
    if (!id) return
    try {
      const item = await api.deletePurchase(purchase.id)
      setForm((prev) => ({ ...prev, quantity: item.quantity }))
      await reloadHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supply.buyFailed'))
    }
  }

  async function reloadHistory() {
    if (!id) return
    const data = await api.supply(Number(id))
    setPurchases(data.purchases)
    setTypical(data.typical_days)
  }

  async function remove() {
    if (!id || !record) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: record.name }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: record.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return

    try {
      await api.deleteSupply(Number(id))
      navigate('/supplies')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.deleteFailed'))
    }
  }

  // What sits in the folded half, so hiding it never hides that it is filled.
  const extras = [
    form.location,
    form.last_restocked_on,
    form.notes,
  ].filter(Boolean).length

  return (
    <>
      <PageHeader back="/supplies" title={id ? form.name || t('supply.edit') : t('supply.new')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('common.name')} htmlFor="name" hint={t('supply.nameHint')}>
                <NameInput
                  id="name"
                  required
                  autoFocus
                  value={form.name}
                  onValue={(v) => set('name', v)}
                />
              </Field>
              <Field label={t('supply.category')}>
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.supply_categories.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('supplycat', item.value, item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label={t('supply.quantity')} htmlFor="qty">
                <MoneyInput
                  id="qty"
                  value={form.quantity}
                  onValue={(v) => set('quantity', v)}
                />
              </Field>
              <Field label={t('supply.unit')}>
                <Select value={form.unit} onValueChange={(v) => set('unit', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.supply_units.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {tOpt('unit', item.value, item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('supply.lowAt')} htmlFor="low" hint={t('supply.lowAtHint')}>
                <MoneyInput id="low" value={form.low_at} onValue={(v) => set('low_at', v)} />
              </Field>
            </div>

            <MoreFields
              label={t('form.more')}
              note={extras ? t('form.filled', { n: extras }) : undefined}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('supply.where')} htmlFor="location" hint={t('supply.whereHint')}>
                  <NameInput
                    id="location"
                    value={form.location}
                    onValue={(v) => set('location', v)}
                  />
                </Field>
                <Field label={t('supply.restockedOn')} htmlFor="restocked">
                  <Input
                    id="restocked"
                    type="date"
                    value={form.last_restocked_on}
                    onChange={(e) => set('last_restocked_on', e.target.value)}
                  />
                </Field>
              </div>

              <Field label={t('common.notes')} htmlFor="notes">
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </MoreFields>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {busy ? t('common.saving') : t('common.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/supplies')}>
                {t('common.cancel')}
              </Button>

              {id && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={remove}
                  >
                    <Trash2 className="size-4" />
                    {t('common.delete')}
                  </Button>
                </>
              )}
            </div>
          </form>

          {record && (
            <AuditInfo
              createdBy={record.created_by}
              createdAt={record.created_at}
              updatedBy={record.updated_by}
              updatedAt={record.updated_at}
            />
          )}
        </CardContent>
      </Card>

      {id && FEATURES.supplyPurchases && (
        <>
          <SectionTitle
            hint={
              typical
                ? t('supply.typical', { n: typical })
                : purchases.length > 0
                  ? undefined
                  : t('supply.historyHint')
            }
          >
            {t('supply.history')}
          </SectionTitle>

          <Card className="mb-6">
            <CardContent className="space-y-4">
              <form className="flex flex-wrap items-end gap-3" onSubmit={addPurchase}>
                <Field label={t('supply.boughtOn')} htmlFor="bought">
                  <Input
                    id="bought"
                    type="date"
                    className="w-40"
                    value={buy.bought_on}
                    onChange={(e) => setBuy({ ...buy, bought_on: e.target.value })}
                  />
                </Field>
                <Field label={t('supply.howMany')} htmlFor="buyqty">
                  <MoneyInput
                    id="buyqty"
                    className="w-24"
                    value={buy.quantity}
                    onValue={(v) => setBuy({ ...buy, quantity: v })}
                  />
                </Field>
                <Field label={t('supply.price')} htmlFor="price">
                  <MoneyInput
                    id="price"
                    className="w-32"
                    value={buy.price}
                    onValue={(v) => setBuy({ ...buy, price: v })}
                  />
                </Field>
                <Field label={t('supply.vendor')} htmlFor="vendor">
                  <NameInput
                    id="vendor"
                    className="w-40"
                    placeholder={t('supply.vendorHint')}
                    value={buy.vendor}
                    onValue={(v) => setBuy({ ...buy, vendor: v })}
                  />
                </Field>
                <Button type="submit">
                  <PackagePlus className="size-4" />
                  {t('supply.addPurchase')}
                </Button>
              </form>

              {purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('supply.noPurchases')}</p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-center gap-3 rounded-md border p-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {purchase.quantity} {tOpt('unit', form.unit)}
                          {purchase.vendor && (
                            <span className="ml-2 font-normal text-muted-foreground">
                              {purchase.vendor}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(purchase.bought_on)}
                          {purchase.since_last !== null && (
                            <> · {t('supply.afterDays', { n: purchase.since_last })}</>
                          )}
                        </div>
                      </div>
                      {purchase.price > 0 && (
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(purchase.price, purchase.currency)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePurchase(purchase)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {id && FEATURES.supplyFiles && <Files entity="supply" id={Number(id)} />}
    </>
  )
}
