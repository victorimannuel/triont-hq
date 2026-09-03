import { useState } from 'react'
import { Bell, Pause, Play, RotateCcw, Timer as TimerIcon } from 'lucide-react'

import { useT } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, PageHeader, SectionTitle } from '@/components/bits'
import { askToNotify, canNotify, primeAlarm } from '@/lib/alarm'
import {
  clock,
  isIdle,
  isPaused,
  pause,
  remaining,
  reset,
  resume,
  startFocus,
  startPlain,
  useRemaining,
  useTimer,
} from '@/lib/timer'
import { cn } from '@/lib/utils'

// The lengths worth one tap. Anything else is three number boxes away, and a
// longer list of chips is slower to read than typing the number.
const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60]

export default function Timer() {
  const { t } = useT()
  const state = useTimer()
  const left = useRemaining()

  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [label, setLabel] = useState('')

  const idle = isIdle(state)
  const paused = isPaused(state)
  const custom =
    (Number(hours) || 0) * 3_600_000 + (Number(minutes) || 0) * 60_000 + (Number(seconds) || 0) * 1000

  // Nothing has been picked yet, so the face shows the number being typed
  // rather than a zero that ignores it.
  const shown = idle ? custom : left
  const done = state.finished
  const progress = state.duration > 0 ? 1 - remaining(state) / state.duration : 0

  function begin(ms: number, name: string) {
    if (ms <= 0) return
    primeAlarm()
    askToNotify()
    startPlain(ms, name.trim())
  }

  function beginFocus() {
    primeAlarm()
    askToNotify()
    startFocus()
  }

  function clear() {
    reset()
    setHours('')
    setMinutes('')
    setSeconds('')
    setLabel('')
  }

  const heading = done
    ? state.label
      ? t('timer.doneNamed', { label: state.label })
      : t('timer.done')
    : state.mode === 'work'
      ? `${t('timer.work')} · ${t('timer.round', { n: state.round })}`
      : state.mode === 'break'
        ? `${t('timer.break')} · ${t('timer.round', { n: state.round })}`
        : state.label

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('timer.title')} description={t('timer.subtitle')} />

      <Card>
        <CardContent className="flex flex-col items-center gap-5 py-2">
          {heading && (
            <div
              className={cn(
                'text-sm font-medium lowercase',
                done ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {heading}
            </div>
          )}

          <div
            className={cn(
              'font-semibold tabular-nums tracking-tight',
              'text-[clamp(3rem,18vw,5.5rem)] leading-none',
              done && 'text-destructive',
              paused && 'text-muted-foreground',
            )}
          >
            {clock(shown)}
          </div>

          {/* Only meaningful once a length has been fixed, so it stays out of
              the way while a duration is still being typed. */}
          {!idle && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  done ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {idle && (
              <Button size="lg" disabled={custom <= 0} onClick={() => begin(custom, label)}>
                <Play className="size-4" />
                {t('timer.start')}
              </Button>
            )}
            {!idle && !done && (
              <Button size="lg" onClick={paused ? resume : pause}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {paused ? t('timer.resume') : t('timer.pause')}
              </Button>
            )}
            {!idle && (
              <Button size="lg" variant="ghost" onClick={clear}>
                <RotateCcw className="size-4" />
                {t('timer.reset')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {idle && (
        <>
          <SectionTitle>{t('timer.presets')}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((mins) => (
              <Button
                key={mins}
                variant="outline"
                size="sm"
                className="tabular-nums"
                onClick={() => begin(mins * 60_000, label)}
              >
                {mins} {t('timer.minutes')}
              </Button>
            ))}
          </div>

          <SectionTitle>{t('timer.custom')}</SectionTitle>
          <Card>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Field label={t('timer.hours')} htmlFor="h">
                  <Input
                    id="h"
                    type="number"
                    min={0}
                    max={99}
                    inputMode="numeric"
                    className="tabular-nums"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </Field>
                <Field label={t('timer.minutes')} htmlFor="m">
                  <Input
                    id="m"
                    type="number"
                    min={0}
                    max={59}
                    inputMode="numeric"
                    className="tabular-nums"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </Field>
                <Field label={t('timer.seconds')} htmlFor="s">
                  <Input
                    id="s"
                    type="number"
                    min={0}
                    max={59}
                    inputMode="numeric"
                    className="tabular-nums"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                  />
                </Field>
              </div>

              <Field label={t('timer.label')} htmlFor="label" hint={t('timer.labelHint')}>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <SectionTitle hint={t('timer.focusHint')}>{t('timer.focus')}</SectionTitle>
          <Button variant="outline" onClick={beginFocus}>
            <TimerIcon className="size-4" />
            {t('timer.startFocus')}
          </Button>
        </>
      )}

      <p className="mt-8 text-xs text-muted-foreground">{t('timer.tabHint')}</p>
      {canNotify() && Notification.permission !== 'granted' && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {t('timer.notifyOff')}
          {Notification.permission === 'default' && (
            <Button variant="outline" size="sm" onClick={askToNotify}>
              <Bell className="size-3.5" />
              {t('timer.allowNotify')}
            </Button>
          )}
        </p>
      )}
    </div>
  )
}
