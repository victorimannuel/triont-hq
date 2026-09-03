import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Timer as TimerIcon } from 'lucide-react'

import { useT } from '@/i18n'
import { clock, isIdle, isPaused, useRemaining, useTimer } from '@/lib/timer'
import { cn } from '@/lib/utils'

/**
 * What is left, wherever you happen to be. A countdown you have to be standing
 * on the timer page to see is a countdown you start and then forget, so the
 * shell carries it the way a phone carries it in the status bar.
 *
 * It renders nothing at all when no timer is set, which is most of the time.
 */
export function TimerPill({ className }: { className?: string }) {
  const { t } = useT()
  const state = useTimer()
  const left = useRemaining()
  const idle = isIdle(state)
  const paused = isPaused(state)

  // The tab title is the one place a countdown is visible with HQ in the
  // background, which is exactly when a timer is running.
  useEffect(() => {
    if (idle) {
      document.title = 'HQ'
      return
    }
    document.title = state.finished ? `⏰ ${t('timer.done')} · HQ` : `${clock(left)} · HQ`
    return () => {
      document.title = 'HQ'
    }
  }, [idle, left, state.finished, t])

  if (idle) return null

  return (
    <Link
      to="/timer"
      aria-label={t('timer.title')}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
        state.finished
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : paused
            ? 'text-muted-foreground hover:bg-accent'
            : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
        className,
      )}
    >
      {paused ? <Pause className="size-3.5" /> : <TimerIcon className="size-3.5" />}
      {state.finished ? t('timer.done') : clock(left)}
    </Link>
  )
}
