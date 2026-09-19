import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Clock } from 'lucide-react'

import { useT } from '@/i18n'
import { useRunning } from '@/lib/running'
import { cn } from '@/lib/utils'

/**
 * A clock that is running, wherever you happen to be.
 *
 * The thing a work log actually fails at is not recording — it is the two hours
 * you left the clock on over lunch, or the afternoon you forgot to start it.
 * The first of those is fixed by never letting it out of sight, which is what
 * this is: it floats above every page for as long as something is ticking, and
 * renders nothing at all the rest of the time.
 *
 * On a phone it tucks itself into the right edge as a stub just under the
 * header, because a phone is mostly screen and a badge parked across it is in
 * the way of the thing you actually opened. One tap unrolls it, a second goes
 * to the log, the arrow on its leading edge puts it away again, and it rolls
 * itself back up on its own if none of those happen. A desktop has room, so there it simply stays
 * open — and that half is done in CSS rather than by measuring the window, so
 * it cannot come out wrong while the page is still being laid out.
 *
 * It does not carry a stop button. Several clocks can run at once, and a single
 * button floating over the app would have to guess which one is meant; one tap
 * lands on the page where they all are and each has its own.
 */

// Wide enough to have somewhere to put it: the breakpoint the tab bar and the
// sidebar already swap over at. Read at click time, never at render time.
const WIDE = '(min-width: 768px)'

// How long an unrolled pill waits before tucking itself away again. Long
// enough to read the number twice, short enough not to become furniture.
const ROLL_UP_AFTER = 6000

export function WorkPill() {
  const { t } = useT()
  const entries = useRunning()
  const { pathname } = useLocation()

  // Only ever true because a thumb asked. On a wide screen the stylesheet
  // shows everything regardless, so this stays false there and costs nothing.
  const [open, setOpen] = useState(false)

  // Counts up on its own. A clock that only moves when something else happens
  // does not read as running.
  const [, setTicks] = useState(0)
  useEffect(() => {
    if (entries.length === 0) return
    const id = window.setInterval(() => setTicks((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [entries.length])

  // Rolls itself back up, so a tap to check the time does not leave something
  // sitting over the page for the rest of the afternoon.
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => setOpen(false), ROLL_UP_AFTER)
    return () => window.clearTimeout(id)
  }, [open])

  // Nothing to float over the page that already says all of this, in full.
  if (entries.length === 0 || pathname.startsWith('/waktu')) return null

  // More than one clock running: it cannot roll up into a single line the way one
  // clock does, so on a phone it tucks to a stub carrying the count and unrolls
  // into the full list on a tap — the same open-state and auto-roll-up as the
  // single pill. A desktop has room and shows the list outright.
  if (entries.length > 1) {
    return (
      <>
        {/* Tucked away: a phone stub with the running count. Gone on a desktop,
            and gone the moment the list is opened. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('work.title')}
          className={cn(
            'fixed right-0 top-16 z-40 flex items-center gap-2 rounded-l-full border border-r-0',
            'border-primary/40 bg-primary/10 py-2.5 pl-3 pr-2.5 text-primary shadow-lg backdrop-blur',
            'md:hidden',
            open && 'hidden',
          )}
        >
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <Clock className="size-4 shrink-0" />
          <span className="text-sm font-semibold tabular-nums">{entries.length}</span>
        </button>

        {/* The list: open on a phone, always on a desktop. */}
        <div
          className={cn(
            'fixed right-4 top-16 z-40 w-60 max-w-[calc(100vw-2rem)] md:bottom-4 md:top-auto',
            'rounded-2xl border border-primary/40 bg-primary/10 text-primary shadow-lg backdrop-blur',
            !open && 'hidden md:block',
          )}
        >
          {/* Put it away now rather than in six seconds. A phone only: a desktop
              has no tucked state to go back to. */}
          <div className="flex justify-end px-1.5 pt-1.5 md:hidden">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.hide')}
              className="grid size-6 place-items-center rounded-full transition-colors hover:bg-primary/20"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Link
            to="/waktu"
            aria-label={t('work.title')}
            className="flex flex-col gap-2 p-2.5 pt-0 transition-opacity hover:opacity-80 md:pt-2.5"
          >
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {entry.project
                    ? entry.part
                      ? `${entry.project} · ${entry.part}`
                      : entry.project
                    : t('work.noProject')}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {clock(entry.started_at)}
                </span>
              </div>
            ))}
          </Link>
        </div>
      </>
    )
  }

  // Exactly one clock: the single-line pill that can tuck itself away.
  const [first] = entries

  return (
    /*
    A box around the two, rather than one link, because the tuck-away button is
    a button and a button inside a link is not a thing a browser will agree to.

    It unrolls rather than appearing. Everything inside stays mounted at its
    full width the whole time and the box clips it, so what animates is one
    max-width — a length, which a browser can interpolate. Hiding the contents
    instead would collapse the width instantly and leave the padding and the
    corners sliding after it, which is the jerk this replaces.
    */
    <div
      className={cn(
        'fixed z-40 flex items-center overflow-hidden border border-primary/40',
        'bg-primary/10 text-primary shadow-lg backdrop-blur',
        'transition-all duration-300 ease-out',
        /*
        Under the header on a phone, in the bottom corner on a desktop.

        Top is where a phone is looked at — the thumb is at the bottom but the
        eye is not, and this is there to be noticed rather than pressed. The
        header is h-14 and sticky, so half a rem under it clears it at every
        scroll position. A desktop has no header to sit under and does have
        buttons in that corner of every page, so there it stays out of the way
        at the bottom.
        */
        'top-16 md:bottom-4 md:top-auto',
        /*
        Rolled up, the box is exactly wide enough for the dot and the clock —
        3.5rem is that sum with the padding — and everything past it is
        clipped. Unrolled, the cap is comfortably more than the contents need,
        so the width stops growing when the contents run out rather than when
        the number does.
        */
        open
          ? 'right-4 max-w-[17rem] rounded-full py-1.5 pl-1.5 pr-3.5'
          : 'right-0 max-w-[3.5rem] rounded-l-full border-r-0 py-2.5 pl-3 pr-2.5',
        // A wide screen is never tucked away, whatever the state above says.
        'md:right-4 md:max-w-none md:rounded-full md:border-r md:py-2 md:pl-3 md:pr-3.5',
      )}
    >
      {/*
      Put it away now rather than in six seconds. Only ever on a phone: a wide
      screen has no tucked state to go back to, so a button offering one there
      would do nothing.

      At the leading edge, pointing the way the pill goes. Two reasons it is
      not on the trailing one: against the right edge of a phone is where the
      system's own back gesture lives, and this has to be far enough from the
      body of the pill that a thumb aiming to close it does not open the log
      instead.

      It narrows to nothing rather than unmounting, for the same reason the box
      clips instead of hiding — a button appearing at the leading edge would
      shove everything behind it sideways in a single frame.
      */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t('common.hide')}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className={cn(
          'grid shrink-0 place-items-center overflow-hidden rounded-full',
          'transition-all duration-300 ease-out hover:bg-primary/20 md:hidden',
          // Height as well as width, or the rolled-up stub would still be as
          // tall as a button nobody can see.
          open ? 'mr-1 size-7 opacity-100' : 'pointer-events-none size-0 opacity-0',
        )}
      >
        <ChevronRight className="size-4 shrink-0" />
      </button>

      <Link
        to="/waktu"
        aria-label={t('work.title')}
        onClick={(event) => {
          // Rolled up, the first tap only unrolls it. Going straight to the log
          // from a stub this small would be a trap: it is the width of a thumb
          // and sits against the edge, which is exactly where a thumb lands by
          // accident while scrolling.
          if (!open && !window.matchMedia(WIDE).matches) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        // One gap in both states. A spacing that changes as well would be a
        // second thing sliding, and the contents are meant to sit still while
        // the box moves past them.
        className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
      >
        <span className="relative flex size-2 shrink-0">
          {/* A dot that breathes, so it reads as live from the corner of an
              eye. Rolled up this is most of what there is to see. */}
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>

        <Clock className="size-4 shrink-0" />

        {/* Kept at its own width whatever the box is doing, so the box slides
            over it rather than squeezing it. Long names are cut by the cap on
            the box, which is what the ellipsis is for. */}
        <span className="max-w-32 truncate text-xs font-medium">
          {first.project
            ? first.part
              ? `${first.project} · ${first.part}`
              : first.project
            : t('work.noProject')}
        </span>

        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {clock(first.started_at)}
        </span>
      </Link>
    </div>
  )
}

/** How long it has been going, as a clock. */
function clock(startedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}
