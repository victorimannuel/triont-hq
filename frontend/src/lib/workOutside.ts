import { translate } from '@/i18n'
import type { TimeEntry } from '@/types'

/**
 * The clock, outside the app window.
 *
 * A widget would be the obvious home for this and no phone browser can put one
 * on a home screen, so this is the pair of things the web can actually do: a
 * line in the notification shade, and a count on the installed app's icon.
 *
 * Neither is a push. The page asks its own service worker to show the
 * notification, which needs no server and no round trip; the worker's existing
 * click handler then opens whatever `data.url` says, the same as for a real
 * push.
 *
 * The number does not tick. A notification can only be redrawn by replacing it,
 * and replacing one every second would be a torch shone into the shade. What it
 * says instead is which job and since when, which is the part worth knowing
 * from a locked screen.
 */

const TAG = 'hq-work-running'

// What the notification currently in the shade says. Redrawing an identical one
// is free of visible effect and not free of cost, and on some phones a replace
// still flickers — so an unchanged one is left where it is.
let showing = ''

async function worker() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null
  if (Notification.permission !== 'granted') return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

async function clear(registration: ServiceWorkerRegistration) {
  const open = await registration.getNotifications({ tag: TAG })
  open.forEach((notification) => notification.close())
}

/*
The count on the app icon.

Only visible on an installed app — in an ordinary browser tab there is no icon
to mark — and it is the half of this that survives being swiped away, because
nothing but the app itself can clear it.

A desktop shows the number on the taskbar or dock. A phone shows whatever its
launcher shows, which on Android is usually a dot rather than a digit; that is
the launcher's decision and not something the page gets a say in.
*/
function syncBadge(running: number) {
  if (!('setAppBadge' in navigator)) return
  // Both of these reject rather than throw when the platform declines, and a
  // badge that cannot be set is not worth a line in the console.
  if (running > 0) void navigator.setAppBadge(running).catch(() => undefined)
  else void navigator.clearAppBadge().catch(() => undefined)
}

/**
 * Brings the shade and the icon in line with what is running. Safe to call as
 * often as the list is refreshed; the notification is only touched when its
 * wording would actually change.
 */
export async function syncWorkOutside(entries: TimeEntry[]) {
  syncBadge(entries.length)

  const registration = await worker()
  if (!registration) return

  if (entries.length === 0) {
    if (showing !== '') {
      showing = ''
      await clear(registration)
    }
    return
  }

  // The notification cannot be made un-swipeable — the web has no ongoing
  // notification — so it is put back instead. Asking the shade what is still
  // there is what tells the two cases apart: still up and unchanged, leave it
  // alone; gone, it was flicked away and goes back up.
  const up = await registration.getNotifications({ tag: TAG })

  // The newest one, matching the pill: it is the one just started and so the
  // one most likely to be forgotten. The rest are counted after it.
  const [first] = entries
  const rest = entries.length - 1

  const where = first.project
    ? first.part
      ? `${first.project} · ${first.part}`
      : first.project
    : translate('work.noProject')

  const since = new Date(first.started_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const body = rest > 0
    ? translate('work.noticeMore', { at: since, n: rest })
    : translate('work.noticeBody', { at: since })

  const next = `${where}|${body}`
  if (next === showing && up.length > 0) return
  showing = next

  await registration.showNotification(where, {
    body,
    icon: '/pwa-192.png',
    // Android paints the badge from its alpha channel alone, so this is the
    // mark on transparent rather than the full-colour icon.
    badge: '/badge-96.png',
    tag: TAG,
    // Never a sound and never a buzz. This is a thing sitting in the shade, not
    // an announcement; the clock was started deliberately a moment ago and
    // does not need reporting back.
    silent: true,
    /*
    Asks the platforms that honour it to leave the notification up rather than
    fading it after a few seconds. Desktop Chrome obeys. Android does not treat
    it as un-swipeable — the web has no equivalent of a native ongoing
    notification — so it is put back on the next sync instead, which is the
    nearest thing to sticky the platform allows.
    */
    requireInteraction: true,
    // The worker's click handler reads this, the same as for a push.
    data: { url: '/waktu' },
    timestamp: new Date(first.started_at).getTime(),
  } as NotificationOptions & { timestamp: number })
}
