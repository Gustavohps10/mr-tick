import { describe, expect, it } from 'vitest'

import type {
  LocalRuntimeCommand,
  LocalTimeEntrySnapshot,
} from '../contracts/local-runtime'
import {
  planLocalRuntimeCommand,
  timeEntryPauseSeconds,
  timerState,
  toPublicRecord,
} from './local-runtime-rules'

function record(): LocalTimeEntrySnapshot {
  return {
    id: 'entry',
    connectionInstanceId: 'connection',
    dataSourceId: 'redmine',
    _deleted: false,
    syncStatus: 'synced',
    remoteId: 'remote-77',
    remoteUpdatedAt: '2026-10-08T10:00:00.000Z',
    task: { id: '77366' },
    activity: { id: 'development' },
    user: { id: 'member' },
    startDate: '2026-10-08T10:00:00.000Z',
    endDate: '2026-10-08T11:00:00.000Z',
    timeSpent: 1,
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T11:00:00.000Z',
    timeStatus: 'finished',
    journal: [],
  }
}

describe('Portable local-runtime business rules', () => {
  it('preserves confirmed remote identity when editing local comments', () => {
    const previous = record()
    const command: LocalRuntimeCommand = {
      action: 'update',
      commandId: 'operation',
      workspaceId: 'workspace',
      entryId: 'entry',
      payload: { comments: 'reviewed' },
    }
    const updated = planLocalRuntimeCommand(
      command,
      previous,
      '2026-10-08T12:00:00.000Z',
      false,
    )
    expect(updated.isSuccess()).toBe(true)
    expect(updated.success.remoteId).toBe(previous.remoteId)
    expect(updated.success.remoteUpdatedAt).toBe(previous.remoteUpdatedAt)
    expect(updated.success.comments).toBe('reviewed')
    expect(updated.success.syncStatus).toBe('pending_push')
  })

  it('does not retarget an entry with an unconfirmed operation', () => {
    const previous: LocalTimeEntrySnapshot = {
      ...record(),
      syncStatus: 'creating',
    }
    const updated = planLocalRuntimeCommand(
      {
        action: 'update',
        commandId: 'operation',
        workspaceId: 'workspace',
        entryId: 'entry',
        payload: { connectionInstanceId: 'other' },
      },
      previous,
      '2026-10-08T12:00:00.000Z',
      false,
    )
    expect(updated.isFailure()).toBe(true)
    expect(previous.connectionInstanceId).toBe('connection')
  })

  it('keeps suggestions local until accepted and preserves their UUID', () => {
    const suggestion = planLocalRuntimeCommand(
      {
        action: 'suggest',
        commandId: 'suggestion-operation',
        workspaceId: 'workspace',
        entryId: 'suggestion-entry',
        payload: {
          taskId: '77366',
          activityId: 'development',
          userId: 'member',
          connectionInstanceId: 'connection',
          dataSourceId: 'redmine',
          timeSpentSeconds: 600,
        },
      },
      null,
      '2026-10-08T12:00:00.000Z',
      false,
    )
    expect(suggestion.isSuccess()).toBe(true)
    expect(suggestion.success.syncStatus).toBe('local_only')
    const accepted = planLocalRuntimeCommand(
      {
        action: 'acceptSuggestion',
        commandId: 'accept-operation',
        workspaceId: 'workspace',
        entryId: 'suggestion-entry',
      },
      suggestion.success,
      '2026-10-08T12:01:00.000Z',
      false,
    )
    expect(accepted.isSuccess()).toBe(true)
    expect(accepted.success.id).toBe('suggestion-entry')
    expect(accepted.success.timeStatus).toBe('finished')
    expect(accepted.success.syncStatus).toBe('pending_push')
  })

  it('counts running work and pauses across midnight using the persisted journal', () => {
    const started = planLocalRuntimeCommand(
      {
        action: 'timerStart',
        commandId: 'start',
        workspaceId: 'workspace',
        entryId: 'entry',
        payload: {
          taskId: '77366',
          activityId: 'development',
          userId: 'member',
          connectionInstanceId: 'connection',
          dataSourceId: 'redmine',
          timeSpentSeconds: 0,
          mode: 'countup',
        },
      },
      null,
      '2026-10-08T23:55:00.000Z',
      false,
    )
    expect(started.isSuccess()).toBe(true)
    const paused = planLocalRuntimeCommand(
      {
        action: 'timerPause',
        commandId: 'pause',
        workspaceId: 'workspace',
        entryId: 'entry',
      },
      started.success,
      '2026-10-09T00:05:00.000Z',
      false,
    )
    expect(paused.isSuccess()).toBe(true)
    expect(
      timerState(paused.success, Date.parse('2026-10-09T00:10:00.000Z'))
        .elapsedSeconds,
    ).toBe(600)
    const resumed = planLocalRuntimeCommand(
      {
        action: 'timerResume',
        commandId: 'resume',
        workspaceId: 'workspace',
        entryId: 'entry',
      },
      paused.success,
      '2026-10-09T00:10:00.000Z',
      false,
    )
    expect(resumed.isSuccess()).toBe(true)
    const stopped = planLocalRuntimeCommand(
      {
        action: 'timerStop',
        commandId: 'stop',
        workspaceId: 'workspace',
        entryId: 'entry',
      },
      resumed.success,
      '2026-10-09T00:15:00.000Z',
      false,
    )
    expect(stopped.isSuccess()).toBe(true)
    expect(toPublicRecord(stopped.success).timeSpentSeconds).toBe(900)
    expect(
      timeEntryPauseSeconds(
        stopped.success,
        Date.parse('2026-10-09T00:15:00.000Z'),
      ),
    ).toBe(300)
  })
})
