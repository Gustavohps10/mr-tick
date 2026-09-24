'use client'

import {
  addDays,
  addSeconds,
  differenceInSeconds,
  format,
  isBefore,
  isValid,
  parse,
  parseISO,
} from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib'

const parseFlexTime = (val: string): number | null => {
  if (!val) return 0
  const normalized = val.replace(',', '.').trim()

  if (normalized.includes(':')) {
    const parts = normalized.split(':').map(Number)
    if (parts.some(isNaN)) return null
    const [h, m, s] = parts
    return h + (m || 0) / 60 + (s || 0) / 3600
  }

  if (!isNaN(Number(normalized)) && normalized.includes('.')) {
    return Number(normalized)
  }

  const num = Number(normalized)
  if (isNaN(num)) return null

  if (num > 24) {
    const s = normalized
    if (s.length >= 2) {
      const h = Number(s[0])
      const m = Number(s.substring(1))
      return h + (m * 10) / 60
    }
  }
  return num
}

const decimalToHMS = (decimalHours?: number) => {
  if (decimalHours === undefined || decimalHours <= 0) return '00:00:00'
  const totalSeconds = Math.round(decimalHours * 3600)
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

const toHHMM = (iso?: string) => {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'HH:mm')
  } catch {
    return ''
  }
}

const isValidHourRange = (val: string) => {
  if (!val) return true
  const regex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
  return regex.test(val)
}

interface TimeEntryInputsProps {
  startDate?: string
  endDate?: string
  timeSpent: number
  disabled?: boolean
  onChange: (data: {
    startDate?: string
    endDate?: string
    timeSpent: number
  }) => void
  className?: string
}

export const TimeEntryInputs = ({
  startDate,
  endDate,
  timeSpent,
  disabled,
  onChange,
  className,
}: TimeEntryInputsProps) => {
  const [localStart, setLocalStart] = useState(toHHMM(startDate))
  const [localEnd, setLocalEnd] = useState(toHHMM(endDate))
  const [localSpent, setLocalSpent] = useState(decimalToHMS(timeSpent))

  const [isFocused, setIsFocused] = useState(false)
  const [errors, setErrors] = useState({
    start: false,
    end: false,
    spent: timeSpent <= 0,
  })

  useEffect(() => {
    if (isFocused) return
    setLocalStart(toHHMM(startDate))
    setErrors((p) => ({ ...p, start: false }))
  }, [startDate, isFocused])

  useEffect(() => {
    if (isFocused) return
    setLocalEnd(toHHMM(endDate))
    setErrors((p) => ({ ...p, end: false }))
  }, [endDate, isFocused])

  useEffect(() => {
    if (isFocused) return
    setLocalSpent(decimalToHMS(timeSpent))
    setErrors((p) => ({ ...p, spent: timeSpent <= 0 }))
  }, [timeSpent, isFocused])

  const baseDate = useMemo(
    () => (startDate ? parseISO(startDate) : new Date()),
    [startDate],
  )

  const validateAndSync = (
    fStart: string,
    fEnd: string,
    fSpent: string,
    fieldTriggered: 'start' | 'end' | 'spent',
  ) => {
    const hasChanged =
      fStart !== toHHMM(startDate) ||
      fEnd !== toHHMM(endDate) ||
      fSpent !== decimalToHMS(timeSpent)

    if (!hasChanged) return

    const isStartValid = isValidHourRange(fStart)
    const isEndValid = isValidHourRange(fEnd)

    if (!isStartValid || !isEndValid) {
      setErrors({ start: !isStartValid, end: !isEndValid, spent: false })
      return
    }

    if (fieldTriggered === 'spent') {
      const parsed = parseFlexTime(fSpent)
      if (parsed === null || parsed <= 0) {
        setErrors((prev) => ({ ...prev, spent: true }))
        return
      }

      const decimal = parsed
      const startRef = startDate ? parseISO(startDate) : baseDate
      const sISO = startRef.toISOString()
      const eISO = addSeconds(
        startRef,
        Math.round(decimal * 3600),
      ).toISOString()

      setLocalStart(format(parseISO(sISO), 'HH:mm'))
      setLocalEnd(format(parseISO(eISO), 'HH:mm'))
      setLocalSpent(decimalToHMS(decimal))
      setErrors({ start: false, end: false, spent: false })
      onChange({
        startDate: sISO,
        endDate: eISO,
        timeSpent: decimal,
      })
      return
    }

    const sDate = parse(fStart, 'HH:mm', baseDate)
    let eDate = parse(fEnd, 'HH:mm', baseDate)

    if (!isValid(sDate) || !isValid(eDate)) {
      setErrors({ start: !isValid(sDate), end: !isValid(eDate), spent: false })
      return
    }

    if (isBefore(eDate, sDate)) eDate = addDays(eDate, 1)

    const seconds = differenceInSeconds(eDate, sDate)
    const decimal = Number((seconds / 3600).toFixed(4))
    if (decimal <= 0) {
      setErrors({ start: true, end: true, spent: true })
      return
    }

    const sISO = sDate.toISOString()
    const eISO = eDate.toISOString()
    setLocalSpent(decimalToHMS(decimal))
    setErrors({ start: false, end: false, spent: false })
    onChange({
      startDate: sISO,
      endDate: eISO,
      timeSpent: decimal,
    })
  }

  const handleTextChange = (val: string, setter: (v: string) => void) => {
    const cleaned = val.replace(/[^0-9:.,]/g, '')
    setter(cleaned)
  }

  const isSpentInvalid = errors.spent || (!disabled && timeSpent <= 0)
  const hasAnyError = errors.start || errors.end || isSpentInvalid

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded border px-1 py-0.5 transition-all',
        disabled
          ? 'border-transparent bg-transparent'
          : hasAnyError
            ? 'bg-destructive/5 border-destructive/40 hover:border-destructive/60'
            : 'bg-muted/20 border-border hover:border-border/80',
        className,
      )}
    >
      <Input
        data-testid="time-entry-start-time-input"
        disabled={disabled}
        value={localStart}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          handleTextChange(e.target.value, setLocalStart)
          setErrors((p) => ({ ...p, start: false }))
        }}
        onBlur={() => {
          setIsFocused(false)
          validateAndSync(localStart, localEnd, localSpent, 'start')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        style={{ padding: 0, lineHeight: 1 }}
        className={cn(
          'h-5 w-[46px] border-none bg-transparent text-center font-mono text-[11px] focus-visible:ring-0',
          errors.start ? 'text-destructive font-bold' : 'text-muted-foreground',
        )}
        placeholder="00:00"
      />

      <span className="text-muted-foreground/30 text-[10px] leading-none">
        ›
      </span>

      <Input
        data-testid="time-entry-end-time-input"
        disabled={disabled}
        value={localEnd}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          handleTextChange(e.target.value, setLocalEnd)
          setErrors((p) => ({ ...p, end: false }))
        }}
        onBlur={() => {
          setIsFocused(false)
          validateAndSync(localStart, localEnd, localSpent, 'end')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        style={{ padding: 0, lineHeight: 1 }}
        className={cn(
          'h-5 w-[46px] border-none bg-transparent text-center font-mono text-[11px] focus-visible:ring-0',
          errors.end ? 'text-destructive font-bold' : 'text-muted-foreground',
        )}
        placeholder="00:00"
      />

      <div className="bg-border/40 mx-1 h-3 w-px shrink-0" />

      <Input
        data-testid="time-entry-duration-input"
        disabled={disabled}
        value={localSpent}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => {
          handleTextChange(e.target.value, setLocalSpent)
          const parsed = parseFlexTime(e.target.value)
          const isInvalid = parsed === null || parsed <= 0
          setErrors((p) => ({ ...p, spent: isInvalid }))
        }}
        onBlur={() => {
          setIsFocused(false)
          validateAndSync(localStart, localEnd, localSpent, 'spent')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        style={{ padding: 0, lineHeight: 1 }}
        className={cn(
          'h-5 w-[72px] border-none bg-transparent text-center font-mono text-[11px] font-semibold focus-visible:ring-0',
          isSpentInvalid ? 'text-destructive font-bold' : 'text-primary',
          disabled && 'text-foreground/60',
        )}
        placeholder="0:00"
      />
    </div>
  )
}
