import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { PushDevice } from '@/types'
import { disablePush, enablePush, pushEnabled, pushPermission } from '@/lib/push'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, formatDate, SectionTitle, Spinner } from '@/components/bits'

/**
 * Notifications come straight from this server to the browser's own push
 * service — no third party in between, and nothing to sign up for. This
 * section switches them on for the device it is opened on, and lists every
 * device that will be notified.
 */
export function PushSection() {
  const { t } = useT()
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [on, setOn] = useState(false)
  const [permission, setPermission] = useState(pushPermission())
  const [busy, setBusy] = useState<'' | 'toggle' | 'test'>('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .pushDevices()
      .then((data) => setDevices(data.subscriptions))
      .catch(() => undefined)
    pushEnabled().then(setOn)
    setPermission(pushPermission())
  }, [])

  useEffect(load, [load])

  async function toggle() {
    setBusy('toggle')
    setError('')
    try {
      if (on) {
        await disablePush()
        toast.success(t('push.disabled'))
      } else {
        await enablePush()
        toast.success(t('push.enabled'))
      }
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('push.failed'))
    } finally {
      setBusy('')
      setPermission(pushPermission())
    }
  }

  async function test() {
    setBusy('test')
    try {
      const { sent } = await api.pushTest()
      toast.success(t('push.tested', { n: sent }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('push.failed'))
    } finally {
      setBusy('')
    }
  }

  async function remove(device: PushDevice) {
    try {
      await api.pushUnsubscribe(device.id)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('push.failed'))
    }
  }

  const unsupported = permission === 'unsupported'
  const blocked = permission === 'denied'

  return (
    <>
      <SectionTitle>{t('push.title')}</SectionTitle>

      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            {on ? (
              <Bell className="mt-0.5 size-5 text-success" />
            ) : (
              <BellOff className="mt-0.5 size-5 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {on ? t('push.on') : t('push.off')}
            </p>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
          {unsupported && <ErrorNote>{t('push.unsupported')}</ErrorNote>}
          {blocked && !on && <ErrorNote>{t('push.blocked')}</ErrorNote>}

          <div className="flex flex-wrap gap-3">
            <Button onClick={toggle} disabled={!!busy || unsupported || (blocked && !on)}>
              {busy === 'toggle' ? (
                <Spinner />
              ) : on ? (
                <BellOff className="size-4" />
              ) : (
                <Bell className="size-4" />
              )}
              {on ? t('push.disable') : t('push.enable')}
            </Button>

            {devices.length > 0 && (
              <Button variant="outline" onClick={test} disabled={!!busy}>
                {busy === 'test' ? <Spinner /> : <Send className="size-4" />}
                {t('push.test')}
              </Button>
            )}
          </div>

          {devices.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">{t('push.devices')}</p>
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 rounded-md border p-2.5"
                >
                  <Bell className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{device.device || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {device.last_sent_at
                        ? t('push.lastSent', { date: formatDate(device.last_sent_at) })
                        : t('push.never')}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(device)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

