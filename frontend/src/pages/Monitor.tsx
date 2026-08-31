import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
} from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Check, MonitorSource } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, Loading, PageHeader, SectionTitle } from '@/components/bits'

/**
 * Things watched by something outside HQ. The checkers report in; HQ never
 * goes looking, because a checker holds credentials this app has no business
 * holding. That makes this page a reader of what arrived, and a monitor that
 * has stopped arriving is itself the loudest thing on it.
 */
const TONE: Record<string, string> = {
  ok: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  down: 'bg-destructive/15 text-destructive',
}

const ICON: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  down: CircleSlash,
}

/** "3 hari", "4 jam", "baru aja" — how long this has been the case. */
function since(iso: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 2) return t('monitor.justNow')
  if (mins < 60) return t('monitor.forMinutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 48) return t('monitor.forHours', { n: hours })
  return t('monitor.forDays', { n: Math.floor(hours / 24) })
}

export default function Monitor() {
  const { t } = useT()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [monitors, setMonitors] = useState<MonitorSource[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .monitor()
      .then((data) => {
        setChecks(data.checks)
        setMonitors(data.monitors)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  // A page about what is happening now should not be a page about what was
  // happening when it was opened.
  useEffect(() => {
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [load])

  if (!checks) return <Loading />

  const trouble = checks.filter((c) => c.status !== 'ok')
  const fine = checks.filter((c) => c.status === 'ok')

  const row = (check: Check) => {
    const Icon = ICON[check.status] ?? CheckCircle2
    return (
      <div key={check.id} className="flex items-start gap-3 px-4 py-3">
        <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded', TONE[check.status])}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{check.name}</span>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {check.source}
            </Badge>
          </div>
          {check.detail && (
            <p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {check.status === 'ok'
              ? t('monitor.okFor', { for: since(check.since_at, t) })
              : t('monitor.brokenFor', { for: since(check.since_at, t) })}
          </p>
        </div>
        {check.url && (
          <a
            href={check.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={check.url}
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={t('monitor.title')}
        description={
          checks.length === 0
            ? t('monitor.empty')
            : trouble.length > 0
              ? t('monitor.troubleCount', { n: trouble.length })
              : t('monitor.allFine')
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* A checker that has gone quiet is the failure nothing else would
          notice, so it outranks whatever it last managed to report. */}
      {monitors.filter((m) => m.stale).length > 0 && (
        <Card className="mb-6 border-warning/40 bg-warning/10">
          <CardContent className="space-y-1">
            {monitors
              .filter((m) => m.stale)
              .map((m) => (
                <p key={m.source} className="text-sm">
                  <span className="font-medium">{m.source}</span>{' '}
                  {t('monitor.silent', { for: since(m.last_seen_at, t) })}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      {trouble.length > 0 && (
        <>
          <SectionTitle>{t('monitor.trouble')}</SectionTitle>
          <Card className="mb-6 divide-y py-0">{trouble.map(row)}</Card>
        </>
      )}

      {fine.length > 0 && (
        <>
          <SectionTitle>{t('monitor.fine')}</SectionTitle>
          <Card className="mb-6 divide-y py-0">{fine.map(row)}</Card>
        </>
      )}

      {monitors.length > 0 && (
        <>
          <SectionTitle hint={t('monitor.sourcesHint')}>{t('monitor.sources')}</SectionTitle>
          <Card>
            <CardContent className="space-y-2">
              {monitors.map((m) => (
                <div key={m.source} className="flex items-center gap-3 text-sm">
                  <Activity
                    className={cn('size-4', m.stale ? 'text-warning' : 'text-success')}
                  />
                  <span className="font-medium">{m.source}</span>
                  <span className="text-muted-foreground">
                    {t('monitor.reported', { for: since(m.last_seen_at, t) })}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t('monitor.checksCount', { n: m.total })}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {checks.length === 0 && monitors.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          {t('monitor.nothing')}
        </Card>
      )}
    </>
  )
}
