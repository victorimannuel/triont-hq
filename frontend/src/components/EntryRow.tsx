import { Link } from 'react-router-dom'
import {
  Banknote,
  Cake,
  Check,
  FileText,
  Globe,
  Home,
  ListTodo,
  PartyPopper,
  Receipt,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

import { useT } from '@/i18n'
import type { CalendarEntry } from '@/types'
import { Badge } from '@/components/ui/badge'
import { daysUntil, formatCount, formatDate } from '@/components/bits'
import { cn } from '@/lib/utils'

/**
 * One dated thing, whichever module it came from. The home page and the
 * calendar both show the same rows: a birthday and a domain renewal are the
 * same kind of fact — something falls due on a day — and only the icon
 * differs.
 */
export const KIND_ICON = {
  todo: ListTodo,
  renewal: Globe,
  document: FileText,
  warranty: ShieldCheck,
  maintenance: Wrench,
  birthday: Cake,
  milestone: PartyPopper,
  rent: Home,
  income: Banknote,
  expense: Receipt,
} as const

export type Kind = keyof typeof KIND_ICON

// One colour per kind, so a month reads at a glance without opening anything.
const KIND_TONE: Record<Kind, string> = {
  todo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  renewal: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  document: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  warranty: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  maintenance: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  birthday: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  milestone: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  rent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  income: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  expense: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export const tone = (kind: string) => KIND_TONE[kind as Kind] ?? KIND_TONE.renewal

/*
Kinds that are dealt with rather than fixed.

Everything else on this list clears itself: a renewal goes when its date moves,
a to-do when it is ticked on its own page. A birthday has nothing to change —
the day happens either way — so it stays until you say what you did about it.
*/
export const MARKABLE = new Set(['birthday', 'milestone'])

export function EntryRow({
  entry,
  onPick,
  onActions,
}: {
  entry: CalendarEntry
  onPick?: () => void
  /** Opens the box that closes this date off. Present on the home page, where
   *  the list is worked through rather than read. */
  onActions?: () => void
}) {
  const { t } = useT()
  const Icon = KIND_ICON[entry.kind as Kind] ?? Globe
  const days = daysUntil(entry.date)
  const late = days !== null && days < 0
  const soon = days !== null && days >= 0 && days <= 14
  /*
  Whether the whole row is the button.

  On the home page this list is a list of jobs, so a row should do the job when
  you tap it. For most kinds the job is to go and change something — a renewal
  date, a document — and the link already goes there. For the ones that are
  closed off by hand there is nowhere useful to go, so the row opens the box
  that closes it instead, and the link to the record moves inside that box.

  On the calendar no row does this: nothing is passed, and every row stays a
  link, because the calendar is read rather than worked through.
  */
  const acts = Boolean(onActions) && MARKABLE.has(entry.kind)

  // The stripe repeats what the date column already says, but it says it down
  // the left edge where a list is scanned rather than read.
  const shell = cn(
    'flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-accent',
    late ? 'border-l-destructive' : soon ? 'border-l-warning' : 'border-l-transparent',
  )

  const body = (
    <>
      <span className={cn('grid size-6 shrink-0 place-items-center rounded', tone(entry.kind))}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{entry.label}</div>
        {/* A milestone is the one kind whose second line is a number rather
            than a phrase, and the number is the whole point of it. */}
        <div className="truncate text-xs text-muted-foreground">
          {entry.count ? t('cal.milestone', { n: formatCount(entry.count) }) : entry.detail}
        </div>
        {/* What was done about it, a year later. A date closed off without a
            word still reads as closed off, so the tick carries that on its
            own and this line only appears when there is something to say. */}
        {entry.done && (
          <div className="mt-0.5 flex items-start gap-1.5 text-xs text-success">
            <Check className="mt-0.5 size-3 shrink-0" />
            <span className="truncate">{entry.note || t('cal.marked')}</span>
          </div>
        )}
      </div>
      {/* The icon already carries the kind and its colour; on a phone the badge
          only steals width from the name. */}
      <Badge
        variant="outline"
        className={cn(
          'hidden shrink-0 border-transparent text-[11px] sm:inline-flex',
          tone(entry.kind),
        )}
      >
        {t(`cal.kind.${entry.kind}`)}
      </Badge>
      <div className="shrink-0 text-right text-xs sm:w-28">
        <div>{formatDate(entry.date)}</div>
        {days !== null && (
          <div
            className={cn(
              late ? 'text-destructive' : soon ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {late
              ? // A milestone that has gone by is not overdue, it just passed.
                t(entry.count ? 'cal.ago' : 'cal.late', { n: Math.abs(days) })
              : days === 0
                ? t('cal.today')
                : t('cal.inDays', { n: days })}
          </div>
        )}
      </div>
    </>
  )

  return acts ? (
    <button type="button" onClick={onActions} className={shell}>
      {body}
    </button>
  ) : (
    <Link to={entry.url} onClick={onPick} className={shell}>
      {body}
    </Link>
  )
}
