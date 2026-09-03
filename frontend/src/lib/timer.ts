import { useCallback, useEffect, useReducer, useSyncExternalStore } from 'react'

import { api } from '@/api'

/**
 * A countdown that behaves like the one on a phone: it keeps running while you
 * move around the app, it survives a reload, and it goes off by itself.
 *
 * What is stored is the moment it finishes, never a number being counted down.
 * A decrementing counter drifts, stalls when the browser throttles a background
 * tab, and cannot be restored from storage — every figure on screen is derived
 * from `endsAt` and the clock instead.
 */

const KEY = 'hq-timer'

export const FOCUS_WORK = 25 * 60_000
export const FOCUS_BREAK = 5 * 60_000

/** Plain is the phone timer; work and break are the two halves of a focus run. */
export type TimerMode = 'plain' | 'work' | 'break'

export type TimerState = {
  mode: TimerMode
  label: string
  /** How long this run is, in ms. What the progress bar measures against. */
  duration: number
  /** Epoch ms it finishes at, or null when idle or paused. */
  endsAt: number | null
  /** What was left when it was paused, in ms. Null unless paused. */
  left: number | null
  /** Which focus round this is, counting from one. */
  round: number
  /** The run reached zero and has not been cleared yet. */
  finished: boolean
}

const IDLE: TimerState = {
  mode: 'plain',
  label: '',
  duration: 0,
  endsAt: null,
  left: null,
  round: 1,
  finished: false,
}

function read(): TimerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return IDLE
    const saved = JSON.parse(raw) as Partial<TimerState>
    // A stored timer whose end has already passed while the app was closed is
    // reported as finished rather than silently dropped, so a countdown that
    // ran out overnight still says so.
    return { ...IDLE, ...saved }
  } catch {
    return IDLE
  }
}

let current: TimerState = typeof localStorage === 'undefined' ? IDLE : read()
const listeners = new Set<() => void>()
let alarm: ReturnType<typeof setTimeout> | undefined

function emit() {
  for (const listener of listeners) listener()
}

function commit(next: TimerState) {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A timer that cannot be remembered still runs for this page.
  }
  schedule()
  sync(next)
  emit()
}

/**
 * Tells the server when this run is due, so a push can wake the phone even
 * with HQ closed. Every change passes through commit, which makes this the one
 * place that has to know: a finish time means arm, anything else means disarm.
 *
 * Failures are swallowed on purpose. The countdown on screen is the real one,
 * and losing the backup alarm is not worth an error in front of someone who
 * just pressed start.
 */
function sync(next: TimerState) {
  void (next.endsAt === null
    ? api.disarmTimer()
    : api.armTimer({
        fires_at: next.endsAt,
        label: next.label,
        kind: next.mode,
        round: next.round,
      })
  ).catch(() => undefined)
}

/** Fires the alarm on its own, so nothing has to be on screen for it to go off. */
function schedule() {
  clearTimeout(alarm)
  alarm = undefined
  if (current.endsAt === null) return
  const wait = current.endsAt - Date.now()
  if (wait <= 0) {
    ring()
    return
  }
  alarm = setTimeout(ring, wait)
}

// What to do when a run reaches zero. Set by the app so this module stays free
// of anything that touches the DOM or the notification API.
let onRing: ((finished: TimerState) => void) | undefined

export function setRingHandler(handler: (finished: TimerState) => void) {
  onRing = handler
}

function ring() {
  const done = current
  if (done.endsAt === null) return
  onRing?.(done)

  // A focus run rolls straight into its other half; a plain timer stops and
  // waits to be acknowledged.
  if (done.mode === 'work') {
    commit({ ...done, mode: 'break', duration: FOCUS_BREAK, endsAt: Date.now() + FOCUS_BREAK })
    return
  }
  if (done.mode === 'break') {
    commit({
      ...done,
      mode: 'work',
      duration: FOCUS_WORK,
      endsAt: Date.now() + FOCUS_WORK,
      round: done.round + 1,
    })
    return
  }
  commit({ ...done, endsAt: null, left: null, finished: true })
}

export function remaining(state: TimerState = current): number {
  if (state.left !== null) return state.left
  if (state.endsAt === null) return 0
  return Math.max(0, state.endsAt - Date.now())
}

export const isRunning = (state: TimerState = current) => state.endsAt !== null
export const isPaused = (state: TimerState = current) => state.left !== null
export const isIdle = (state: TimerState = current) =>
  state.endsAt === null && state.left === null && !state.finished

// ── The things the UI can do ────────────────────────────────────────────────

export function startPlain(duration: number, label: string) {
  if (duration <= 0) return
  commit({
    mode: 'plain',
    label,
    duration,
    endsAt: Date.now() + duration,
    left: null,
    round: 1,
    finished: false,
  })
}

export function startFocus() {
  commit({
    mode: 'work',
    label: '',
    duration: FOCUS_WORK,
    endsAt: Date.now() + FOCUS_WORK,
    left: null,
    round: 1,
    finished: false,
  })
}

export function pause() {
  if (current.endsAt === null) return
  commit({ ...current, left: remaining(), endsAt: null })
}

export function resume() {
  if (current.left === null) return
  commit({ ...current, endsAt: Date.now() + current.left, left: null })
}

export function reset() {
  commit(IDLE)
}

// ── React bindings ──────────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTimer(): TimerState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => IDLE,
  )
}

/**
 * The remaining milliseconds, re-rendering only the component that asks. The
 * store itself holds a finish time and changes rarely, so a running clock does
 * not drag the whole app through a render every second.
 */
export function useRemaining(): number {
  const state = useTimer()
  const [, tick] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (state.endsAt === null) return
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [state.endsAt])

  return remaining(state)
}

/** mm:ss, or h:mm:ss once there is an hour to show. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** Re-arms the alarm after a reload, and again whenever the tab wakes up. */
export function useTimerAlarm() {
  const check = useCallback(() => schedule(), [])

  useEffect(() => {
    schedule()
    // A sleeping tab can have its timeout deferred past the finish time, so the
    // moment it wakes is a second chance to notice the run is over.
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [check])
}
