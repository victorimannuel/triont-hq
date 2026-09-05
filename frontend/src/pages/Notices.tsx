import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Check, CheckCheck, Globe } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { SentNotice } from '@/types'
import { setUnread } from '@/lib/notices'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, formatDate, Loading, PageHeader } from '@/components/bits'
import { KIND_ICON, tone, type Kind } from '@/components/EntryRow'

/**
 * Everything HQ has already told you, and whether you have dealt with it. A
 * notification is the one thing here that used to leave no trace: it woke the
 * phone once and was gone, so anything caught at a bad moment was caught
 * nowhere. This is where it waits instead.
 */

// Two notifications are the same one when they are about the same deadline on
// the same morning, which is exactly the key the database uses.
const same = (a: SentNotice, b: SentNotice) => a.key === b.key && a.sent_on === b.sent_on

export default function Notices() {
  const { t } = useT()
  const [notices, setNotices] = useState<SentNotice[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .notices()
      .then((data) => {
        setNotices(data.notices)
        setUnread(data.unread)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('notices.failed')))
  }, [t])

  useEffect(load, [load])

  const unread = notices?.filter((notice) => !notice.read).length ?? 0

  // Marked in place before the request lands. The row going quiet is the whole
  // feedback of a tap, and waiting a round trip for it feels broken.
  async function markRead(notice: SentNotice) {
    if (notice.read) return
    setNotices((list) =>
      (list ?? []).map((row) => (same(row, notice) ? { ...row, read: true } : row)),
    )
    try {
      const { unread } = await api.markNoticeRead({ key: notice.key, sent_on: notice.sent_on })
      setUnread(unread)
    } catch {
      toast.error(t('notices.failed'))
      load()
    }
  }

  async function markAll() {
    setBusy(true)
    try {
      const { unread } = await api.markNoticeRead({ all: true })
      setNotices((list) => (list ?? []).map((row) => ({ ...row, read: true })))
      setUnread(unread)
    } catch {
      toast.error(t('notices.failed'))
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('notices.title')}
        description={unread ? t('notices.unread', { n: unread }) : t('notices.allRead')}
        action={
          unread > 0 && (
            <Button variant="outline" onClick={markAll} disabled={busy}>
              <CheckCheck className="size-4" />
              {t('notices.markAll')}
            </Button>
          )
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {notices === null ? (
        <Loading />
      ) : notices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BellOff className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('notices.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="divide-y px-0">
            {notices.map((notice) => (
              <NoticeRow
                key={notice.key + notice.sent_on}
                notice={notice}
                onRead={() => markRead(notice)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NoticeRow({ notice, onRead }: { notice: SentNotice; onRead: () => void }) {
  const { t } = useT()
  const digest = notice.kind === 'digest'
  const Icon = digest ? Bell : (KIND_ICON[notice.kind as Kind] ?? Globe)

  const body = (
    <>
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded',
          digest ? 'bg-muted text-muted-foreground' : tone(notice.kind),
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', !notice.read && 'font-medium')}>
          {digest ? t('notices.digestName') : notice.label || t('notices.unnamed')}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {digest ? t('notices.digestWhat') : t(`cal.kind.${notice.kind}`)}
        </p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">{formatDate(notice.sent_on)}</p>
    </>
  )

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', notice.read && 'opacity-60')}>
      {/* The dot holds its width either way, so a row does not jump sideways
          the moment it is read. */}
      <span
        className={cn('size-2 shrink-0 rounded-full', notice.read ? 'bg-transparent' : 'bg-primary')}
      />

      {/* The roundup has no page of its own, and a deadline whose row was
          deleted since has nowhere left to go either. */}
      {notice.url ? (
        <Link
          to={notice.url}
          onClick={onRead}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:opacity-80"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}

      {/* Only on rows that can still be marked, but the space is held either
          way so a row does not reflow the moment it is read. */}
      <div className="size-9 shrink-0">
        {!notice.read && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRead}
            aria-label={t('notices.markRead')}
            title={t('notices.markRead')}
          >
            <Check className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
