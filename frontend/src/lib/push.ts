import { api } from '@/api'
import { currentLang, translate } from '@/i18n'
import { deviceLabel } from '@/webauthn'

/**
 * Turning on notifications means three separate yeses: the browser has to
 * support push at all, the person has to grant permission, and the push
 * service has to hand back a subscription. Each fails differently, so each
 * gets its own message rather than one shrug.
 */

/** VAPID keys travel as base64url text but the browser wants raw bytes. */
function toBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported() || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Whether this browser is already subscribed, so the UI can show the truth. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    return (await registration.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error(translate('push.unsupported'))
  }

  const { key, enabled } = await api.pushKey()
  if (!enabled || !key) {
    throw new Error(translate('push.notConfigured'))
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(translate(permission === 'denied' ? 'push.blocked' : 'push.notGranted'))
  }

  const registration = await navigator.serviceWorker.ready
  // An existing subscription is reused: asking twice on one device would
  // otherwise leave a dead endpoint behind on the server.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Push without a payload is not useful here, and Chrome requires this.
      userVisibleOnly: true,
      applicationServerKey: toBytes(key) as BufferSource,
    }))

  const raw = subscription.toJSON() as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
    throw new Error(translate('push.badSubscription'))
  }

  await api.pushSubscribe({
    endpoint: raw.endpoint,
    keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    device: await deviceLabel(),
    // The morning digest is written on the server, which has no other way of
    // knowing which language this device reads.
    lang: currentLang(),
  })
}

/**
 * Unsubscribes this browser and tells the server to forget it. Both halves
 * matter: dropping only the local subscription would leave the server pushing
 * into an endpoint nobody is listening on.
 */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const { endpoint } = subscription
  await subscription.unsubscribe()
  await api.pushUnsubscribeHere(endpoint)
}
