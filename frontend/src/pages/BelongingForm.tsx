import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import { useMeta } from '@/App'
import type { Belonging, BelongingInput, MaintenanceInput } from '@/types'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm'
import {
  AuditInfo,
  ErrorNote,
  Field,
  formatDate,
  formatMoney,
  MoneyInput,
  NameInput,
  PageHeader,
  RenewalBadge,
  Spinner,
} from '@/components/bits'
import { Files } from '@/components/Files'

const blank: BelongingInput = {
  name: '',
  kind: 'vehicle',
  brand: '',
  model: '',
  year: null,
  identifier: '',
  acquired_on: '',
  price: 0,
  currency: 'IDR',
  warranty_until: '',
  location: '',
  ownership: 'owned',
  condition: 'new',
  rent_amount: 0,
  rent_cycle: 'monthly',
  rent_due_on: '',
  status: 'active',
  notes: '',
}

const blankLog: MaintenanceInput = {
  done_on: '',
  kind: 'service',
  odometer: null,
  description: '',
  vendor: '',
  cost: 0,
  next_due: '',
}

export default function BelongingForm() {
  const { id } = useParams()
  const meta = useMeta()
  const navigate = useNavigate()
  const { t, tOpt } = useT()
  const confirm = useConfirm()

  const [form, setForm] = useState<BelongingInput>(blank)
  const [record, setRecord] = useState<Belonging | null>(null)
  const [log, setLog] = useState<MaintenanceInput>(blankLog)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    api
      .belonging(Number(id))
      .then((b) => {
        setRecord(b)
        setForm({
          name: b.name,
          kind: b.kind,
          brand: b.brand,
          model: b.model,
          year: b.year,
          identifier: b.identifier,
          acquired_on: b.acquired_on ? b.acquired_on.slice(0, 10) : '',
          price: b.price,
          currency: b.currency,
          warranty_until: b.warranty_until ? b.warranty_until.slice(0, 10) : '',
          location: b.location,
          ownership: b.ownership,
          condition: b.condition,
          rent_amount: b.rent_amount,
          rent_cycle: b.rent_cycle,
          rent_due_on: b.rent_due_on ? b.rent_due_on.slice(0, 10) : '',
          status: b.status,
          notes: b.notes,
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(load, [load])

  function set<K extends keyof BelongingInput>(key: K, value: BelongingInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (id) {
        await api.updateBelonging(Number(id), form)
        toast.success('Barang disimpan')
        load()
        setBusy(false)
      } else {
        await api.createBelonging(form)
        toast.success('Barang dibuat')
        navigate('/belongings')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gagal menyimpan')
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    const ok = await confirm({
      title: t('confirm.deleteTitle', { name: form.name }),
      body: t('confirm.deleteBody'),
      confirmLabel: t('confirm.deleteYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.deleteAgainTitle', { name: form.name }),
      doubleBody: t('confirm.deleteAgainBody'),
    })
    if (!ok) return
    await api.deleteBelonging(Number(id))
    toast.success('Barang dihapus')
    navigate('/belongings')
  }

  async function addLog(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    try {
      await api.addMaintenance(Number(id), log)
      setLog({ ...blankLog, kind: log.kind })
      toast.success('Catatan perawatan ditambahkan')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'gagal nambah catatan')
    }
  }

  async function removeLog(logId: number) {
    if (!(await confirm({ title: t('confirm.removeLogTitle'), danger: true }))) return
    await api.deleteMaintenance(logId).catch(() => undefined)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={id ? form.name || 'Barang' : 'Barang baru'}
        description="Kendaraan, elektronik, perabot, properti — apa pun yang perlu diservis, dibayar pajaknya, atau ada garansinya."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nama" htmlFor="name">
                <NameInput
                  id="name"
                  required
                  value={form.name}
                  onValue={(v) => set('name', v)}
                />
              </Field>
              <Field label="Jenis">
                <Select value={form.kind} onValueChange={(v) => set('kind', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.belonging_kinds.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Merek" htmlFor="brand">
                <NameInput
                  id="brand"
                  value={form.brand}
                  onValue={(v) => set('brand', v)}
                />
              </Field>
              <Field label="Model" htmlFor="model">
                <NameInput
                  id="model"
                  value={form.model}
                  onValue={(v) => set('model', v)}
                />
              </Field>
              <Field label="Tahun" htmlFor="year">
                <Input
                  id="year"
                  type="number"
                  className="tabular-nums"
                  value={form.year ?? ''}
                  onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Penanda" htmlFor="identifier" hint="— plat nomor, nomor seri">
                <Input
                  id="identifier"
                  className="font-mono text-xs"
                  value={form.identifier}
                  onChange={(e) => set('identifier', e.target.value)}
                />
              </Field>
              <Field label="Lokasi" htmlFor="location">
                <NameInput
                  id="location"
                  value={form.location}
                  onValue={(v) => set('location', v)}
                />
              </Field>
            </div>

            <Field label={t('thing.ownership')}>
              <div className="flex w-fit flex-wrap items-center gap-1 rounded-md border p-0.5">
                {meta.ownerships.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={form.ownership === item.value ? 'secondary' : 'ghost'}
                    onClick={() => set('ownership', item.value)}
                  >
                    {tOpt('ownership', item.value, item.label)}
                  </Button>
                ))}
              </div>
            </Field>

            {/* Owned things have a purchase price and a condition; rented ones
                have a rent and a due date. Showing both at once is noise. */}
            {form.ownership === 'owned' ? (
              <>
                <Field label={t('thing.condition')}>
                  <div className="flex w-fit items-center gap-1 rounded-md border p-0.5">
                    {meta.conditions.map((item) => (
                      <Button
                        key={item.value}
                        type="button"
                        size="sm"
                        variant={form.condition === item.value ? 'secondary' : 'ghost'}
                        onClick={() => set('condition', item.value)}
                      >
                        {tOpt('condition', item.value, item.label)}
                      </Button>
                    ))}
                  </div>
                </Field>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label={t('thing.price')} htmlFor="price">
                    <MoneyInput
                      id="price"
                      value={form.price}
                      onValue={(v) => set('price', v)}
                    />
                  </Field>
                  <Field label={t('asset.currency')}>
                    <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meta.currencies.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('common.status')}>
                    <Select value={form.status} onValueChange={(v) => set('status', v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meta.belonging_statuses.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {tOpt('thingstatus', item.value, item.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </>
            ) : (
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label={t('thing.rent')} htmlFor="rent">
                  <MoneyInput
                    id="rent"
                    value={form.rent_amount}
                    onValue={(v) => set('rent_amount', v)}
                  />
                </Field>
                <Field label={t('asset.cycle')}>
                  <Select value={form.rent_cycle} onValueChange={(v) => set('rent_cycle', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.billing_cycles.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {tOpt('cycle', item.value, item.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('thing.rentDue')} htmlFor="rentdue">
                  <Input
                    id="rentdue"
                    type="date"
                    value={form.rent_due_on}
                    onChange={(e) => set('rent_due_on', e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Dibeli" htmlFor="acquired">
                <Input
                  id="acquired"
                  type="date"
                  value={form.acquired_on}
                  onChange={(e) => set('acquired_on', e.target.value)}
                />
              </Field>
              <Field label="Garansi sampai" htmlFor="warranty">
                <Input
                  id="warranty"
                  type="date"
                  value={form.warranty_until}
                  onChange={(e) => set('warranty_until', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Catatan" htmlFor="notes">
              <Textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                Simpan
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/belongings">Batal</Link>
              </Button>
              {id && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  Hapus
                </Button>
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

      {record && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
            Riwayat perawatan
            {record.next_due && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                berikutnya {formatDate(record.next_due)}
              </span>
            )}
          </h2>

          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Biaya</TableHead>
                  <TableHead>Berikutnya</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(record.logs ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(entry.done_on)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {meta.maintenance_kinds.find((k) => k.value === entry.kind)?.label ??
                        entry.kind}
                    </TableCell>
                    <TableCell>
                      {entry.description || '—'}
                      {(entry.vendor || entry.odometer) && (
                        <div className="text-xs text-muted-foreground">
                          {[entry.vendor, entry.odometer ? `${entry.odometer} km` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(entry.cost, record.currency)}
                    </TableCell>
                    <TableCell>
                      {entry.next_due ? (
                        <RenewalBadge renewsOn={entry.next_due} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeLog(entry.id)}
                        aria-label="Hapus catatan"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(record.logs ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Belum ada catatan perawatan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={addLog}>
            <div className="w-36">
              <label className="mb-1 block text-xs text-muted-foreground">Tanggal</label>
              <Input
                type="date"
                value={log.done_on}
                onChange={(e) => setLog({ ...log, done_on: e.target.value })}
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs text-muted-foreground">Jenis</label>
              <Select value={log.kind} onValueChange={(v) => setLog({ ...log, kind: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.maintenance_kinds.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Keterangan</label>
              <Input
                value={log.description}
                onChange={(e) => setLog({ ...log, description: e.target.value })}
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs text-muted-foreground">Biaya</label>
              <MoneyInput value={log.cost} onValue={(v) => setLog({ ...log, cost: v })} />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-xs text-muted-foreground">Berikutnya</label>
              <Input
                type="date"
                value={log.next_due}
                onChange={(e) => setLog({ ...log, next_due: e.target.value })}
              />
            </div>
            <Button type="submit">
              <Plus className="size-4" />
              Catat
            </Button>
          </form>
        </>
      )}

      {id && <Files entity="belonging" id={Number(id)} />}
    </div>
  )
}
