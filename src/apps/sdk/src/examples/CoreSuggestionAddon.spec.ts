import { describe, expect, it, vi } from 'vitest'

import {
  type AddonContext,
  AppError,
  type CoreMember,
  type CoreMetadata,
  type CoreRuntimeState,
  type CoreTask,
  Either,
  type ICoreConnectionsAPI,
  type TimeEntryRecordDTO,
} from '../index'
import {
  CoreSuggestionAddon,
  type CoreSuggestionRequest,
} from './CoreSuggestionAddon'

function createMockContext(overrides?: {
  taskResult?: Either<AppError, CoreTask>
  metadataResult?: Either<AppError, CoreMetadata>
  memberResult?: Either<AppError, CoreMember>
  createResult?: Either<AppError, TimeEntryRecordDTO>
  onStateChangedUnsubscribe?: () => void
}): AddonContext {
  const unsubscribe = overrides?.onStateChangedUnsubscribe ?? vi.fn()
  return {
    core: {
      runtime: {
        getState: vi.fn((): CoreRuntimeState => 'ready'),
        onStateChanged: vi.fn(() => unsubscribe),
      },
      workspaces: {
        list: vi.fn(),
        get: vi.fn(),
      },
      connections: {
        list: vi.fn(),
        get: vi.fn(),
      } as unknown as ICoreConnectionsAPI,
      tasks: {
        list: vi.fn(),
        get: vi.fn(
          async () =>
            overrides?.taskResult ??
            Either.success({
              workspaceId: 'ws-1',
              connectionInstanceId: 'conn-1',
              taskId: 'task-100',
              title: 'Tarefa Documental',
              dataSourceId: 'fake-ds',
              status: { id: 'open', name: 'Open' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
        ),
      },
      metadata: {
        get: vi.fn(
          async () =>
            overrides?.metadataResult ??
            Either.success({
              workspaceId: 'ws-1',
              connectionInstanceId: 'conn-1',
              dataSourceId: 'fake-ds',
              lastPulledAt: null,
              values: {
                activities: [
                  {
                    id: 'act-1',
                    name: 'Desenvolvimento',
                    icon: '',
                    colors: { badge: '' },
                  },
                ],
                taskStatuses: [],
                taskPriorities: [],
                trackStatuses: [],
                participantRoles: [],
                estimationTypes: [],
              },
            } as unknown as CoreMetadata),
        ),
      },
      members: {
        getCurrentUser: vi.fn(
          async () =>
            overrides?.memberResult ??
            Either.success({
              id: 'user-42',
              name: 'Maria Engenheira',
            }),
        ),
      },
      timer: {} as any,
      timeEntries: {
        createSuggestion: vi.fn(
          async () =>
            overrides?.createResult ??
            Either.success({
              id: 'entry-999',
              workspaceId: 'ws-1',
              connectionInstanceId: 'conn-1',
              taskId: 'task-100',
              timeStatus: 'suggestion',
              timeSpent: 900,
              timeSpentSeconds: 900,
              pauseSeconds: 0,
              activityId: 'act-1',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as unknown as TimeEntryRecordDTO),
        ),
      } as any,
    },
    contributions: {} as any,
    host: {} as any,
    http: {} as any,
  }
}

describe('CoreSuggestionAddon (Exemplo Documental)', () => {
  it('rejeita sugestão cross-workspace quando destino difere do workspace de origem', async () => {
    const addon = new CoreSuggestionAddon()
    const ctx = createMockContext()
    addon.activate(ctx)

    const result = await addon.suggest({
      originWorkspaceId: 'ws-origem',
      destination: {
        workspaceId: 'ws-destino-diferente',
        connectionInstanceId: 'conn-1',
        taskId: 'task-100',
      },
      activityId: 'act-1',
      operation: { commandId: 'cmd-1', entryId: 'ent-1' },
      durationSeconds: 900,
      startDate: '2026-10-28T10:00:00.000Z',
      endDate: '2026-10-28T10:15:00.000Z',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toContain(
      'CROSS_WORKSPACE_SUGGESTION_FORBIDDEN',
    )
  })

  it('propaga falha de membersProvider sem mascarar quando autoria falha', async () => {
    const addon = new CoreSuggestionAddon()
    const ctx = createMockContext({
      memberResult: Either.failure(
        AppError.Unauthorized('MEMBER_NOT_AUTHENTICATED'),
      ),
    })
    addon.activate(ctx)

    const result = await addon.suggest({
      originWorkspaceId: 'ws-1',
      destination: {
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        taskId: 'task-100',
      },
      activityId: 'act-1',
      operation: { commandId: 'cmd-1', entryId: 'ent-1' },
      durationSeconds: 900,
      startDate: '2026-10-28T10:00:00.000Z',
      endDate: '2026-10-28T10:15:00.000Z',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toBe('MEMBER_NOT_AUTHENTICATED')
  })

  it('cria sugestão com sucesso quando autoria e mesmo workspace são confirmados', async () => {
    const addon = new CoreSuggestionAddon()
    const ctx = createMockContext()
    addon.activate(ctx)

    const result = await addon.suggest({
      originWorkspaceId: 'ws-1',
      destination: {
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        taskId: 'task-100',
      },
      activityId: 'act-1',
      operation: { commandId: 'cmd-1', entryId: 'ent-1' },
      durationSeconds: 900,
      startDate: '2026-10-28T10:00:00.000Z',
      endDate: '2026-10-28T10:15:00.000Z',
    })

    expect(result.isSuccess()).toBe(true)
    expect(ctx.core.timeEntries.createSuggestion).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        taskId: 'task-100',
        userId: 'user-42',
        userName: 'Maria Engenheira',
        activityId: 'act-1',
        timeSpentSeconds: 900,
        startDate: '2026-10-28T10:00:00.000Z',
        endDate: '2026-10-28T10:15:00.000Z',
        source: 'addon',
      }),
      { commandId: 'cmd-1', entryId: 'ent-1' },
    )
  })

  it('garante idempotência de payload e previne COMMAND_ID_PAYLOAD_MISMATCH em retries com relógio avançando', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'))
      const addon = new CoreSuggestionAddon()
      const ctx = createMockContext()
      addon.activate(ctx)

      const request: CoreSuggestionRequest = {
        originWorkspaceId: 'ws-1',
        destination: {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          taskId: 'task-100',
        },
        activityId: 'act-1',
        operation: {
          commandId: 'cmd-idempotent-1',
          entryId: 'ent-idempotent-1',
        },
        durationSeconds: 1800,
        startDate: '2026-10-28T11:00:00.000Z',
        endDate: '2026-10-28T11:30:00.000Z',
        comments: 'Chamada de alinhamento congelada',
        metadata: {
          ruleId: 'rule-voice-1',
          channelId: 'chan-dev',
          revision: 2,
        },
      }

      // 1. Primeira emissão
      const firstResult = await addon.suggest(request)
      expect(firstResult.isSuccess()).toBe(true)

      // 2. Simula passagem do relógio do sistema antes de um retry com a mesma operação
      vi.advanceTimersByTime(120_000) // +2 minutos

      // 3. Segunda emissão (retry)
      const secondResult = await addon.suggest(request)
      expect(secondResult.isSuccess()).toBe(true)

      expect(ctx.core.timeEntries.createSuggestion).toHaveBeenCalledTimes(2)
      const [firstWorkspace, firstPayload, firstOp] = vi.mocked(
        ctx.core.timeEntries.createSuggestion,
      ).mock.calls[0]
      const [secondWorkspace, secondPayload, secondOp] = vi.mocked(
        ctx.core.timeEntries.createSuggestion,
      ).mock.calls[1]

      // Mesmo workspace e mesma operação
      expect(firstWorkspace).toBe(secondWorkspace)
      expect(firstOp).toEqual(secondOp)

      // O payload DEVE ser 100% idêntico, prevenindo COMMAND_ID_PAYLOAD_MISMATCH
      expect(firstPayload).toEqual(secondPayload)
      expect(secondPayload.startDate).toBe('2026-10-28T11:00:00.000Z')
      expect(secondPayload.endDate).toBe('2026-10-28T11:30:00.000Z')
      expect(secondPayload.timeSpentSeconds).toBe(1800)
      expect(secondPayload.addonSource?.metadata).toEqual({
        ruleId: 'rule-voice-1',
        channelId: 'chan-dev',
        revision: 2,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('executa cleanup do listener de runtime ao desativar', () => {
    const addon = new CoreSuggestionAddon()
    const unsubscribe = vi.fn()
    const ctx = createMockContext({ onStateChangedUnsubscribe: unsubscribe })

    addon.activate(ctx)
    expect(ctx.core.runtime.onStateChanged).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()

    addon.deactivate()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
