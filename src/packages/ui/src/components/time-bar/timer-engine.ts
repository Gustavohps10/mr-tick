// ─────────────────────────────────────────────
// timerEngine.ts
// Pure logic: parse, format, engine hook
// ─────────────────────────────────────────────

// ── 1. parseTimeInput ─────────────────────────
/**
 * Converts flexible human input into seconds.
 *
 * Accepted formats:
 *   "1h"          → 3600
 *   "1h30"        → 5400
 *   "1h 30m"      → 5400
 *   "90m"         → 5400
 *   "5400s"       → 5400
 *   "01:30:00"    → 5400
 *   "2:15"        → 8100  (hh:mm)
 *   "45"          → 45    (raw seconds)
 *   ""            → null  (empty / invalid)
 */
export function parseTimeInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null

  const isNeg = s.startsWith('-')
  const absS = isNeg ? s.substring(1).trim() : s

  // HH:MM:SS or H:MM:SS
  const hms = absS.match(/^(\d+):(\d{1,2}):(\d{2})$/)
  if (hms) {
    const val =
      parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseInt(hms[3])
    return isNeg ? -val : val
  }

  // HH:MM or H:MM  → treat as hours:minutes
  const hm = absS.match(/^(\d+):(\d{2})$/)
  if (hm) {
    const val = parseInt(hm[1]) * 3600 + parseInt(hm[2]) * 60
    return isNeg ? -val : val
  }

  // Compound with seconds: 1h 30m 15s or 1h30m15s
  const compoundHms = absS.match(/^(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s?$/i)
  if (compoundHms) {
    const val =
      parseInt(compoundHms[1], 10) * 3600 +
      parseInt(compoundHms[2], 10) * 60 +
      parseInt(compoundHms[3], 10)
    return isNeg ? -val : val
  }

  // Compound: 1h30m, 1h30, 1h 30m, 1h 30
  const compound = absS.match(/^(\d+)\s*h\s*(\d+)\s*m?$/i)
  if (compound) {
    const val =
      parseInt(compound[1], 10) * 3600 + parseInt(compound[2], 10) * 60
    return isNeg ? -val : val
  }

  // Pure hours: 1h, 2.5h
  const hoursOnly = absS.match(/^(\d+(?:\.\d+)?)\s*h$/i)
  if (hoursOnly) {
    const val = Math.round(parseFloat(hoursOnly[1]) * 3600)
    return isNeg ? -val : val
  }

  // Pure minutes: 90m
  const minsOnly = absS.match(/^(\d+(?:\.\d+)?)\s*m$/i)
  if (minsOnly) {
    const val = Math.round(parseFloat(minsOnly[1]) * 60)
    return isNeg ? -val : val
  }

  // Pure seconds with explicit 's': 5400s, 5s
  const explicitSecs = absS.match(/^(\d+(?:\.\d+)?)\s*s$/i)
  if (explicitSecs) {
    const val = Math.round(parseFloat(explicitSecs[1]))
    return isNeg ? -val : val
  }

  // Bare number (no unit): 1-24 treated as hours (24 = 23:59:59 = 86399s), > 24 as raw seconds
  const bareNumber = absS.match(/^(\d+(?:\.\d+)?)$/)
  if (bareNumber) {
    const num = parseFloat(bareNumber[1])
    let val: number
    if (num >= 1 && num <= 24) {
      if (num === 24) {
        val = 86399 // 23:59:59
      } else {
        val = Math.round(num * 3600)
      }
    } else if (num === 0) {
      val = 0
    } else {
      val = Math.round(num)
    }
    return isNeg ? -val : val
  }

  return null
}

// ── 2. formatTime ──────────────────────────────
/**
 * Seconds → "HH:mm:ss"
 * Handles negative (countdown past zero) by clamping to 0.
 */
export function formatTime(totalSeconds: number): string {
  const isNeg = totalSeconds < 0
  const s = Math.floor(Math.abs(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const formatted = [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
  return isNeg ? `-${formatted}` : formatted
}

// ── 3. useTimerEngine ──────────────────────────
import { useCallback, useEffect, useRef } from 'react'

export type TimerMode = 'countup' | 'countdown'

export interface TimerEngineOptions {
  /** Initial seconds (countup base or countdown start) */
  initialSeconds: number
  mode: TimerMode
  running: boolean
  /** Called when countdown reaches 0 */
  onFinish?: () => void
}

export interface TimerEngineResult {
  /** Get the current elapsed/remaining seconds (pure read, no re-render) */
  getSeconds: () => number
}

/**
 * Pure tick engine that drives time via requestAnimationFrame.
 * Does NOT cause re-renders by itself; the display layer polls via getSeconds().
 * Callers subscribe to ticks via a separate render loop (see useActiveTimer).
 */
export function useTimerEngine({
  initialSeconds,
  mode,
  running,
  onFinish,
}: TimerEngineOptions): TimerEngineResult {
  // Internal mutable state — no useState to avoid spurious renders
  const internalRef = useRef({
    seconds: initialSeconds,
    lastTimestamp: 0,
    finished: false,
  })

  // Sync initialSeconds changes (e.g. user edited while paused)
  const prevInitialRef = useRef(initialSeconds)
  if (prevInitialRef.current !== initialSeconds) {
    prevInitialRef.current = initialSeconds
    internalRef.current.seconds = initialSeconds
    internalRef.current.finished = false
  }

  const rafRef = useRef<number>(0)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    internalRef.current.lastTimestamp = performance.now()

    const tick = (timestamp: number) => {
      const state = internalRef.current
      const delta = (timestamp - state.lastTimestamp) / 1000
      state.lastTimestamp = timestamp

      if (mode === 'countup') {
        state.seconds += delta
      } else {
        state.seconds = state.seconds - delta
        if (state.seconds <= 0 && !state.finished) {
          state.finished = true
          onFinishRef.current?.()
          return // stop loop
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, mode])

  const getSeconds = useCallback(() => internalRef.current.seconds, [])

  return { getSeconds }
}
