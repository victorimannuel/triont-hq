/**
 * The noise a finished timer makes. Two ways of getting attention, because
 * neither is reliable alone: a notification is silent and easy to miss on a
 * desktop, and a sound is nothing if the tab is muted.
 *
 * Both are best-effort. A browser that refuses either still counts down and
 * still shows the zero on screen.
 */

let audio: AudioContext | undefined

/**
 * Browsers only allow audio that a person asked for, so the context is opened
 * on the click that starts the timer and kept for the alarm minutes later.
 */
export function primeAlarm() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    // No audio here. The notification still fires.
  }
}

/** Three short beeps, synthesised rather than shipped as an audio file. */
export function playAlarm() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
    const start = audio.currentTime
    for (let i = 0; i < 3; i += 1) {
      const at = start + i * 0.28
      const tone = audio.createOscillator()
      const level = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = 880
      // Shaped rather than switched: a square edge on a sine reads as a click.
      level.gain.setValueAtTime(0.0001, at)
      level.gain.exponentialRampToValueAtTime(0.22, at + 0.02)
      level.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
      tone.connect(level).connect(audio.destination)
      tone.start(at)
      tone.stop(at + 0.22)
    }
  } catch {
    // Nothing to do; the notification and the screen still say it is done.
  }
}

export const canNotify = () => 'Notification' in window

/** Asked for on the click that starts a timer, which is when it makes sense. */
export function askToNotify() {
  if (!canNotify() || Notification.permission !== 'default') return
  void Notification.requestPermission()
}

export function notifyAlarm(title: string, body: string) {
  if (!canNotify() || Notification.permission !== 'granted') return
  try {
    // Tagged so a second alarm replaces the first rather than stacking.
    new Notification(title, { body, tag: 'hq-timer', icon: '/pwa-192.png' })
  } catch {
    // Some browsers only allow this from a service worker; the sound covers it.
  }
}
