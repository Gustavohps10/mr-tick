import { describe, expect, it } from 'vitest'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import {
  applyTimeEntryEdit,
  authorizeTimeEntryRecreation,
} from './time-entry-identity'

const document: SyncTimeEntryRxDBDTO = {
  id: 'stable-local-id',
  connectionInstanceId: 'connection-A',
  dataSourceId: 'provider',
  _deleted: false,
  syncStatus: 'pending_push',
  remoteId: 'remote-42',
  task: { id: 'task' },
  activity: { id: 'activity' },
  user: { id: 'member' },
  startDate: '2026-10-04T12:00:00Z',
  endDate: '2026-10-04T13:00:00Z',
  timeSpent: 1,
  comments: 'keep all business fields',
  createdAt: '2026-10-04T12:00:00Z',
  updatedAt: '2026-10-04T13:00:00Z',
}
const snapshot = { ...document, id: 'remote-42' }
const pending = {
  ...document,
  confirmationState: snapshot,
  syncFailure: { statusCode: 503, messageKey: 'CANONICAL_UNAVAILABLE' },
  syncError: 'CANONICAL_UNAVAILABLE',
}

describe('Atomic time entry identity transitions', () => {
  it.each(['creating', 'ambiguous', 'confirmation'])(
    'blocks connection changes while %s is unresolved',
    (operation) => {
      let current: SyncTimeEntryRxDBDTO = pending
      if (operation === 'creating')
        current = {
          ...pending,
          syncStatus: 'creating',
          confirmationState: null,
        }
      if (operation === 'ambiguous')
        current = {
          ...pending,
          syncStatus: 'ambiguous',
          confirmationState: null,
        }
      expect(
        applyTimeEntryEdit(
          current,
          {
            connectionInstanceId: 'connection-B',
            comments: 'do not apply partial edit',
          },
          'next',
        ),
      ).toBe(current)
    },
  )
  it('preserves the submitted confirmation snapshot when business fields are edited', () => {
    const result = applyTimeEntryEdit(pending, { comments: 'new edit' }, 'next')
    expect(result).toMatchObject({
      remoteId: 'remote-42',
      confirmationState: snapshot,
      comments: 'new edit',
      syncStatus: 'pending_push',
    })
  })
  it('explicitly authorized recreation clears the entire previous identity and preserves business data', () => {
    const result = authorizeTimeEntryRecreation(
      {
        ...pending,
        syncStatus: 'ambiguous',
        creationAttemptId: 'old-attempt',
        creationState: snapshot,
        remoteState: snapshot,
        remoteUpdatedAt: 'old-version',
        lastPulledAt: 'old-pull',
        lastPushedAt: 'old-push',
        remoteDeleted: true,
        deletionConfirmed: true,
      },
      'next',
    )
    expect(result).toMatchObject({
      id: document.id,
      task: document.task,
      activity: document.activity,
      user: document.user,
      comments: document.comments,
      timeSpent: document.timeSpent,
      startDate: document.startDate,
      endDate: document.endDate,
      createdAt: document.createdAt,
      remoteId: null,
      remoteState: null,
      remoteUpdatedAt: null,
      confirmationState: null,
      creationState: null,
      creationAttemptId: null,
      syncError: null,
      syncFailure: null,
      lastPulledAt: null,
      lastPushedAt: null,
      remoteDeleted: false,
      deletionConfirmed: false,
      syncStatus: 'pending_push',
    })
  })
  it('does not authorize recreation of an active confirmation or deleted entry', () => {
    expect(authorizeTimeEntryRecreation(pending, 'next')).toBe(pending)
    const deleted = { ...pending, _deleted: true }
    expect(authorizeTimeEntryRecreation(deleted, 'next')).toBe(deleted)
  })
  it('a confirmed identity can switch connections without carrying the previous ledger or error', () => {
    const result = applyTimeEntryEdit(
      {
        ...document,
        remoteState: snapshot,
        syncStatus: 'synced',
        syncFailure: pending.syncFailure,
      },
      { connectionInstanceId: 'connection-B' },
      'next',
    )
    expect(result).toMatchObject({
      connectionInstanceId: 'connection-B',
      remoteId: null,
      confirmationState: null,
      syncFailure: null,
      remoteState: null,
      syncStatus: 'pending_push',
      comments: document.comments,
    })
  })
})
