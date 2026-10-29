import { describe, expect, it } from 'vitest'

import type {
  LocalTimeEntrySnapshot,
  TimerJournalEntry,
} from '@/contracts/local-runtime'

import { detectTimeOverlap } from './time-overlap-rules'

const clock = (): string => '2026-10-28T12:00:00.000Z'

function candidate(
  overrides: Partial<LocalTimeEntrySnapshot> = {},
): LocalTimeEntrySnapshot {
  return {
    id: 'entry-1',
    connectionInstanceId: 'connection-1',
    dataSourceId: 'redmine',
    _deleted: false,
    syncStatus: 'synced',
    task: { id: 'task-1' },
    activity: { id: 'activity-1' },
    user: { id: 'member-1' },
    startDate: '2026-10-28T10:00:00.000Z',
    endDate: '2026-10-28T11:00:00.000Z',
    timeSpent: 1,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T11:00:00.000Z',
    timeStatus: 'finished',
    journal: [],
    ...overrides,
  }
}

function journal(
  event: TimerJournalEntry['event'],
  at: string,
): TimerJournalEntry {
  let action: TimerJournalEntry['action'] = 'stop'
  if (event === 'started') action = 'start'
  if (event === 'paused') action = 'pause'
  if (event === 'resumed') action = 'resume'
  return {
    id: `${event}-${at}`,
    action,
    timestamp: at,
    secondsAtMoment: 0,
    event,
    at,
    secondsAtEvent: 0,
  }
}

describe('detectTimeOverlap', () => {
  it('treats adjacent intervals as non-overlapping', async () => {
    const result = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T11:00:00.000Z',
          end: '2026-10-28T12:00:00.000Z',
        },
      },
      [candidate()],
      clock,
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: expect.objectContaining({
          hasOverlap: false,
          conflicts: [],
        }),
      }),
    )
  })

  it('uses active journal intervals and excludes paused gaps', async () => {
    const result = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:30:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [
        candidate({
          timeStatus: 'running',
          endDate: null,
          journal: [
            journal('started', '2026-10-28T10:00:00.000Z'),
            journal('paused', '2026-10-28T10:15:00.000Z'),
            journal('resumed', '2026-10-28T11:00:00.000Z'),
          ],
        }),
      ],
      clock,
    )

    expect(result.success.hasOverlap).toBe(false)
  })

  it('uses the injected clock for a running interval but not for its token', async () => {
    const running = candidate({
      timeStatus: 'running',
      endDate: null,
      journal: [journal('started', '2026-10-28T10:00:00.000Z')],
    })
    const first = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T11:00:00.000Z',
          end: '2026-10-28T11:30:00.000Z',
        },
      },
      [running],
      () => '2026-10-28T12:00:00.000Z',
    )
    const second = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T11:00:00.000Z',
          end: '2026-10-28T11:30:00.000Z',
        },
      },
      [running],
      () => '2026-10-28T13:00:00.000Z',
    )

    expect(first.success.conflictToken).toBe(second.success.conflictToken)
  })

  it('excludes the requested entry and deleted candidates', async () => {
    const result = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:30:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
        excludeEntryId: 'entry-1',
      },
      [candidate(), candidate({ id: 'deleted', _deleted: true })],
      clock,
    )

    expect(result.success.conflicts).toEqual([])
  })

  it('changes the token when the persisted candidate snapshot changes', async () => {
    const input = {
      workspaceId: 'workspace-1',
      interval: {
        start: '2026-10-28T10:30:00.000Z',
        end: '2026-10-28T10:45:00.000Z',
      },
    }
    const first = await detectTimeOverlap(input, [candidate()], clock)
    const second = await detectTimeOverlap(
      input,
      [candidate({ updatedAt: '2026-10-28T11:01:00.000Z' })],
      clock,
    )

    expect(first.success.conflictToken).not.toBe(second.success.conflictToken)
  })

  it('does not overlap an empty target or empty candidate interval', async () => {
    const target = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:30:00.000Z',
          end: '2026-10-28T10:30:00.000Z',
        },
      },
      [candidate()],
      clock,
    )
    const emptyCandidate = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:15:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [
        candidate({
          startDate: '2026-10-28T10:30:00.000Z',
          endDate: '2026-10-28T10:30:00.000Z',
        }),
      ],
      clock,
    )

    expect(target.success).toEqual({ hasOverlap: false, conflicts: [] })
    expect(emptyCandidate.success).toEqual({
      hasOverlap: false,
      conflicts: [],
    })
  })

  it('rejects closed candidates without an end date', async () => {
    const paused = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:30:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [candidate({ timeStatus: 'paused', endDate: undefined })],
      clock,
    )
    const finished = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:30:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [candidate({ timeStatus: 'finished', endDate: null })],
      clock,
    )

    expect(paused.failure.messageKey).toBe('CLOSED_TIME_ENTRY_END_REQUIRED')
    expect(finished.failure.messageKey).toBe('CLOSED_TIME_ENTRY_END_REQUIRED')
  })

  it('preserves persisted journal order when events share an instant', async () => {
    const result = await detectTimeOverlap(
      {
        workspaceId: 'workspace-1',
        interval: {
          start: '2026-10-28T10:15:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [
        candidate({
          timeStatus: 'finished',
          endDate: '2026-10-28T11:00:00.000Z',
          journal: [
            {
              ...journal('started', '2026-10-28T10:00:00.000Z'),
              id: 'z-start',
            },
            { ...journal('paused', '2026-10-28T10:30:00.000Z'), id: 'a-pause' },
            {
              ...journal('resumed', '2026-10-28T10:30:00.000Z'),
              id: 'z-resume',
            },
            { ...journal('stopped', '2026-10-28T11:00:00.000Z'), id: 'a-stop' },
          ],
        }),
      ],
      clock,
    )

    expect(result.success.conflicts).toHaveLength(1)
    expect(result.success.conflicts[0]?.effectiveIntervals).toEqual([
      {
        start: '2026-10-28T10:00:00.000Z',
        end: '2026-10-28T10:30:00.000Z',
      },
      {
        start: '2026-10-28T10:30:00.000Z',
        end: '2026-10-28T11:00:00.000Z',
      },
    ])
  })

  it('keeps tokens stable across candidate order and binds them to workspace and target', async () => {
    const input = {
      workspaceId: 'workspace-1',
      interval: {
        start: '2026-10-28T10:30:00.000Z',
        end: '2026-10-28T10:45:00.000Z',
      },
    }
    const first = await detectTimeOverlap(
      input,
      [
        candidate(),
        candidate({
          id: 'entry-2',
          startDate: '2026-10-28T09:00:00.000Z',
          endDate: '2026-10-28T09:30:00.000Z',
        }),
      ],
      clock,
    )
    const reordered = await detectTimeOverlap(
      input,
      [
        candidate({
          id: 'entry-2',
          startDate: '2026-10-28T09:00:00.000Z',
          endDate: '2026-10-28T09:30:00.000Z',
        }),
        candidate(),
      ],
      clock,
    )
    const otherWorkspace = await detectTimeOverlap(
      { ...input, workspaceId: 'workspace-2' },
      [candidate()],
      clock,
    )
    const otherTarget = await detectTimeOverlap(
      {
        ...input,
        interval: {
          start: '2026-10-28T10:31:00.000Z',
          end: '2026-10-28T10:45:00.000Z',
        },
      },
      [candidate()],
      clock,
    )

    expect(first.success.conflictToken).toBe(reordered.success.conflictToken)
    expect(first.success.conflictToken).not.toBe(
      otherWorkspace.success.conflictToken,
    )
    expect(first.success.conflictToken).not.toBe(
      otherTarget.success.conflictToken,
    )
  })
})
