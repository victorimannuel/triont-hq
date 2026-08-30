import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A table on a phone is a table you have to drag sideways, and the column that
 * ends up off-screen is always the one with the button in it. Every list page
 * keeps its table from `md` up and hands the same rows to CardList below that.
 */
export function Responsive({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </>
  )
}

export type Row = {
  /** What the row is. One line, truncated. */
  title: ReactNode
  /** The thing that tells two similar rows apart. */
  subtitle?: ReactNode
  /** Small print: dates, counts, whatever the table put in later columns. */
  meta?: ReactNode
  /** Sits on the right: a badge, an amount, an action. */
  trailing?: ReactNode
  /** Full-width strip under everything else, for actions. */
  footer?: ReactNode
}

export function CardList<T>({
  items,
  render,
  onPick,
  keyOf,
  empty,
}: {
  items: T[]
  render: (item: T) => Row
  onPick?: (item: T) => void
  keyOf: (item: T) => string | number
  empty?: ReactNode
}) {
  if (items.length === 0) {
    return empty ? (
      <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    ) : null
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const row = render(item)
        return (
          <div
            key={keyOf(item)}
            onClick={onPick ? () => onPick(item) : undefined}
            className={cn(
              'rounded-lg border bg-card p-3',
              onPick && 'cursor-pointer active:bg-secondary/40',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="truncate font-medium">{row.title}</div>
                {row.subtitle && (
                  <div className="truncate text-sm text-muted-foreground">{row.subtitle}</div>
                )}
                {row.meta && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                    {row.meta}
                  </div>
                )}
              </div>
              {row.trailing && (
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  {row.trailing}
                </div>
              )}
            </div>
            {row.footer && <div className="mt-3 flex gap-2 border-t pt-3">{row.footer}</div>}
          </div>
        )
      })}
    </div>
  )
}
