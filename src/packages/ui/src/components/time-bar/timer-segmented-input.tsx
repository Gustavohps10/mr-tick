'use client'

import {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '@/lib/utils'

import { parseTimeInput } from './timer-engine'

export interface TimerSegmentedInputProps {
  value: number
  onChange: (seconds: number) => void
  onError?: (errorMsg: string | null) => void
  hasError?: boolean
  className?: string
  disabled?: boolean
  min?: number
  max?: number
}

function padTwo(num: number): string {
  return num.toString().padStart(2, '0')
}

function extractHms(seconds: number): {
  hours: string
  minutes: string
  seconds: string
} {
  const abs = Math.floor(Math.abs(seconds))
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  return {
    hours: padTwo(h),
    minutes: padTwo(m),
    seconds: padTwo(s),
  }
}

export const TimerSegmentedInput = memo(function TimerSegmentedInput({
  value,
  onChange,
  onError,
  hasError = false,
  className,
  disabled = false,
  min = 0,
  max = Infinity,
}: TimerSegmentedInputProps) {
  const initialHms = extractHms(value)
  const [draftH, setDraftH] = useState(initialHms.hours)
  const [draftM, setDraftM] = useState(initialHms.minutes)
  const [draftS, setDraftS] = useState(initialHms.seconds)
  const [isEditing, setIsEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLInputElement>(null)
  const minutesRef = useRef<HTMLInputElement>(null)
  const secondsRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) return
    const hms = extractHms(value)
    setDraftH(hms.hours)
    setDraftM(hms.minutes)
    setDraftS(hms.seconds)
  }, [value, isEditing])

  const commitValues = useCallback(
    (hStr: string, mStr: string, sStr: string) => {
      const h = parseInt(hStr || '0', 10)
      const m = parseInt(mStr || '0', 10)
      const s = parseInt(sStr || '0', 10)
      const total = h * 3600 + m * 60 + s

      if (total < min) {
        setInvalid(true)
        onError?.('Não é permitido apontamento zerado.')
        return
      }
      if (total > max) {
        setInvalid(true)
        onError?.('O total de horas no dia não pode exceder 24h.')
        return
      }

      setInvalid(false)
      onError?.(null)
      onChange(total)
    },
    [min, max, onError, onChange],
  )

  const commitCurrentDraft = useCallback(() => {
    commitValues(draftH, draftM, draftS)
  }, [commitValues, draftH, draftM, draftS])

  const handleContainerFocus = useCallback(() => {
    if (disabled) return
    setIsEditing(true)
    setInvalid(false)
    onError?.(null)
  }, [disabled, onError])

  const handleContainerBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const nextTarget = e.relatedTarget
      if (nextTarget && containerRef.current?.contains(nextTarget)) return

      setIsEditing(false)
      commitCurrentDraft()
    },
    [commitCurrentDraft],
  )

  const applyFlexibleTime = useCallback(
    (raw: string): boolean => {
      const parsed = parseTimeInput(raw)
      if (parsed === null) return false

      const hms = extractHms(parsed)
      setDraftH(hms.hours)
      setDraftM(hms.minutes)
      setDraftS(hms.seconds)
      commitValues(hms.hours, hms.minutes, hms.seconds)
      return true
    },
    [commitValues],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text').trim()
      const applied = applyFlexibleTime(pasted)
      if (applied) e.preventDefault()
    },
    [applyFlexibleTime],
  )

  const handleHoursChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (/[a-z:]/i.test(raw)) {
        const applied = applyFlexibleTime(raw)
        if (applied) return
      }

      const digits = raw.replace(/\D/g, '')
      if (digits.length === 0) {
        setDraftH('')
        return
      }

      const nextVal = digits.slice(-2)
      setDraftH(nextVal)
      setInvalid(false)
      onError?.(null)

      if (digits.length >= 2) {
        minutesRef.current?.focus()
        minutesRef.current?.select()
      }
    },
    [applyFlexibleTime, onError],
  )

  const handleMinutesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (/[a-z:]/i.test(raw)) {
        const applied = applyFlexibleTime(raw)
        if (applied) return
      }

      const digits = raw.replace(/\D/g, '')
      if (digits.length === 0) {
        setDraftM('')
        return
      }

      const nextVal = digits.slice(-2)
      setDraftM(nextVal)
      setInvalid(false)
      onError?.(null)

      if (digits.length >= 2) {
        secondsRef.current?.focus()
        secondsRef.current?.select()
      }
    },
    [applyFlexibleTime, onError],
  )

  const handleSecondsChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (/[a-z:]/i.test(raw)) {
        const applied = applyFlexibleTime(raw)
        if (applied) return
      }

      const digits = raw.replace(/\D/g, '')
      if (digits.length === 0) {
        setDraftS('')
        return
      }

      const nextVal = digits.slice(-2)
      setDraftS(nextVal)
      setInvalid(false)
      onError?.(null)
    },
    [applyFlexibleTime, onError],
  )

  const handleHoursKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitCurrentDraft()
        hoursRef.current?.blur()
        return
      }
      if (e.key === 'Escape') {
        const hms = extractHms(value)
        setDraftH(hms.hours)
        setDraftM(hms.minutes)
        setDraftS(hms.seconds)
        hoursRef.current?.blur()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        minutesRef.current?.focus()
        minutesRef.current?.select()
        return
      }
      if (e.key === 'ArrowRight') {
        const target = e.currentTarget
        if (target.selectionStart === target.value.length) {
          e.preventDefault()
          minutesRef.current?.focus()
          minutesRef.current?.select()
        }
      }
    },
    [commitCurrentDraft, value],
  )

  const handleMinutesKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitCurrentDraft()
        minutesRef.current?.blur()
        return
      }
      if (e.key === 'Escape') {
        const hms = extractHms(value)
        setDraftH(hms.hours)
        setDraftM(hms.minutes)
        setDraftS(hms.seconds)
        minutesRef.current?.blur()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        hoursRef.current?.focus()
        hoursRef.current?.select()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        secondsRef.current?.focus()
        secondsRef.current?.select()
        return
      }
      if (e.key === 'ArrowRight') {
        const target = e.currentTarget
        if (target.selectionStart === target.value.length) {
          e.preventDefault()
          secondsRef.current?.focus()
          secondsRef.current?.select()
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        const target = e.currentTarget
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          e.preventDefault()
          hoursRef.current?.focus()
          hoursRef.current?.select()
        }
        return
      }
      if (e.key === 'Backspace') {
        const target = e.currentTarget
        if (
          target.value === '' ||
          (target.selectionStart === 0 && target.selectionEnd === 0)
        ) {
          e.preventDefault()
          hoursRef.current?.focus()
          hoursRef.current?.select()
        }
      }
    },
    [commitCurrentDraft, value],
  )

  const handleSecondsKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitCurrentDraft()
        secondsRef.current?.blur()
        return
      }
      if (e.key === 'Escape') {
        const hms = extractHms(value)
        setDraftH(hms.hours)
        setDraftM(hms.minutes)
        setDraftS(hms.seconds)
        secondsRef.current?.blur()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        minutesRef.current?.focus()
        minutesRef.current?.select()
        return
      }
      if (e.key === 'ArrowLeft') {
        const target = e.currentTarget
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          e.preventDefault()
          minutesRef.current?.focus()
          minutesRef.current?.select()
        }
        return
      }
      if (e.key === 'Backspace') {
        const target = e.currentTarget
        if (
          target.value === '' ||
          (target.selectionStart === 0 && target.selectionEnd === 0)
        ) {
          e.preventDefault()
          minutesRef.current?.focus()
          minutesRef.current?.select()
        }
      }
    },
    [commitCurrentDraft, value],
  )

  const isError = hasError || invalid

  return (
    <div
      ref={containerRef}
      data-testid="timer-segmented-input"
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
      className={cn(
        'grid grid-cols-[2.4ch_auto] items-baseline justify-center gap-x-0.5 gap-y-0.5 font-mono text-[13px] leading-none font-bold tracking-tight select-none',
        disabled && 'cursor-default opacity-60',
        isError && 'animate-shake text-destructive',
        className,
      )}
    >
      <input
        ref={hoursRef}
        type="text"
        inputMode="numeric"
        aria-label="Timer value"
        data-testid="timer-input-hours"
        disabled={disabled}
        value={draftH}
        onFocus={(e) => e.target.select()}
        onChange={handleHoursChange}
        onKeyDown={handleHoursKeyDown}
        onPaste={handlePaste}
        className="hover:bg-muted/40 focus:bg-muted/60 focus:ring-primary/40 w-[2.4ch] rounded-[3px] bg-transparent p-0 text-right font-mono text-[13px] leading-none font-bold tabular-nums transition-colors outline-none focus:ring-1"
      />
      <span className="text-muted-foreground font-mono text-[10px] font-medium">
        h
      </span>

      <input
        ref={minutesRef}
        type="text"
        inputMode="numeric"
        aria-label="Timer minutes"
        data-testid="timer-input-minutes"
        disabled={disabled}
        value={draftM}
        onFocus={(e) => e.target.select()}
        onChange={handleMinutesChange}
        onKeyDown={handleMinutesKeyDown}
        onPaste={handlePaste}
        className="hover:bg-muted/40 focus:bg-muted/60 focus:ring-primary/40 w-[2.4ch] rounded-[3px] bg-transparent p-0 text-right font-mono text-[13px] leading-none font-bold tabular-nums transition-colors outline-none focus:ring-1"
      />
      <span className="text-muted-foreground font-mono text-[10px] font-medium">
        m
      </span>

      <input
        ref={secondsRef}
        type="text"
        inputMode="numeric"
        aria-label="Timer seconds"
        data-testid="timer-input-seconds"
        disabled={disabled}
        value={draftS}
        onFocus={(e) => e.target.select()}
        onChange={handleSecondsChange}
        onKeyDown={handleSecondsKeyDown}
        onPaste={handlePaste}
        className="hover:bg-muted/40 focus:bg-muted/60 focus:ring-primary/40 w-[2.4ch] rounded-[3px] bg-transparent p-0 text-right font-mono text-[13px] leading-none font-bold tabular-nums transition-colors outline-none focus:ring-1"
      />
      <span className="text-muted-foreground font-mono text-[10px] font-medium">
        s
      </span>
    </div>
  )
})
