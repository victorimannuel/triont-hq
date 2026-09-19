/*
When a day rolls over, for anything you tick once a day.

Not midnight. A habit answered at half past one in the morning is answering for
the day that just ended, not for the one that is three hours old — so the day
is treated as starting at three. The clock is wound back that far before the
date is read off it, which slides the small hours onto the day before and
leaves every waking hour where it already was.

One place for the rule so the check-in, the board, and the home page all agree
on which day "today" is. The server keeps the same offset for the counts it
works out itself.
*/

// Three in the morning. Late enough to cover a normal night, early enough that
// nothing done after breakfast is ever mistaken for the day before.
export const DAY_START_HOUR = 3

// The date a moment belongs to, once the three hours are taken off. A real
// Date so callers can format it, step back from it, or read its parts.
export function hqDay(at: Date = new Date()): Date {
  const day = new Date(at)
  day.setHours(day.getHours() - DAY_START_HOUR)
  return day
}

// A date as YYYY-MM-DD in local terms, no shifting of its own: this is for a
// date that is already the one meant, such as a column the board has stepped to.
export function keyOf(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

// Today, by the three-o'clock rule. What a tick made now should be filed under.
export function todayKey(): string {
  return keyOf(hqDay())
}
