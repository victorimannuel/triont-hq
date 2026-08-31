import { Link } from 'react-router-dom'
import {
  Banknote,
  Cake,
  FileText,
  Globe,
  Home,
  Receipt,
  ShieldCheck,
  Wrench,
} from 'lucide-react'

import { useT } from '@/i18n'
import type { CalendarEntry } from '@/types'
import { Badge } from '@/components/ui/badge'
import { daysUntil, formatDate } from '@/components/bits'
import { cn } from '@/lib/utils'

/**
 * One dated thing, whichever module it came from. The home page and the
 * calendar both show the same rows: a birthday and a domain renewal are the
 * same kind of fact — something falls due on a day — and only the icon
 * differs.
 */
export const KIND_ICON = {
  renewal: Globe,
  document: FileText,
  warranty: ShieldCheck,
  maintenance: Wrench,
  birthday: Cake,
  rent: Home,
  income: Banknote,
  expense: Receipt,
} as const

export type Kind = keyof typeof KIND_ICON

// One colour per kind, so a month reads at a glance without opening anything.
const KIND_TONE: Record<Kind, string> = {
  renewal: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  document: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  warranty: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  maintenance: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  birthday: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  rent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  income: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  expense: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export const tone = (kind: string) => KIND_TONE[kind as Kind] ?? KIND_TONE.renewal

export function EntryRow({ entry, onPick }: { entry: CalendarEntry; onPick?: () => void }) {
  const { t } = useT()
  const Icon = KIND_ICON[entry.kind as Kind] ?? Globe
  const days = daysUntil(entry.date)
  const late = days !== null && days < 0
  const soon = days !== null && days >= 0 && days <= 14

  return (
    <Link
      to={entry.url}
      onClick={onPick}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
    >
      <span className={cn('grid size-6 shrink-0 place-items-center rounded', tone(entry.kind))}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{entry.label}</div>
        <div className="truncate text-xs text-muted-foreground">{entry.detail}</div>
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
              ? t('cal.late', { n: Math.abs(days) })
              : days === 0
                ? t('cal.today')
                : t('cal.inDays', { n: days })}
          </div>
        )}
      </div>
    </Link>
  )
}
