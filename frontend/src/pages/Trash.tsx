import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { TrashItem } from '@/types'
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
import { useConfirm } from '@/components/confirm'
import { ErrorNote, formatDate, Loading, PageHeader } from '@/components/bits'
import { CardList, Responsive } from '@/components/cards'

export default function Trash() {
  const { t } = useT()
  const confirm = useConfirm()
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .trash()
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  async function restore(item: TrashItem) {
    // Bringing something back can collide with a name taken since, so it asks
    // twice like the destructive actions do.
    const ok = await confirm({
      title: t('confirm.restoreTitle', { name: item.label }),
      body: t('confirm.restoreBody'),
      confirmLabel: t('confirm.restoreYes'),
      double: true,
      doubleTitle: t('confirm.restoreAgainTitle', { name: item.label }),
      doubleBody: t('confirm.restoreAgainBody'),
    })
    if (!ok) return

    try {
      await api.restore(item.entity, item.id)
      toast.success(t('trash.restored', { name: item.label }))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failed'))
    }
  }

  async function purge(item: TrashItem) {
    const ok = await confirm({
      title: t('confirm.purgeTitle', { name: item.label }),
      body: t('confirm.purgeBody'),
      confirmLabel: t('confirm.purgeYes'),
      danger: true,
      double: true,
      doubleTitle: t('confirm.purgeAgainTitle', { name: item.label }),
      doubleBody: t('confirm.purgeAgainBody'),
    })
    if (!ok) return

    try {
      await api.purge(item.entity, item.id)
      toast.success(t('trash.purged'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!items) return <Loading />

  return (
    <>
      <PageHeader title={t('trash.title')} description={t('trash.subtitle')} />

      <Responsive
        table={
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.kind')}</TableHead>
                  <TableHead>{t('trash.deletedAt')}</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.entity}-${item.id}`}>
                    <TableCell>
                      <div className="font-medium">{item.label}</div>
                      {item.detail && (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {item.detail}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`trash.entity.${item.entity}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(item.deleted_at)}
                      {item.deleted_by && ` · ${item.deleted_by}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => restore(item)}>
                          <RotateCcw className="size-4" />
                          {t('trash.restore')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => purge(item)}
                          aria-label={t('trash.purge')}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {t('trash.empty')}
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
            keyOf={(item) => `${item.entity}-${item.id}`}
            empty={t('trash.empty')}
            render={(item) => ({
              title: item.label,
              subtitle: item.detail || undefined,
              meta: (
                <>
                  <Badge variant="secondary">{t(`trash.entity.${item.entity}`)}</Badge>
                  <span>
                    {formatDate(item.deleted_at)}
                    {item.deleted_by && ` · ${item.deleted_by}`}
                  </span>
                </>
              ),
              footer: (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => restore(item)}
                  >
                    <RotateCcw className="size-4" />
                    {t('trash.restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => purge(item)}
                    aria-label={t('trash.purge')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ),
            })}
          />
        }
      />
    </>
  )
}
