import { useCallback, useState } from 'react'

/**
 * A small choice — which currency, how far ahead — kept across visits. Anything
 * that is not one of `allowed` falls back: a stored value can outlive the
 * option that produced it, and a private window throws rather than answering.
 */
export function useRemembered<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null
      return stored && allowed.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })

  const choose = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // Remembering the choice is a nicety, not a requirement.
      }
    },
    [key],
  )

  return [value, choose] as const
}
