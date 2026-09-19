import { useEffect, useState } from 'react'

import { api } from '@/api'
import type { TimeEntry } from '@/types'
import { syncWorkOutside } from '@/lib/workOutside'

/**
 * Which clocks are ticking. The pill floats over every page and the log lives
 * on one, and the two have to agree the moment something is started or
 * stopped — so there is one list, shared, rather than two that fetch
 * separately and drift apart.
 *
 * The same shape as the unread count next door, for the same reason.
 */
let running: TimeEntry[] = []
const watchers = new Set<(entries: TimeEntry[]) => void>()

export function setRunning(entries: TimeEntry[]) {
  running = entries
  watchers.forEach((watcher) => watcher(entries))
  // The shade and the app icon are two more watchers, just not React ones.
  // Hanging them here means every path that learns what is running — starting,
  // stopping, carrying on, changing page — keeps them right without having to
  // remember to.
  void syncWorkOutside(entries)
}

export async function refreshRunning() {
  try {
    const { running } = await api.timeRunning()
    setRunning(running)
  } catch {
    // A list that cannot be fetched is better left as it was. Emptying it
    // would quietly claim nothing is running, which is the one thing the pill
    // exists to deny.
  }
}

export function useRunning() {
  const [entries, setEntries] = useState(running)
  useEffect(() => {
    watchers.add(setEntries)
    setEntries(running)
    return () => {
      watchers.delete(setEntries)
    }
  }, [])
  return entries
}
