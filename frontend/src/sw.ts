/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Written by hand rather than generated, because a generated worker has no
// room for the two handlers below. Everything above them is what the generator
// used to produce.

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Client-side routes fall back to the shell. Nothing under /api is ever
// served from cache: this app holds secrets, and a stale credential response
// is exactly what must not happen.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

self.addEventListener('install', () => {
  // A new worker takes over immediately; waiting for every tab to close means
  // a fix can sit unused for days on an installed app.
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

type Push = {
  title?: string
  body?: string
  url?: string
  tag?: string
  // Sent by the server so the icons can change without waiting for a new
  // worker to reach every device.
  icon?: string
  badge?: string
}

self.addEventListener('push', (event) => {
  let data: Push = {}
  try {
    data = event.data ? (event.data.json() as Push) : {}
  } catch {
    // A payload we cannot read still deserves a notification: the browser
    // may otherwise show its own "this site has been updated" message.
    data = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'HQ', {
      body: data.body ?? '',
      icon: data.icon ?? '/pwa-192.png',
      // Android paints the badge from its alpha channel alone, so this one is
      // the mark on transparent rather than the full-colour icon, which would
      // arrive as a solid white square.
      badge: data.badge ?? '/badge-96.png',
      // Same tag replaces rather than stacks, so a resend does not leave two.
      tag: data.tag ?? 'hq',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string })?.url ?? '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Reuse a tab that is already open rather than piling up new ones.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
