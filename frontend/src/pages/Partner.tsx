import { useCallback, useEffect, useState } from 'react'
import { Check, Gift, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { PartnerItem } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'

/**
 * A list of things to get for a future partner.
 *
 * Underneath it is a shopping list with the deadline taken out: an idea caught
 * now so it survives to when it can be acted on. The one date it keeps is the
 * day a thing was actually bought, and that date is also what "bought" means —
 * a row with none is still to get, a row with one is had. Ticking fills it with
 * today; the date then sits on the row to be walked back if the buying happened
 * on some other day.
 */

// Today as a date input wants it (yyyy-mm-dd), in local time so a purchase
// logged at night is not filed under tomorrow the way a UTC slice would.
function today() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The server keeps a full timestamp; a date input takes only the day.
const dayValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export default function Partner() {
  const { t } = useT()
  const ask = useConfirm()
  const [items, setItems] = useState<PartnerItem[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .partnerItems()
      .then((data) => {
        setItems(data.items)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.failed')))
  }, [t])

  useEffect(load, [load])

  const open = items?.filter((item) => !item.bought_on) ?? []
  const bought = items?.filter((item) => item.bought_on) ?? []

  async function add(item: string) {
    await api.createPartnerItem({ item, bought_on: '' })
    load()
  }

  // Ticking records the purchase — today by default, adjustable on the row
  // afterwards. Unticking walks it back to still-to-get.
  async function toggle(item: PartnerItem) {
    const bought_on = item.bought_on ? '' : today()
    setItems((list) =>
      (list ?? []).map((row) => (row.id === item.id ? { ...row, bought_on: bought_on || null } : row)),
    )
    try {
      await api.updatePartnerItem(item.id, { item: item.item, bought_on })
      load()
    } catch {
      toast.error(t('common.failed'))
      load()
    }
  }

  async function setDate(item: PartnerItem, day: string) {
    if (dayValue(item.bought_on) === day) return
    setItems((list) =>
      (list ?? []).map((row) => (row.id === item.id ? { ...row, bought_on: day || null } : row)),
    )
    try {
      await api.updatePartnerItem(item.id, { item: item.item, bought_on: day })
      load()
    } catch {
      toast.error(t('common.failed'))
      load()
    }
  }

  async function rename(item: PartnerItem, text: string) {
    const trimmed = text.trim()
    if (!trimmed || trimmed === item.item) return
    try {
      await api.updatePartnerItem(item.id, { item: trimmed, bought_on: dayValue(item.bought_on) })
      load()
    } catch {
      toast.error(t('common.failed'))
      load()
    }
  }

  async function remove(item: PartnerItem) {
    if (!(await ask({ title: t('partner.deleteConfirm', { item: item.item }), danger: true }))) return
    setItems((list) => (list ?? []).filter((row) => row.id !== item.id))
    try {
      await api.deletePartnerItem(item.id)
    } catch {
      toast.error(t('common.failed'))
      load()
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('partner.title')}
        description={
          open.length
            ? t('partner.open', { n: open.length })
            : bought.length
              ? t('partner.allDone')
              : undefined
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <AddRow onAdd={add} />

      {items === null ? (
        <Loading />
      ) : open.length === 0 && bought.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Gift className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('partner.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4 py-0">
          <CardContent className="divide-y px-0">
            {[...open, ...bought].map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => toggle(item)}
                onDate={(day) => setDate(item, day)}
                onRename={(text) => rename(item, text)}
                onRemove={() => remove(item)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// One line in. The date is set later, by ticking, so adding is just the name.
function AddRow({ onAdd }: { onAdd: (item: string) => Promise<void> }) {
  const { t } = useT()
  const [item, setItem] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = item.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onAdd(trimmed)
      setItem('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={item}
        onChange={(event) => setItem(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && submit()}
        placeholder={t('partner.add')}
        className="min-w-40 flex-1"
      />
      <Button onClick={submit} disabled={!item.trim() || busy}>
        <Plus className="size-4" />
        {t('common.add')}
      </Button>
    </div>
  )
}

function ItemRow({
  item,
  onToggle,
  onDate,
  onRename,
  onRemove,
}: {
  item: PartnerItem
  onToggle: () => void
  onDate: (day: string) => void
  onRename: (text: string) => void
  onRemove: () => void
}) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.item)

  const done = item.bought_on !== null

  function save() {
    setEditing(false)
    onRename(text)
  }

  function cancel() {
    setText(item.item)
    setEditing(false)
  }

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', done && 'opacity-60')}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={t(done ? 'partner.untick' : 'partner.tick')}
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded border transition-colors',
          done ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary',
        )}
      >
        {done && <Check className="size-3.5" />}
      </button>

      {editing ? (
        <Input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') cancel()
          }}
          onBlur={save}
          className="min-w-0 flex-1"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <span className={cn('block truncate text-sm', done && 'line-through')}>{item.item}</span>
        </button>
      )}

      {/* The purchase date, in reach and editable — buying rarely happens on the
          day it gets ticked off. */}
      {done && (
        <Input
          type="date"
          value={dayValue(item.bought_on)}
          onChange={(event) => onDate(event.target.value)}
          aria-label={t('partner.boughtOn')}
          className="w-36 shrink-0"
        />
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={t('common.delete')}
        title={t('common.delete')}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
