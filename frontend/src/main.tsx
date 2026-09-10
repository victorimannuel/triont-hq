import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/App'
import { applyDisguise } from '@/lib/disguise'
import '@/index.css'

// Before the first render, so an attachment cannot flash up unfrosted on the
// way in after a reload with the disguise already on.
applyDisguise()

/*
Pick up a deploy without being asked to.

The worker calls skipWaiting and claims this page the moment it installs, but
claiming does not re-run the scripts the page already loaded — so an open tab
keeps executing the bundle it started with until somebody thinks to hard
refresh. That is how a fix could sit deployed and unused for days, and it is
why the icons went stale too.

Only when a worker was already in charge: on a first install there is nothing
to replace, and reloading there would just be a flicker on the way in.
*/
if ('serviceWorker' in navigator) {
  const replacing = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !replacing) return
    reloading = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

/*
Take the launch screen away once there is something behind it.

Two conditions, not one. The render above has to have reached the screen, which
is two frames — and the mark has to have finished drawing itself, which is a
fixed 675ms of animation. Leaving on the first alone would cut the mark off
halfway on a fast phone, which looks like a glitch rather than a launch.

`performance.now()` is measured from the moment the page started loading, which
is the same moment the animation started, so it says exactly how much of that
budget a slow load has already spent. A slow one waits no extra time at all.

It is removed rather than left transparent, because a fixed layer over the whole
page still swallows taps.
*/
const BOOT_MS = 720

{
  const boot = document.getElementById('boot')
  if (boot) {
    const left = Math.max(0, BOOT_MS - performance.now())
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          boot.dataset.going = ''
          boot.addEventListener('transitionend', () => boot.remove(), { once: true })
          // Reduced motion skips the transition, and a skipped transition fires
          // no event at all, so nothing above would ever run.
          setTimeout(() => boot.remove(), 600)
        }, left),
      ),
    )
  }
}
