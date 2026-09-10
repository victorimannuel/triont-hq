import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A table on a phone is a table you have to drag sideways, and the column that
 * ends up off-screen is always the one with the button in it. So a page whose
 * columns really are worth comparing across rows keeps its table from `md` up
 * and hands the same rows to RowList below that.
 *
 * Most pages need neither half of this: RowList on its own reads the same at
 * every width, and that is the one to reach for first.
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
  /** Sits on the left, before the title: a mark, an avatar, an icon. */
  leading?: ReactNode
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

/*
One line per record, at every width. This is the house list.

It takes the same Row every page was already describing for the phone, so a
page adopting it deletes its table rather than growing a second description of
itself — which is what let the two drift apart in the first place. The small
print folds away below lg, where the name and the one thing on the right are
what a narrow screen has room to be honest about.
*/
export function RowList<T>({
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
    <div className="card-surface divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => {
        const row = render(item)
        return (
          <div
            key={keyOf(item)}
            onClick={onPick ? () => onPick(item) : undefined}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors',
              onPick && 'cursor-pointer hover:bg-accent active:bg-secondary/40',
            )}
          >
            {row.leading}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{row.title}</div>
              {row.subtitle && (
                <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div>
              )}
            </div>
            {row.meta && (
              <div className="hidden shrink-0 items-center gap-x-3 text-xs text-muted-foreground lg:flex">
                {row.meta}
              </div>
            )}
            {row.trailing && (
              <div className="flex shrink-0 items-center gap-2 text-right">{row.trailing}</div>
            )}
            {/* Its own line, because the things that go here are wide: a
                number to reveal, a row of buttons. */}
            {row.footer && (
              <div
                className="flex w-full gap-2 border-t pt-2"
                onClick={(event) => event.stopPropagation()}
              >
                {row.footer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
