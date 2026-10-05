import { describe, expect, it } from 'vitest'

import {
  SyncTimeEntryRxDBDTO,
  TimeEntryRemoteState,
} from '@/local-db/schemas/time-entries-sync-schema'

import {
  ConflictFieldSelection,
  resolveTimeEntryConflict,
} from './resolve-time-entry-conflict'

const server: TimeEntryRemoteState = {
  id: 'remote',
  task: { id: 'task' },
  activity: { id: 'activity', name: 'Development' },
  user: { id: 'user', name: 'Remote User' },
  startDate: '2026-10-01T12:00:00.000Z',
  endDate: '2026-10-01T13:00:00.000Z',
  timeSpent: 1,
  comments: 'remote comment',
  createdAt: '2026-10-01T11:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
}
const local: SyncTimeEntryRxDBDTO = {
  ...server,
  id: 'local',
  startDate: '2026-10-01T08:00:00.000Z',
  endDate: '2026-10-01T10:00:00.000Z',
  timeSpent: 2,
  connectionInstanceId: 'connection',
  dataSourceId: 'provider',
  _deleted: false,
  comments: 'local comment',
  syncStatus: 'conflict',
  syncError: 'previous',
  remoteId: 'remote',
  conflictData: { server },
}
const remoteSelection: ConflictFieldSelection = {
  periodAndDuration: 'remote',
  comments: 'remote',
  task: 'remote',
  activity: 'remote',
}

describe('canonical time entry conflict resolution', () => {
  it('accepts every remote business field and complete baseline including user and timestamps', () => {
    const result = resolveTimeEntryConflict(local, server, remoteSelection)
    expect(result).toMatchObject({
      ...server,
      id: 'local',
      remoteId: 'remote',
      remoteState: server,
      remoteUpdatedAt: server.updatedAt,
      syncStatus: 'synced',
      syncError: null,
    })
    expect(result.conflictData).toBeUndefined()
    expect(local.syncStatus).toBe('conflict')
  })

  it('merges local comments while freezing the accepted remote baseline for the next push', () => {
    const result = resolveTimeEntryConflict(local, server, {
      ...remoteSelection,
      comments: 'local',
    })
    expect(result.comments).toBe('local comment')
    expect(result.timeSpent).toBe(1)
    expect(result.remoteState).toEqual(server)
    expect(result.syncStatus).toBe('pending_push')
    expect(result.conflictData).toBeUndefined()
  })

  it('does not overwrite a conflict changed by another window, even if its timestamp is unchanged', () => {
    const changed = {
      ...local,
      conflictData: { server: { ...server, comments: 'newer external value' } },
    }
    expect(resolveTimeEntryConflict(changed, server, remoteSelection)).toBe(
      changed,
    )
  })

  it.each(['synced', 'local_only', 'pending_push'])(
    'does not apply a stale dialog to %s',
    (status) => {
      const changed = { ...local }
      if (status === 'synced') changed.syncStatus = 'synced'
      if (status === 'local_only') changed.syncStatus = 'local_only'
      if (status === 'pending_push') changed.syncStatus = 'pending_push'
      expect(resolveTimeEntryConflict(changed, server, remoteSelection)).toBe(
        changed,
      )
    },
  )

  it('does not resurrect a deleted conflict', () => {
    const changed = { ...local, _deleted: true }
    expect(resolveTimeEntryConflict(changed, server, remoteSelection)).toBe(
      changed,
    )
  })
})
