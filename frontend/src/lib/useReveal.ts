import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/** How long a revealed secret stays on screen before hiding itself again. */
export const HIDE_AFTER_MS = 30_000

/**
 * Reveals one encrypted value at a time and puts it away again on its own.
 * Credentials and document numbers both do this, and both would otherwise
 * leave a secret sitting on a screen somebody walked away from.
 *
 * `fetcher` asks the server for the plaintext — it is only ever fetched on
 * demand, never sent with the list.
 */
export function useReveal(fetcher: (id: number) => Promise<string>, failMessage: string) {
  const [shown, setShown] = useState<Record<number, string>>({})
  const timers = useRef<Record<number, number>>({})

  // Leaving the page cancels every pending hide, so a timer cannot fire into a
  // component that is no longer mounted.
  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id))
  }, [])

  const hide = useCallback((id: number) => {
    window.clearTimeout(timers.current[id])
    delete timers.current[id]
    setShown((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const reveal = useCallback(
    async (id: number) => {
      if (shown[id] !== undefined) {
        hide(id)
        return
      }
      try {
        const value = await fetcher(id)
        setShown((prev) => ({ ...prev, [id]: value }))
        timers.current[id] = window.setTimeout(() => hide(id), HIDE_AFTER_MS)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : failMessage)
      }
    },
    [fetcher, failMessage, hide, shown],
  )

  // Copying fetches its own copy rather than reusing what is on screen, so the
  // clipboard works whether or not the value is currently revealed.
  const copy = useCallback(
    async (id: number, copied: string, failed: string) => {
      try {
        await navigator.clipboard.writeText(await fetcher(id))
        toast.success(copied)
      } catch {
        toast.error(failed)
      }
    },
    [fetcher],
  )

  return { shown, reveal, copy }
}
