import { useEffect, useState } from 'react'

import { api } from '@/api'

/*
Which nav destinations have been starred, shared across the app the way the
running clocks and the unread count are: the star toggles a list, the sidebar and
the page header both draw off it, and the two have to agree the moment a star is
flipped — so there is one list, not two that drift.

It lives on the account and syncs through the server, so the same favourites turn
up on the desktop and the phone. localStorage is kept as an instant, offline copy:
the app paints from it before the server answers, and falls back to it when the
server cannot be reached. Stored as an ordered list of nav keys, so the shortcuts
read in the order they were added rather than in nav order.
*/
const KEY = 'hq.fav-nav'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // A private window with storage blocked just starts with none.
    return []
  }
}

let favs = read()
const watchers = new Set<(favs: string[]) => void>()

function cache(next: string[]) {
  favs = next
  try {
    localStorage.setItem(KEY, JSON.stringify(favs))
  } catch {
    // Storage refused: the list still lives for the rest of the session.
  }
  watchers.forEach((watcher) => watcher(favs))
}

// Reconcile with the server once a session exists. The device's own list wins the
// first time the server has none, so favourites set before this feature synced are
// carried up rather than wiped; otherwise the server is the source of truth.
export async function syncFavs() {
  try {
    const { keys } = await api.favorites()
    if (keys.length === 0 && favs.length > 0) {
      await api.setFavorites(favs).catch(() => {})
      return
    }
    cache(keys)
  } catch {
    // Offline or not signed in: the localStorage copy stands.
  }
}

export function toggleFav(key: string) {
  cache(favs.includes(key) ? favs.filter((k) => k !== key) : [...favs, key])
  // Fire-and-forget: the list already shows the change, and a dropped write just
  // gets re-sent on the next toggle or reconciled on the next load.
  void api.setFavorites(favs).catch(() => {})
}

export function useFavs() {
  const [current, setCurrent] = useState(favs)
  useEffect(() => {
    watchers.add(setCurrent)
    setCurrent(favs)
    return () => {
      watchers.delete(setCurrent)
    }
  }, [])
  return current
}
