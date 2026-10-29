import type { ConflictingTimeEntry, TimeInterval } from '@mr-tick/application'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TimeOverlapConfirmationDialog } from './time-overlap-confirmation-dialog'

describe('TimeOverlapConfirmationDialog', () => {
  const targetInterval: TimeInterval = {
    start: '2026-10-28T10:15:00.000Z',
    end: '2026-10-28T11:45:00.000Z',
  }

  const conflicts: readonly ConflictingTimeEntry[] = [
    {
      id: 'entry-101',
      title: 'Tarefa em Execução',
      timeStatus: 'running',
      startDate: '2026-10-28T10:00:00.000Z',
      effectiveIntervals: [
        {
          start: '2026-10-28T10:00:00.000Z',
          end: '2026-10-28T11:00:00.000Z',
        },
        {
          start: '2026-10-28T11:30:00.000Z',
          end: '2026-10-28T12:00:00.000Z',
        },
      ],
    },
  ]

  it('renders conflicting entries with multiple effective intervals and target interval', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <TimeOverlapConfirmationDialog
        open={true}
        onOpenChange={onOpenChange}
        conflicts={conflicts}
        conflictToken="token-xyz-123"
        targetInterval={targetInterval}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(
      screen.getByTestId('time-overlap-confirmation-dialog'),
    ).toBeInTheDocument()
    expect(screen.getByText('Tarefa em Execução')).toBeInTheDocument()
    expect(screen.getByText('Timer Ativo')).toBeInTheDocument()

    expect(
      screen.getByTestId('time-overlap-target-interval'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('conflict-interval-entry-101-0'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('conflict-interval-entry-101-1'),
    ).toBeInTheDocument()

    const confirmBtn = screen.getByTestId('time-overlap-confirm-btn')
    expect(confirmBtn).not.toBeDisabled()
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('token-xyz-123')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables confirm button when conflictToken is empty', () => {
    render(
      <TimeOverlapConfirmationDialog
        open={true}
        onOpenChange={vi.fn()}
        conflicts={conflicts}
        conflictToken=""
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const confirmBtn = screen.getByTestId('time-overlap-confirm-btn')
    expect(confirmBtn).toBeDisabled()
  })

  it('disables buttons when isSubmitting is true', () => {
    render(
      <TimeOverlapConfirmationDialog
        open={true}
        onOpenChange={vi.fn()}
        conflicts={conflicts}
        conflictToken="valid-token"
        isSubmitting={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const confirmBtn = screen.getByTestId('time-overlap-confirm-btn')
    expect(confirmBtn).toBeDisabled()
    const cancelBtn = screen.getByText('Cancelar')
    expect(cancelBtn).toBeDisabled()
  })
})
