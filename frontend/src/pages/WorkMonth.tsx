import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Timer } from 'lucide-react'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { DayWork, ProjectWork } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'
import { ByProject, spell } from '@/pages/Work'

/**
 * The month, added up.
 *
 * A separate page from the daily log because it answers a different question.
 * The log is for tracking — what am I on, what did I do this afternoon. This is
 * for reporting — how much went to NPD in September, which is asked once a
 * month with a deadline behind it.
 *
 * A calendar month, not a trailing thirty days. What gets reported, invoiced or
 * argued about is September; the two disagree by however far into October it
 * happens to be.
 */

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/*
Every day of the month as a bar.

Thirty of them, which is narrow but readable as a shape: what it is there to
show is the rhythm — which weeks were heavy, where the gaps fell — rather than
any individual day's number, and those are legible at this width.
*/
function MonthStrip({ days }: { days: DayWork[] }) {
  const { t } = useT()
  const top = Math.max(1, ...days.map((day) => day.seconds))

  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 px-4 py-4">
        <p className="text-sm font-medium lowercase">{t('work.perDayChart')}</p>
        <div className="flex items-end gap-px">
          {days.map((day) => (
            <div key={day.on} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  'w-full rounded-sm',
                  // Weekends sit back, so a quiet Saturday reads as a Saturday
                  // rather than as a day the log was missed.
                  isWeekend(day.on) ? 'bg-primary/30' : 'bg-primary/70',
                )}
                style={{ height: `${Math.max(2, (day.seconds / top) * 72)}px` }}
                title={`${day.on} · ${spell(day.seconds)}`}
              />
              {/* Only every fifth date, or thirty numbers become a smudge. */}
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {dateOf(day.on) % 5 === 0 ? dateOf(day.on) : ''}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const dateOf = (on: string) => Number(on.slice(8, 10))

function isWeekend(on: string) {
  const day = new Date(`${on}T00:00:00`).getDay()
  return day === 0 || day === 6
}

export default function WorkMonth() {
  const { t } = useT()

  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [days, setDays] = useState<DayWork[] | null>(null)
  const [projects, setProjects] = useState<ProjectWork[]>([])
  const [seconds, setSeconds] = useState(0)
  const [worked, setWorked] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .timeSummary(month)
      .then((data) => {
        setDays(data.days)
        setProjects(data.projects)
        setSeconds(data.seconds)
        setWorked(data.worked)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('work.failed')))
  }, [month, t])

  useEffect(load, [load])

  const thisMonth = useMemo(() => monthKey(new Date()), [])

  function shift(by: number) {
    const at = new Date(`${month}-01T00:00:00`)
    at.setMonth(at.getMonth() + by)
    setMonth(monthKey(at))
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (days === null) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back="/waktu" title={t('work.month')} />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="-1">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="font-medium lowercase">
            {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{spell(seconds)}</p>
          {worked > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {t('work.overDays', { d: worked, n: spell(seconds / worked) })}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => shift(1)}
          disabled={month >= thisMonth}
          aria-label="+1"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {seconds === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Timer className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('work.emptyMonth')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ByProject projects={projects} />
          <MonthStrip days={days} />
        </>
      )}
    </div>
  )
}
