// components/time-bar/timer-display.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useHostBridge } from '@/hooks'
import { cn } from '@/lib/utils'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

import { formatTime, parseTimeInput, TimerMode } from './timer-engine'
import { TimerInput } from './timer-input'

export type TimerStatus =
  'idle' | 'running' | 'paused' | 'finished' | 'suggestion'

export interface TimerDisplayProps {
  editable?: boolean
  mode?: TimerMode
  initialValue?: number | string
  onInitialSecondsChange?: (seconds: number) => void
  onError?: (errorMsg: string | null) => void
  hasError?: boolean
  className?: string
  status?: TimerStatus
  seconds?: number
  orientation?: 'horizontal' | 'vertical'
  min?: number
  max?: number
}

function resolveInitialSeconds(initialValue?: number | string): number {
  if (initialValue === undefined) return 0
  if (typeof initialValue === 'number') return initialValue
  return parseTimeInput(initialValue) ?? 0
}

export function TimerDisplay({
  editable = false,
  mode = 'countup',
  initialValue,
  onInitialSecondsChange,
  onError,
  hasError = false,
  className,
  status: statusOverride,
  seconds: secondsOverride,
  orientation = 'horizontal',
  min = 0,
  max = Infinity,
}: TimerDisplayProps) {
  const storeStatus = useTimeEntryStore((s) => s.active?.timeStatus) || 'idle'
  const bridge = useHostBridge()

  const resolvedStatus: TimerStatus = statusOverride ?? storeStatus
  const isRunning = resolvedStatus === 'running'

  const [currentSeconds, setCurrentSeconds] = useState(() =>
    resolveInitialSeconds(initialValue),
  )

  useEffect(() => {
    if (resolvedStatus === 'idle' || resolvedStatus === 'paused') {
      setCurrentSeconds(resolveInitialSeconds(initialValue))
    }
  }, [initialValue, resolvedStatus])

  useEffect(() => {
    if (!isRunning) return

    const unsubscribeTick = bridge.events.on<{ seconds: number }>(
      'timer:tick',
      (data) => {
        setCurrentSeconds(data.seconds)
      },
    )

    const unsubscribeFinished = bridge.events.on('timer:finished', () => {
      setCurrentSeconds(0)
    })

    return () => {
      unsubscribeTick()
      unsubscribeFinished()
    }
  }, [isRunning, bridge])

  const displaySeconds =
    secondsOverride !== undefined ? secondsOverride : currentSeconds

  const formattedTime = useMemo(
    () => formatTime(displaySeconds),
    [displaySeconds],
  )

  const absSeconds = Math.floor(Math.abs(displaySeconds))
  const isNeg = displaySeconds < 0
  const h = Math.floor(absSeconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((absSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = (absSeconds % 60).toString().padStart(2, '0')

  const isWarning =
    mode === 'countdown' &&
    isRunning &&
    displaySeconds > 0 &&
    displaySeconds < 60

  const handleChange = useCallback(
    (newSeconds: number) => {
      setCurrentSeconds(newSeconds)
      onInitialSecondsChange?.(newSeconds)
    },
    [onInitialSecondsChange],
  )

  const canEdit = editable && resolvedStatus === 'idle'

  return (
    <span
      data-status={resolvedStatus}
      data-mode={mode}
      data-warning={isWarning || undefined}
      data-orientation={orientation}
      className={cn(
        'inline-flex items-center justify-center font-semibold tracking-tight tabular-nums transition-all duration-300',
        orientation === 'vertical'
          ? 'w-full flex-col gap-0.5 font-mono text-[14px] leading-[1.15] whitespace-nowrap'
          : 'font-mono text-[18px] leading-none',
        resolvedStatus === 'idle' && !hasError && 'text-muted-foreground/40',
        hasError && [
          'text-destructive',
          'drop-shadow-[0_0_8px_hsl(var(--destructive)/0.5)]',
        ],
        resolvedStatus === 'running' && !hasError && 'text-primary',
        resolvedStatus === 'paused' &&
          !hasError &&
          'text-muted-foreground animate-pulse opacity-80',
        resolvedStatus === 'finished' && !hasError && 'text-destructive',
        isRunning && !isWarning && !hasError && 'animate-timer-pulse',
        isWarning && [
          'text-destructive',
          'drop-shadow-[0_0_8px_hsl(var(--destructive)/0.6)]',
          'animate-warning-pulse',
        ],
        className,
      )}
    >
      {canEdit ? (
        <TimerInput
          value={displaySeconds}
          onChange={handleChange}
          onError={onError}
          hasError={hasError}
          orientation={orientation}
          min={min}
          max={max}
          className={cn(
            'font-semibold tracking-tight',
            orientation === 'vertical'
              ? 'w-12 py-0.5 text-center text-[13px] font-bold'
              : 'text-[18px]',
            resolvedStatus === 'idle' &&
              !hasError &&
              'text-muted-foreground/40',
            hasError && 'text-destructive font-bold',
          )}
        />
      ) : orientation === 'vertical' ? (
        <div className="grid grid-cols-[2ch_auto] items-baseline gap-x-0.5 gap-y-0.5 font-mono text-[14px] leading-none font-bold tracking-tight">
          <span>{isNeg ? `-${h}` : h}</span>
          <span className="text-muted-foreground font-mono text-[12px] font-medium">
            h
          </span>

          <span>{m}</span>
          <span className="text-muted-foreground font-mono text-[12px] font-medium">
            m
          </span>

          <span className="opacity-85">{s}</span>
          <span className="text-muted-foreground font-mono text-[12px] font-medium">
            s
          </span>
        </div>
      ) : (
        formattedTime
      )}
    </span>
  )
}
