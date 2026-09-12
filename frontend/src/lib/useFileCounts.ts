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
  return useFiles(entity, enabled).counts
}

/**
 * The same request, when the covers are wanted too: the id of the first image
 * attached to each record, which is what a gallery card is a picture of.
 */
export function useFiles(entity: string, enabled = true) {
  const [state, setState] = useState<{
    counts: Record<number, number>
    covers: Record<number, number>
  }>({ counts: {}, covers: {} })

  useEffect(() => {
    if (!enabled) return
    let live = true
    api
      .attachmentCounts(entity)
      .then((data) => {
        if (!live) return
        const counts: Record<number, number> = {}
        for (const [id, n] of Object.entries(data.counts)) counts[Number(id)] = n
        const covers: Record<number, number> = {}
        for (const [id, n] of Object.entries(data.covers ?? {})) covers[Number(id)] = n
        setState({ counts, covers })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [entity, enabled])

  return state
}
