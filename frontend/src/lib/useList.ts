import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The value a filter dropdown uses for "no filter". */
export const ALL = '__all__'

type Result<T> = {
  /** What the API returned, or an empty list until it does. */
  data: T
  loading: boolean
  error: string
  /** Current filter values, read from the URL. */
  query: Record<string, string>
  /** True when any filter is set, so the page can offer a reset. */
  filtered: boolean
  /** Set one filter; ALL or an empty string clears it. */
  update: (key: string, value: string) => void
  clear: () => void
  /** Fetch again without changing filters — after a delete, say. */
  reload: () => void
}

/**
 * Every list page did the same six things: read filters out of the URL, fetch
 * with them, track loading and error, and write filters back on change. The
 * filters live in the URL rather than in state so a filtered list survives a
 * reload and can be linked to.
 *
 * `keys` names the filters this page has. `fetcher` gets them exactly as the
 * API client wants them.
 */
export function useList<T>(
  keys: string[],
  fetcher: (query: Record<string, string>) => Promise<T>,
  empty: T,
): Result<T> {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<T>(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const query: Record<string, string> = {}
  for (const key of keys) query[key] = params.get(key) ?? ''
  const filtered = keys.some((key) => query[key] !== '')

  // params is the dependency, not query: a fresh object every render would
  // restart the fetch forever.
  const search = params.toString()

  useEffect(() => {
    let live = true
    setLoading(true)

    const current: Record<string, string> = {}
    for (const key of keys) current[key] = new URLSearchParams(search).get(key) ?? ''

    fetcher(current)
      .then((result) => {
        // A slow first request must not overwrite a faster second one.
        if (!live) return
        setData(result)
        setError('')
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : 'permintaan gagal')
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, nonce])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return {
    data,
    loading,
    error,
    query,
    filtered,
    update,
    clear: () => setParams(new URLSearchParams()),
    reload: () => setNonce((n) => n + 1),
  }
}
