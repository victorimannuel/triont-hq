import { useEffect, useState } from 'react'

import { api } from '@/api'

/**
 * How many notifications are still waiting. The badge lives in the sidebar and
 * the list lives on a page, and the two have to agree the moment something is
 * marked read — so there is one number, shared, rather than two that fetch
 * separately and drift apart.
 */
let unread = 0
const watchers = new Set<(n: number) => void>()

export function setUnread(n: number) {
  unread = n
  watchers.forEach((watcher) => watcher(n))
}

export async function refreshUnread() {
  try {
    const { unread } = await api.noticesUnread()
    setUnread(unread)
  } catch {
    // A count that cannot be fetched is better left as it was. Resetting to
    // zero would quietly claim there is nothing waiting.
  }
}

export function useUnread() {
  const [n, setN] = useState(unread)
  useEffect(() => {
    watchers.add(setN)
    setN(unread)
    return () => {
      watchers.delete(setN)
    }
  }, [])
  return n
}
