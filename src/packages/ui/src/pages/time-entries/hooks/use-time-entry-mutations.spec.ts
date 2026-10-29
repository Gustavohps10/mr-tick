import type { LocalRuntimeResponse } from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostBridge } from '@/hooks'
import type { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { registerDatabaseScope } from '@/local-runtime/persistence-client'
import type { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'

import { useTimeEntryMutations } from './use-time-entry-mutations'

vi.mock('@/hooks', () => ({
  useHostBridge: vi.fn(),
}))

vi.mock('@/stores/timeEntryStore', () => ({
  useTimeEntryStore: vi.fn((selector) =>
    selector({
      active: null,
      setActive: vi.fn(),
      clear: vi.fn(),
    }),
  ),
}))

vi.mock('@/stores/syncStore', () => ({
  useSyncStore: vi.fn((selector) =>
    selector({
      forceSync: vi.fn(),
    }),
  ),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useTimeEntryMutations - Canonical Suggestion Acceptance and Overlap Isolation', () => {
  let mockBridge: any
  let queryClient: QueryClient
  let mockDoc: any
  let mockDb: any

  const initialSuggestionDoc: SyncTimeEntryRxDBDTO = {
    id: 'sug-123',
    dataSourceId: 'addon-discord',
    connectionInstanceId: 'conn-discord',
    syncStatus: 'pending_push',
    syncError: null,
    remoteId: null,
    lastPulledAt: null,
    lastPushedAt: null,
    task: { id: 'TASK-1' },
    activity: { id: 'act-1', name: 'Dev' },
    user: { id: 'user-1', name: 'Gustavo' },
    startDate: '2026-10-28T10:00:00.000Z',
    endDate: '2026-10-28T11:00:00.000Z',
    timeSpent: 1,
    comments: 'Discord activity',
    timeStatus: 'suggestion',
    type: 'manual',
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    _deleted: false,
  }

  const suggestionRow: SuggestionRow = {
    ...initialSuggestionDoc,
    isSuggestion: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    let currentDocState = { ...initialSuggestionDoc }
    mockDoc = {
      ...currentDocState,
      toMutableJSON: () => ({ ...currentDocState }),
      exec: vi.fn().mockImplementation(async () => mockDoc),
      patch: vi.fn().mockImplementation(async (changes) => {
        currentDocState = { ...currentDocState, ...changes }
        return mockDoc
      }),
    }

    mockDb = {
      name: 'db-memory-ws-workspace-test',
      timeEntries: {
        findOne: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockDoc),
        }),
      },
    }
    registerDatabaseScope(mockDb, 'workspace-test')

    mockBridge = {
      localRuntime: {
        request: vi.fn(),
      },
      localPersistence: {
        request: vi.fn().mockResolvedValue({
          ok: true,
          value: { committed: true },
        }),
      },
      events: {
        emit: vi.fn(),
      },
    }

    vi.mocked(useHostBridge).mockReturnValue(mockBridge)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  it('detects overlap on handleAcceptSuggestion, halts without converting to finished, and sets pending resolution', async () => {
    const detectResponse: LocalRuntimeResponse = {
      ok: true,
      value: {
        entry: null,
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: false,
        overlap: {
          hasOverlap: true,
          conflicts: [
            {
              id: 'conflicting-1',
              title: 'Tarefa Concorrente',
              timeStatus: 'running',
              startDate: '2026-10-28T10:30:00.000Z',
              effectiveIntervals: [
                {
                  start: '2026-10-28T10:30:00.000Z',
                  end: '2026-10-28T11:30:00.000Z',
                },
              ],
            },
          ],
          conflictToken: 'token-conflict-123',
        },
      },
    }

    mockBridge.localRuntime.request.mockResolvedValueOnce(detectResponse)

    const { result } = renderHook(
      () => useTimeEntryMutations(mockDb, { 'conn-discord': 'user-1' }),
      { wrapper },
    )

    let accepted = false
    await act(async () => {
      accepted = await result.current.handleAcceptSuggestion(suggestionRow)
    })

    expect(accepted).toBe(false)
    expect(mockBridge.localRuntime.request).toHaveBeenCalledWith({
      action: 'detectOverlaps',
      workspaceId: 'workspace-test',
      start: '2026-10-28T10:00:00.000Z',
      end: '2026-10-28T11:00:00.000Z',
      excludeEntryId: 'sug-123',
    })

    // Confirm that acceptSuggestion was NOT called and editRecord was NOT bypassed
    expect(mockBridge.localRuntime.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'acceptSuggestion' }),
    )
    expect(mockBridge.localPersistence.request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'editRecord',
        changes: expect.objectContaining({ timeStatus: 'finished' }),
      }),
    )

    expect(result.current.pendingOverlapResolution).toEqual({
      row: suggestionRow,
      conflicts: detectResponse.value.overlap?.conflicts,
      conflictToken: 'token-conflict-123',
      targetInterval: {
        start: '2026-10-28T10:00:00.000Z',
        end: '2026-10-28T11:00:00.000Z',
      },
    })
  })

  it('when acceptSuggestion returns 409 overlap error, halts without setting finished and prompts overlap resolution', async () => {
    // 1st call detectOverlaps returns no overlap
    mockBridge.localRuntime.request.mockResolvedValueOnce({
      ok: true,
      value: {
        entry: null,
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: false,
        overlap: { hasOverlap: false, conflicts: [] },
      },
    })

    // 2nd call acceptSuggestion returns 409
    mockBridge.localRuntime.request.mockResolvedValueOnce({
      ok: false,
      error: {
        statusCode: 409,
        messageKey: 'TIME_ENTRY_OVERLAP_DETECTED',
      },
    })

    // 3rd call detectOverlaps for re-check returns the overlap
    mockBridge.localRuntime.request.mockResolvedValueOnce({
      ok: true,
      value: {
        entry: null,
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: false,
        overlap: {
          hasOverlap: true,
          conflicts: [],
          conflictToken: 'token-recheck-456',
        },
      },
    })

    const { result } = renderHook(
      () => useTimeEntryMutations(mockDb, { 'conn-discord': 'user-1' }),
      { wrapper },
    )

    let accepted = false
    await act(async () => {
      accepted = await result.current.handleAcceptSuggestion(suggestionRow)
    })

    expect(accepted).toBe(false)
    expect(mockBridge.localPersistence.request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'editRecord',
        changes: expect.objectContaining({ timeStatus: 'finished' }),
      }),
    )
    expect(mockDoc.timeStatus).toBe('suggestion')
  })

  it('accepts suggestion with confirmation token, passing conflictToken to acceptSuggestion command', async () => {
    mockBridge.localRuntime.request.mockResolvedValueOnce({
      ok: true,
      value: {
        entry: {
          ...initialSuggestionDoc,
          timeStatus: 'finished',
        },
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: false,
      },
    })

    const { result } = renderHook(
      () => useTimeEntryMutations(mockDb, { 'conn-discord': 'user-1' }),
      { wrapper },
    )

    let accepted = false
    await act(async () => {
      accepted = await result.current.handleAcceptSuggestion(
        suggestionRow,
        'confirmed-token-789',
      )
    })

    expect(accepted).toBe(true)
    expect(mockBridge.localRuntime.request).toHaveBeenCalledWith({
      action: 'acceptSuggestion',
      workspaceId: 'workspace-test',
      entryId: 'sug-123',
      commandId: expect.any(String),
      confirmation: { conflictToken: 'confirmed-token-789' },
    })
    expect(result.current.pendingOverlapResolution).toBeNull()
  })

  it('saving row edits preserves timeStatus: suggestion without implicit conversion to finished', async () => {
    const { result } = renderHook(
      () => useTimeEntryMutations(mockDb, { 'conn-discord': 'user-1' }),
      { wrapper },
    )

    act(() => {
      result.current.setTempData({
        'sug-123': {
          comments: 'Comentário editado antes de aceitar',
        },
      })
    })

    await act(async () => {
      await result.current.handleSaveRow('sug-123')
    })

    expect(mockBridge.localPersistence.request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'editRecord',
        entryId: 'sug-123',
        changes: expect.objectContaining({
          comments: 'Comentário editado antes de aceitar',
          timeStatus: 'suggestion',
        }),
      }),
    )
    expect(mockBridge.localPersistence.request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({ timeStatus: 'finished' }),
      }),
    )
  })

  it('handleAcceptAllSuggestions pauses queue when a suggestion encounters an overlap', async () => {
    // 1st suggestion has overlap
    mockBridge.localRuntime.request.mockResolvedValueOnce({
      ok: true,
      value: {
        entry: null,
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: false,
        overlap: {
          hasOverlap: true,
          conflicts: [],
          conflictToken: 'token-pause-1',
        },
      },
    })

    const sug2: SuggestionRow = {
      ...suggestionRow,
      id: 'sug-456',
    }

    const { result } = renderHook(
      () => useTimeEntryMutations(mockDb, { 'conn-discord': 'user-1' }),
      { wrapper },
    )

    await act(async () => {
      await result.current.handleAcceptAllSuggestions([suggestionRow, sug2])
    })

    // Must not have processed sug-456 because sug-123 encountered an overlap
    expect(mockBridge.localRuntime.request).toHaveBeenCalledTimes(1)
    expect(mockDb.timeEntries.findOne).toHaveBeenCalledWith('sug-123')
    expect(mockDb.timeEntries.findOne).not.toHaveBeenCalledWith('sug-456')
  })
})
