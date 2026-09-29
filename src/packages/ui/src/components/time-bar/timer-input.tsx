// ─────────────────────────────────────────────
// TimerInput.tsx
// Editable input that parses flexible time formats
// ─────────────────────────────────────────────
'use client'

import { KeyboardEvent, useCallback, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { formatTime, parseTimeInput } from './timer-engine'

export interface TimerInputProps {
  /** Current value in seconds */
  value: number
  onChange: (seconds: number) => void
  onError?: (errorMsg: string | null) => void
  hasError?: boolean
  orientation?: 'horizontal' | 'vertical'
  className?: string
  disabled?: boolean
  /** Placeholder shown when value is 0 and not focused */
  placeholder?: string
  min?: number
  max?: number
}

export function TimerInput({
  value,
  onChange,
  onError,
  hasError = false,
  orientation = 'horizontal',
  className,
  disabled = false,
  placeholder = '0:00:00',
  min = 0,
  max = Infinity,
}: TimerInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFocus = useCallback(() => {
    if (disabled) return
    setEditing(true)
    // Show current formatted value as starting draft
    setDraft(value > 0 ? formatTime(value) : '')
    setInvalid(false)
    onError?.(null)
  }, [disabled, value, onError])

  const commit = useCallback(() => {
    setEditing(false)
    const parsed = parseTimeInput(draft)
    if (parsed === null) {
      if (draft.trim() !== '') {
        setInvalid(true)
        onError?.('Formato de tempo inválido.')
        setTimeout(() => setInvalid(false), 2000)
      }
      return
    }
    if (parsed < min) {
      setInvalid(true)
      onError?.('Não é permitido apontamento zerado.')
      setTimeout(() => setInvalid(false), 2000)
      return
    }
    if (parsed > max) {
      setInvalid(true)
      onError?.('O total de horas no dia não pode exceder 24h.')
      setTimeout(() => setInvalid(false), 2000)
      return
    }
    setInvalid(false)
    onError?.(null)
    onChange(parsed)
  }, [draft, onChange, min, max, onError])

  const handleBlur = useCallback(() => {
    commit()
  }, [commit])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur()
      }
      if (e.key === 'Escape') {
        setDraft('')
        setEditing(false)
        setInvalid(false)
        onError?.(null)
        inputRef.current?.blur()
      }
    },
    [onError],
  )

  const isError = hasError || invalid

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="text"
      value={editing ? draft : formatTime(value)}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => {
        setDraft(e.target.value)
        onError?.(null)
      }}
      onKeyDown={handleKeyDown}
      style={{ width: orientation === 'vertical' ? '7ch' : '8ch' }}
      className={cn(
        // Base — fixed width, never expands
        'bg-transparent text-center font-mono tabular-nums outline-none',
        'transition-all duration-200',
        // Editable state
        !disabled && [
          'cursor-text',
          'rounded-md',
          'hover:bg-muted/30',
          editing && 'bg-muted/50 ring-primary/40 px-1 ring-1 ring-inset',
        ],
        // Disabled
        disabled && 'cursor-default select-none',
        // Invalid or error state
        isError &&
          'animate-shake text-destructive ring-destructive bg-destructive/10 px-1 font-bold ring-1 ring-inset',
        className,
      )}
      aria-label="Timer value — type in formats like 1h, 90m, 1:30:00"
    />
  )
}
