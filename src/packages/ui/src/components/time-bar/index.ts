// ─────────────────────────────────────────────
// index.ts — barrel exports
// ─────────────────────────────────────────────

export type { TimerDisplayProps, TimerStatus } from './timer-display'
export { TimerDisplay } from './timer-display'
export {
  formatTime,
  parseTimeInput,
  type TimerEngineOptions,
  type TimerEngineResult,
  type TimerMode,
  useTimerEngine,
} from './timer-engine'
export type { TimerInputProps } from './timer-input'
export { TimerInput } from './timer-input'
export type { TimerSegmentedInputProps } from './timer-segmented-input'
export { TimerSegmentedInput } from './timer-segmented-input'
export { UltimateTimeTracker } from './ultimate-entry-bar'
export { useActiveTimer } from './useActiveTimer'

// ─────────────────────────────────────────────
// USAGE EXAMPLES
// ─────────────────────────────────────────────

/*
──────────────────────────────────────────────────
1. DROP-IN REPLACEMENT (same as before)
   Reads from useTimeEntryStore automatically.
──────────────────────────────────────────────────

import { TimerDisplay } from '@/components/timer'

<TimerDisplay />


──────────────────────────────────────────────────
2. EDITABLE COUNT-UP (e.g. time entry row)
   User can click and type "1h 30m" while paused.
──────────────────────────────────────────────────

<TimerDisplay
  editable
  mode="countup"
  initialValue="1:30:00"
  status="paused"
/>


──────────────────────────────────────────────────
3. COUNTDOWN TIMER with warning + finish callback
──────────────────────────────────────────────────

<TimerDisplay
  mode="countdown"
  initialValue="2h"
  status="running"
  onFinish={() => toast.info('Time is up!')}
/>


──────────────────────────────────────────────────
4. STANDALONE (no store) controlled externally
──────────────────────────────────────────────────

const [secs, setSecs] = useState(0)

<TimerDisplay
  editable
  seconds={secs}
  status="paused"
  initialValue={secs}
/>


──────────────────────────────────────────────────
5. READONLY (feature-flagged)
──────────────────────────────────────────────────

<TimerDisplay
  editable={featureFlags.allowTimeEdit}
  mode="countup"
/>


──────────────────────────────────────────────────
6. useTimerEngine standalone (custom UI)
──────────────────────────────────────────────────

const { getSeconds } = useTimerEngine({
  initialSeconds: 3600,
  mode: 'countdown',
  running: true,
  onFinish: () => alert('done'),
})

// Poll in your own render loop:
// const s = getSeconds()
// formatTime(s) → "00:59:59"


──────────────────────────────────────────────────
7. parseTimeInput — pure utility
──────────────────────────────────────────────────

parseTimeInput('1h')        // 3600
parseTimeInput('1h30')      // 5400
parseTimeInput('1h 30m')    // 5400
parseTimeInput('90m')       // 5400
parseTimeInput('5400s')     // 5400
parseTimeInput('01:30:00')  // 5400
parseTimeInput('2:15')      // 8100  (2h 15m)
parseTimeInput('45')        // 45    (seconds)
parseTimeInput('abc')       // null  (invalid)
*/
