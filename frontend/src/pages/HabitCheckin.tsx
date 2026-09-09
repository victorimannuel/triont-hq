import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, NotebookPen, PartyPopper, Repeat2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/api'
import { useT } from '@/i18n'
import type { Habit } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErrorNote, Loading, PageHeader } from '@/components/bits'

/**
 * The evening check-in, which is where the notification lands. One habit at a
 * time and two big buttons: from a lock screen at half past nine, the whole
 * thing has to be answerable without aiming at anything.
 *
 * It asks about every habit, not only the ones still open, so a tick made by
 * mistake earlier can be taken back in the same pass.
 */

// Today, as the phone reckons it. The server is asked in these terms too, so a
// check-in at half past midnight lands on the day the person thinks it is.
function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function HabitCheckin() {
  const { t } = useT()
  const [habits, setHabits] = useState<Habit[] | null>(null)
  const [error, setError] = useState('')
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)
  // The last question. Loaded with the habits so the whole run is offline
  // of the server once it starts.
  const [line, setLine] = useState<string | null>(null)
  const today = useMemo(todayKey, [])

  const load = useCallback(() => {
    api
      .habits(1)
      .then((data) => {
        setHabits(data.habits.filter((habit) => habit.active))
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('habit.failed')))
  }, [t])

  useEffect(() => {
    api
      .journalDay(todayKey())
      .then((entry) => setLine(entry.line))
      .catch(() => setLine(''))
  }, [])

  useEffect(load, [load])

  async function answer(habit: Habit, done: boolean) {
    if (busy) return
    setBusy(true)
    // Recorded in place so the next question comes up at once. The counts on
    // the board are re-read when it is opened; nothing here shows them.
    setHabits((list) =>
      (list ?? []).map((row) =>
        row.id === habit.id
          ? { ...row, days: done ? [today] : row.days.filter((d) => d !== today) }
          : row,
      ),
    )
    setAt((n) => n + 1)
    try {
      await api.setHabitDay(habit.id, today, done)
    } catch {
      toast.error(t('habit.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function saveLine() {
    setAt((n) => n + 1)
    try {
      await api.setJournalLine(today, line ?? '')
    } catch {
      toast.error(t('journal.failed'))
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (habits === null) return <Loading />

  if (habits.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title={t('checkin.title')} back="/habits" />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Repeat2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('habit.empty')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // The habits, then one more question. A journal you have to go and open is
  // one you stop writing, so it rides along at the end of a run you are
  // already doing.
  const steps = habits.length + 1

  if (at === habits.length) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader
          title={t('checkin.title')}
          description={t('checkin.progress', { n: steps, total: steps })}
          back="/habits"
        />
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(at / steps) * 100}%` }}
          />
        </div>

        <Card>
          <CardContent className="space-y-8 py-10">
            <div className="space-y-2 text-center">
              <NotebookPen className="mx-auto size-6 text-muted-foreground" />
              <h2 className="text-xl font-semibold tracking-tight">{t('checkin.journal')}</h2>
              <p className="text-sm text-muted-foreground">{t('checkin.journalHint')}</p>
            </div>

            <Input
              value={line ?? ''}
              autoFocus
              maxLength={500}
              placeholder={t('journal.placeholder')}
              onChange={(event) => setLine(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && saveLine()}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-14 flex-1"
                onClick={() => setAt((n) => n + 1)}
              >
                {t('checkin.skip')}
              </Button>
              <Button size="lg" className="h-14 flex-1" onClick={saveLine}>
                <Check className="size-5" />
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-3 flex justify-start">
          <Button variant="ghost" size="sm" onClick={() => setAt((n) => n - 1)}>
            <ArrowLeft className="size-4" />
            {t('checkin.back')}
          </Button>
        </div>
      </div>
    )
  }

  // Past the last question: what the evening came to, and the way out.
  if (at > habits.length) {
    const done = habits.filter((habit) => habit.days.includes(today))
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title={t('checkin.title')} back="/habits" />
        <Card>
          <CardContent className="space-y-5 py-10 text-center">
            <PartyPopper className="mx-auto size-8 text-primary" />
            <p className="text-lg font-medium">
              {t('checkin.done', { n: done.length, total: habits.length })}
            </p>

            <div className="mx-auto max-w-xs space-y-1 text-left">
              {habits.map((habit) => {
                const ticked = habit.days.includes(today)
                return (
                  <p key={habit.id} className="flex items-center gap-2 text-sm">
                    {ticked ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <X className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn('min-w-0 truncate', !ticked && 'text-muted-foreground')}>
                      {habit.name}
                    </span>
                  </p>
                )
              })}
            </div>

            {line && line.trim() !== '' && (
              <p className="mx-auto max-w-xs border-t pt-4 text-sm italic text-muted-foreground">
                “{line}”
              </p>
            )}

            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setAt(0)}>
                <ArrowLeft className="size-4" />
                {t('checkin.again')}
              </Button>
              <Button asChild>
                <Link to="/habits">{t('checkin.toBoard')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const habit = habits[at]
  const ticked = habit.days.includes(today)

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={t('checkin.title')}
        description={t('checkin.progress', { n: at + 1, total: steps })}
        back="/habits"
      />

      {/* A bar rather than a number, because the point of it is to say "nearly
          there" at a glance and not to be read. */}
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(at / steps) * 100}%` }}
        />
      </div>

      <Card>
        <CardContent className="space-y-8 py-10">
          {/* The picture, above the question. This is what it is for: six
              questions at half past nine go faster when each one looks like
              something rather than reading like something. Cropped to a band,
              because a portrait photo shown whole would push the buttons off
              a phone screen. */}
          {habit.image_id !== null && (
            <img
              src={api.downloadUrl(habit.image_id)}
              alt=""
              className="mx-auto h-40 w-full max-w-sm rounded-lg object-cover"
            />
          )}

          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('checkin.question')}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">{habit.name}</h2>
            {habit.notes && <p className="text-sm text-muted-foreground">{habit.notes}</p>}
            {/* Only when it is already answered, so the pass can be a
                correction rather than a fresh set of questions. */}
            {ticked && (
              <p className="text-xs text-primary">{t('checkin.alreadyTicked')}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-16 flex-1 text-base"
              disabled={busy}
              onClick={() => answer(habit, false)}
            >
              <X className="size-5" />
              {t('checkin.no')}
            </Button>
            <Button
              size="lg"
              className="h-16 flex-1 text-base"
              disabled={busy}
              onClick={() => answer(habit, true)}
            >
              <Check className="size-5" />
              {t('checkin.yes')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {at > 0 && (
        <div className="mt-3 flex justify-start">
          <Button variant="ghost" size="sm" onClick={() => setAt((n) => n - 1)}>
            <ArrowLeft className="size-4" />
            {t('checkin.back')}
          </Button>
        </div>
      )}
    </div>
  )
}
