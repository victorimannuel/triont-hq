import { useEffect, useState } from 'react'

import { api } from '@/api'

/**
 * How many files each record on a list page carries, in one request for the
 * whole page rather than one per row. A failure is silent on purpose: the
 * paperclip is a hint, and a list that renders without it is still the list.
 *
 * `enabled` is for a page whose paperclips are switched off: a hook cannot be
 * called conditionally, but it can be told not to ask.
 */
export function useFileCounts(entity: string, enabled = true): Record<number, number> {
  const [counts, setCounts] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!enabled) return
    let live = true
    api
      .attachmentCounts(entity)
      .then((data) => {
        if (!live) return
        const next: Record<number, number> = {}
        for (const [id, n] of Object.entries(data.counts)) next[Number(id)] = n
        setCounts(next)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [entity, enabled])

  return counts
}
