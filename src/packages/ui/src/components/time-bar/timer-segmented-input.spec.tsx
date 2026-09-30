import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TimerSegmentedInput } from './timer-segmented-input'

describe('TimerSegmentedInput (Stacked Vertical Time Segments)', () => {
  it('renders hours, minutes, and seconds segments with 2-digit padding', () => {
    render(<TimerSegmentedInput value={3665} onChange={vi.fn()} />)

    expect(screen.getByTestId('timer-input-hours')).toBeTruthy()
    expect(screen.getByTestId('timer-input-minutes')).toBeTruthy()
    expect(screen.getByTestId('timer-input-seconds')).toBeTruthy()

    expect(screen.getAllByDisplayValue('01')).toHaveLength(2)
    expect(screen.getByDisplayValue('05')).toBeTruthy()
  })

  it('auto-advances focus from hours to minutes when 2 digits are typed', () => {
    render(<TimerSegmentedInput value={0} onChange={vi.fn()} />)

    const hours = screen.getByTestId('timer-input-hours')
    const minutes = screen.getByTestId('timer-input-minutes')

    fireEvent.focus(hours)
    fireEvent.change(hours, { target: { value: '02' } })

    expect(document.activeElement).toBe(minutes)
    expect(screen.getByDisplayValue('02')).toBeTruthy()
  })

  it('auto-advances focus from minutes to seconds when 2 digits are typed', () => {
    render(<TimerSegmentedInput value={0} onChange={vi.fn()} />)

    const minutes = screen.getByTestId('timer-input-minutes')
    const seconds = screen.getByTestId('timer-input-seconds')

    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '45' } })

    expect(document.activeElement).toBe(seconds)
    expect(screen.getByDisplayValue('45')).toBeTruthy()
  })

  it('navigates downwards with ArrowDown key', () => {
    render(<TimerSegmentedInput value={0} onChange={vi.fn()} />)

    const hours = screen.getByTestId('timer-input-hours')
    const minutes = screen.getByTestId('timer-input-minutes')
    const seconds = screen.getByTestId('timer-input-seconds')

    fireEvent.focus(hours)
    fireEvent.keyDown(hours, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(minutes)

    fireEvent.keyDown(minutes, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(seconds)
  })

  it('navigates upwards with ArrowUp key', () => {
    render(<TimerSegmentedInput value={0} onChange={vi.fn()} />)

    const hours = screen.getByTestId('timer-input-hours')
    const minutes = screen.getByTestId('timer-input-minutes')
    const seconds = screen.getByTestId('timer-input-seconds')

    fireEvent.focus(seconds)
    fireEvent.keyDown(seconds, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(minutes)

    fireEvent.keyDown(minutes, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(hours)
  })

  it('jumps to previous field on Backspace when current field is empty', () => {
    render(<TimerSegmentedInput value={0} onChange={vi.fn()} />)

    const hours = screen.getByTestId('timer-input-hours')
    const minutes = screen.getByTestId('timer-input-minutes')
    const seconds = screen.getByTestId('timer-input-seconds')

    fireEvent.focus(seconds)
    fireEvent.change(seconds, { target: { value: '' } })
    fireEvent.keyDown(seconds, { key: 'Backspace' })
    expect(document.activeElement).toBe(minutes)

    fireEvent.change(minutes, { target: { value: '' } })
    fireEvent.keyDown(minutes, { key: 'Backspace' })
    expect(document.activeElement).toBe(hours)
  })

  it('commits total calculated seconds on blur', () => {
    const handleChange = vi.fn()
    render(<TimerSegmentedInput value={0} onChange={handleChange} min={1} />)

    const hours = screen.getByTestId('timer-input-hours')
    const minutes = screen.getByTestId('timer-input-minutes')
    const container = screen.getByTestId('timer-segmented-input')

    fireEvent.focus(hours)
    fireEvent.change(hours, { target: { value: '01' } })

    fireEvent.focus(minutes)
    fireEvent.change(minutes, { target: { value: '30' } })

    fireEvent.blur(container, { relatedTarget: null })

    // 1h 30m = 5400s
    expect(handleChange).toHaveBeenCalledWith(5400)
  })

  it('commits total calculated seconds on Enter key', () => {
    const handleChange = vi.fn()
    render(<TimerSegmentedInput value={0} onChange={handleChange} min={1} />)

    const hours = screen.getByTestId('timer-input-hours')

    fireEvent.focus(hours)
    fireEvent.change(hours, { target: { value: '02' } })
    fireEvent.keyDown(hours, { key: 'Enter' })

    // 2h = 7200s
    expect(handleChange).toHaveBeenCalledWith(7200)
  })

  it('resets drafts to initial values on Escape key', () => {
    render(<TimerSegmentedInput value={3600} onChange={vi.fn()} />)

    const hours = screen.getByTestId('timer-input-hours')

    fireEvent.focus(hours)
    fireEvent.change(hours, { target: { value: '05' } })
    expect(screen.getByDisplayValue('05')).toBeTruthy()

    fireEvent.keyDown(hours, { key: 'Escape' })
    expect(screen.getByDisplayValue('01')).toBeTruthy()
  })

  it('parses pasted flexible time string into all segments and commits', () => {
    const handleChange = vi.fn()
    render(<TimerSegmentedInput value={0} onChange={handleChange} />)

    const hours = screen.getByTestId('timer-input-hours')

    fireEvent.paste(hours, {
      clipboardData: {
        getData: () => '1h 45m 30s',
      },
    })

    expect(screen.getByDisplayValue('01')).toBeTruthy()
    expect(screen.getByDisplayValue('45')).toBeTruthy()
    expect(screen.getByDisplayValue('30')).toBeTruthy()
    expect(handleChange).toHaveBeenCalledWith(6330)
  })

  it('validates min and max seconds', () => {
    const handleError = vi.fn()
    const handleChange = vi.fn()
    render(
      <TimerSegmentedInput
        value={0}
        onChange={handleChange}
        onError={handleError}
        min={1}
        max={86400}
      />,
    )

    const container = screen.getByTestId('timer-segmented-input')
    const hours = screen.getByTestId('timer-input-hours')

    // Commit 0 seconds when min is 1
    fireEvent.focus(hours)
    fireEvent.change(hours, { target: { value: '00' } })
    fireEvent.blur(container, { relatedTarget: null })

    expect(handleError).toHaveBeenCalledWith(
      'Não é permitido apontamento zerado.',
    )
    expect(handleChange).not.toHaveBeenCalled()
  })
})
