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
