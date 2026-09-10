import { useSyncExternalStore } from 'react'

/*
Screenshot mode: what HQ shows while someone else is looking at the screen.

Every response is censored on its way out of the fetch wrapper, so no page and
no component has to remember to opt in — a field added next month is covered
the day it appears.

Two switches, because showing the app off and showing one page of it are
different jobs. The one in the user menu covers everything; the one beside each
heading covers that page alone, and survives so that the pages he never wants
seen stay covered without him remembering. Either being on is enough.

What this is not: it hides the data from someone looking at the screen, not
from someone holding the laptop. The real values are still in the network tab,
and the address bar still carries the real slug. It is for showing the app off,
not for handing it over.
*/

const ALL_KEY = 'hq-disguise'
const PAGES_KEY = 'hq-disguise-pages'

function readAll(): boolean {
  try {
    return localStorage.getItem(ALL_KEY) === 'on'
  } catch {
    // Private windows and blocked site data both throw here. Off is the safe
    // default in the sense that matters: he sees his own data.
    return false
  }
}

function readPages(): Set<string> {
  try {
    const raw = localStorage.getItem(PAGES_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(list)) return new Set(list.filter((k): k is string => typeof k === 'string'))
  } catch {
    // Unreadable or half-written: start from nothing rather than throw on boot.
  }
  return new Set()
}

let all = readAll()
let pages = readPages()
let version = 0
const watchers = new Set<() => void>()

/** Which switch a page is under. The first segment of the route, so a record
 *  and the list it came from are the same page. */
export function pageKey(pathname: string): string {
  const first = pathname.split('/')[1] ?? ''
  return first || 'home'
}

export const disguisedAll = () => all
export const disguisedPage = (key: string) => pages.has(key)
export const disguisedAt = (pathname: string) => all || pages.has(pageKey(pathname))

// Attachments are the one thing the censor below cannot touch — the bytes are
// a photo, not a field — so the stylesheet frosts them, and the root attribute
// has to follow the route as well as the switches.
export function applyDisguise(pathname = window.location.pathname) {
  const root = document.documentElement
  if (disguisedAt(pathname)) root.setAttribute('data-disguise', 'on')
  else root.removeAttribute('data-disguise')
}

function changed() {
  version++
  applyDisguise()
  for (const fn of watchers) fn()
}

export function setDisguisedAll(next: boolean) {
  all = next
  /*
  Switching it off clears the per-page marks as well, because the thing it is
  labelled as — show every page — has to be true after you press it. Leaving
  them set meant pressing "show everything" and finding pages still covered,
  with no clue which switch was still holding them down.
  */
  if (!next) pages = new Set()
  try {
    localStorage.setItem(ALL_KEY, next ? 'on' : 'off')
    if (!next) localStorage.removeItem(PAGES_KEY)
  } catch {
    // Not remembering the choice across a reload is not worth failing over.
  }
  changed()
}

export function setDisguisedPage(key: string, next: boolean) {
  if (next) pages.add(key)
  else pages.delete(key)
  pages = new Set(pages)
  try {
    localStorage.setItem(PAGES_KEY, JSON.stringify([...pages]))
  } catch {
    // Same as above: worth having, not worth failing over.
  }
  changed()
}

/** Subscribes the caller to both switches. The number itself means nothing; it
 *  changes so that the component re-reads disguisedAll and disguisedAt. */
export function useDisguise(): number {
  return useSyncExternalStore(
    (fn) => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    },
    () => version,
  )
}

/*
The fields that get covered, by name rather than by type: the same name means
the same kind of thing everywhere in this API, so a `vendor` is a company on a
maintenance log and on a purchase alike.

A key missing from here is left exactly as it was, which is how enums, dates,
slugs, ids, currencies and counts survive — those carry no secret, and covering
them would break routing, sorting and the shape of every chart.
*/
const HIDE = new Set([
  // Names of people and organisations, and the labels that amount to one.
  'name', 'label', 'title', 'client', 'client_name', 'company', 'issuer',
  'vendor', 'provider', 'brand', 'model', 'artist', 'holder', 'nickname',
  'asset_name', 'project_name', 'credential_label', 'credential_user',
  'username',
  // Ways to reach or find something real.
  'email', 'phone', 'host', 'deploy_target', 'identifier', 'local_path',
  'ip', 'last_used_ip', 'location', 'last_used_location', 'device',
  'user_agent', 'created_by', 'updated_by', 'deleted_by',
  // Free-typed text, including the unit he types on a habit: "pasal" says
  // what the habit is as plainly as its name does.
  'notes', 'summary', 'detail', 'description', 'subtitle', 'line', 'unit',
])

/*
Covered to roughly the length it had, so the columns keep their widths and the
page does not reflow into something that was never his layout. Capped, because
a long note would otherwise draw a bar across the screen.
*/
const cover = (value: string) => '•'.repeat(Math.min(Math.max(value.length, 4), 14))

/*
An address only needs hiding when it points outside. Half the `url` fields in
this API are internal routes the app is about to navigate to — the calendar,
the search results and the notices all carry one — and covering those would
turn every link into a 404.
*/
const link = (value: string) => (value.startsWith('/') ? value : 'https://••••••••')

/*
Amounts are not touched here. They used to be scaled by a fixed factor, which
kept every total consistent with its parts but put wrong numbers on the screen —
and a wrong number reads as a broken app, not as a covered one. Covering them is
the formatter's job instead: formatMoney prints the symbol and bullets, so what
is on the screen is plainly hidden rather than quietly false.
*/
function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk)
  if (value === null || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'number') {
      out[key] = item
    } else if (typeof item === 'string') {
      // An empty field stays empty: a row with nothing written in it should
      // still read as a row with nothing written in it.
      if (item === '') out[key] = item
      else if (key === 'url') out[key] = link(item)
      else out[key] = HIDE.has(key) ? cover(item) : item
    } else {
      out[key] = walk(item)
    }
  }
  return out
}

/*
Judged by the page being looked at rather than by the endpoint the data came
from, because that is the thing the switch beside the heading is attached to.
A page that pulls in a corner of somebody else's data — the to-do list showing
what is running low — covers that too, which is what "cover this page" means.

The dropdowns are the exception that has to be spelled out: /meta is a list of
{value, label} options, and a covered `label` there blanks every status filter
in the app.
*/
export function disguise<T>(path: string, body: T): T {
  if (path.startsWith('/meta')) return body
  if (!disguisedAt(window.location.pathname)) return body
  return walk(body) as T
}
