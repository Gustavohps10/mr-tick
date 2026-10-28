import type {
  DiagnosticSnapshot,
  IHostBridge,
  SanitizedDiagnosticReport,
} from '@mr-tick/application'
import type { ViewModel } from '@mr-tick/shared/view-models'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hostBridgeMocks = vi.hoisted(() => ({
  getSnapshot: vi.fn<() => Promise<ViewModel<DiagnosticSnapshot>>>(),
  runChecks: vi.fn<() => Promise<ViewModel<DiagnosticSnapshot>>>(),
  generateReport: vi.fn<() => Promise<ViewModel<SanitizedDiagnosticReport>>>(),
  openDataDirectory: vi.fn<() => Promise<ViewModel<void>>>(),
  eventsOn: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

function createMockBridge(overrides?: Partial<IHostBridge>): IHostBridge {
  return {
    diagnostics: {
      getSnapshot: hostBridgeMocks.getSnapshot,
      runChecks: hostBridgeMocks.runChecks,
      generateReport: hostBridgeMocks.generateReport,
      openDataDirectory: hostBridgeMocks.openDataDirectory,
    },
    events: {
      on: hostBridgeMocks.eventsOn,
      off: vi.fn(),
      emit: vi.fn(),
    },
    ...overrides,
  } as unknown as IHostBridge
}

let activeBridgeInstance: IHostBridge = createMockBridge()

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => activeBridgeInstance,
}))

import { toast } from 'sonner'

import { SystemDataSettingsTab } from '@/components/settings/system-data-settings-tab'
import {
  getBridgeDiagnosticsState,
  isSnapshotNewer,
} from '@/hooks/use-system-diagnostics'

function createSampleSnapshot(
  overrides?: Partial<DiagnosticSnapshot>,
): DiagnosticSnapshot {
  return {
    formatVersion: '1.0',
    sessionId: 'session-xyz-123',
    revision: 10,
    emittedAt: '2026-10-27T18:00:00.000Z',
    observedGeneration: 'gen-desktop-101',
    dispatcher: {
      state: 'ready',
      generation: 'gen-desktop-101',
      startupStage: 'runtime_ready',
      pendingRequestsByChannel: { 'runtime:ping': 0 },
    },
    checks: [
      {
        id: 'chk-main-bridge',
        name: 'Comunicação do Processo Principal',
        capability: 'ipc-bridge',
        source: 'main',
        scope: { type: 'application' },
        status: 'pass',
        provenOperation: 'Handshake com o processo principal e IPC ativo',
        startedAt: '2026-10-27T18:00:00.000Z',
        finishedAt: '2026-10-27T18:00:00.005Z',
        durationMs: 5,
      },
      {
        id: 'chk-metadata-read',
        name: 'Leitura de Metadados Globais',
        capability: 'metadata-read',
        source: 'metadata',
        scope: { type: 'application' },
        status: 'pass',
        provenOperation: 'Consulta SELECT de validação na base de metadados',
        startedAt: '2026-10-27T18:00:00.005Z',
        finishedAt: '2026-10-27T18:00:00.012Z',
        durationMs: 7,
      },
    ],
    storages: [
      {
        id: 'storage-metadata',
        name: 'Base de Metadados SQLite',
        role: 'metadata',
        technology: 'sqlite',
        location: 'C:/UserData/metric.db',
        measurement: {
          status: 'available',
          bytes: 1048576, // 1.0 MB
          precision: 'exact',
          coverage: 'file',
          unit: 'bytes',
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
      },
      {
        id: 'storage-browser-origin',
        name: 'Armazenamento da Origem Web',
        role: 'browser',
        technology: 'indexeddb',
        measurement: {
          status: 'available',
          bytes: 5242880, // 5.0 MB
          precision: 'estimated',
          coverage: 'origin',
          unit: 'bytes',
          collectedAt: '2026-10-27T18:00:00.000Z',
          overlappingTargets: ['workspace-ws-1', 'workspace-ws-2'],
        },
      },
    ],
    workspaces: [
      {
        workspaceId: 'ws-alpha',
        status: 'ready',
        hasDb: true,
        pendingWrites: {
          status: 'available',
          count: 0,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        receipts: {
          status: 'available',
          count: 4,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        tombstones: {
          status: 'available',
          count: 1,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        replication: {
          status: 'available',
          items: [],
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
      },
      {
        workspaceId: 'ws-beta',
        status: 'maintenance',
        hasDb: true,
        pendingWrites: {
          status: 'available',
          count: 2,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        receipts: {
          status: 'available',
          count: 0,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        tombstones: {
          status: 'available',
          count: 0,
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
        replication: {
          status: 'not-supported',
          reason: 'Replicação desabilitada',
          collectedAt: '2026-10-27T18:00:00.000Z',
        },
      },
    ],
    recentEvents: [
      {
        sequence: 1,
        sessionId: 'session-xyz-123',
        generation: 'gen-desktop-101',
        origin: 'boot',
        level: 'info',
        stage: 'bootstrap',
        message: 'Ambiente desktop inicializado com sucesso',
        timestamp: '2026-10-27T17:59:50.000Z',
      },
      {
        sequence: 2,
        sessionId: 'session-xyz-123',
        generation: 'gen-desktop-101',
        origin: 'sync',
        level: 'warn',
        stage: 'replication_poll',
        code: 'CONN_OFFLINE',
        message: 'Servidor remoto inalcançável no momento',
        timestamp: '2026-10-27T17:59:55.000Z',
      },
      {
        sequence: 3,
        sessionId: 'session-xyz-123',
        generation: 'gen-desktop-101',
        origin: 'executor',
        level: 'error',
        stage: 'task_exec',
        code: 'TASK_TIMEOUT',
        message: 'Execução de tarefa em segundo plano expirou',
        timestamp: '2026-10-27T17:59:58.000Z',
      },
    ],
    discardedEventsCount: 2,
    ...overrides,
  }
}

function renderTab(queryClientOverride?: QueryClient) {
  const queryClient =
    queryClientOverride ??
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

  return render(
    <QueryClientProvider client={queryClient}>
      <SystemDataSettingsTab />
    </QueryClientProvider>,
  )
}

describe('isSnapshotNewer and Bridge Continuity', () => {
  it('returns true when current snapshot is null or undefined', () => {
    const incoming = createSampleSnapshot({ revision: 1 })
    expect(isSnapshotNewer(incoming, null)).toBe(true)
    expect(isSnapshotNewer(incoming, undefined)).toBe(true)
  })

  it('compares strictly by monotonic revision when session is the same', () => {
    const bridgeObj = {}
    const bridgeState = getBridgeDiagnosticsState(bridgeObj)

    const current = createSampleSnapshot({
      sessionId: 'session-1',
      revision: 10,
    })
    const incomingNewer = createSampleSnapshot({
      sessionId: 'session-1',
      revision: 11,
    })
    const incomingOlder = createSampleSnapshot({
      sessionId: 'session-1',
      revision: 9,
    })
    const incomingSame = createSampleSnapshot({
      sessionId: 'session-1',
      revision: 10,
    })

    expect(isSnapshotNewer(incomingNewer, current, bridgeState)).toBe(true)
    expect(isSnapshotNewer(incomingOlder, current, bridgeState)).toBe(false)
    expect(isSnapshotNewer(incomingSame, current, bridgeState)).toBe(false)
  })

  it('deterministico: aceita nova sessao mesmo com relogio retrocedendo e rejeita sessao antiga atrasada', () => {
    const bridgeObj = {}
    const bridgeState = getBridgeDiagnosticsState(bridgeObj)

    // Sessão 1 ativa com timestamp "avançado" (ex: relógio estava adiantado)
    const session1Snapshot = createSampleSnapshot({
      sessionId: 'session-uuid-1',
      emittedAt: '2026-10-27T19:30:00.000Z',
      revision: 50,
    })
    expect(isSnapshotNewer(session1Snapshot, null, bridgeState)).toBe(true)

    // Ocorre reinicialização e o relógio da máquina retrocede 1 hora
    // Sessão 2 nasce com timestamp anterior ao da Sessão 1
    const session2Snapshot = createSampleSnapshot({
      sessionId: 'session-uuid-2',
      emittedAt: '2026-10-27T18:30:00.000Z', // 1h antes!
      revision: 1,
    })

    // DEVE ACEITAR a nova sessão por identidade/continuidade, sem depender de Date.parse
    expect(
      isSnapshotNewer(session2Snapshot, session1Snapshot, bridgeState),
    ).toBe(true)
    expect(bridgeState.activeSessionId).toBe('session-uuid-2')
    expect(bridgeState.retiredSessionIds.has('session-uuid-1')).toBe(true)

    // Resposta atrasada da Sessão 1 chega agora (mesmo tendo timestamp 19:30 > 18:30)
    const delayedSession1Snapshot = createSampleSnapshot({
      sessionId: 'session-uuid-1',
      emittedAt: '2026-10-27T19:30:05.000Z',
      revision: 51,
    })

    // DEVE REJEITAR a continuidade aposentada da Sessão 1
    expect(
      isSnapshotNewer(delayedSession1Snapshot, session2Snapshot, bridgeState),
    ).toBe(false)
  })

  it('deterministico: bootstrap query de sessao A nunca vista antes nao pode reativar continuidade apos evento da sessao B', () => {
    const bridgeObj = {}
    const bridgeState = getBridgeDiagnosticsState(bridgeObj)

    // Bootstrap query inicia capturando o token da continuidade atual (token = 1)
    const bootstrapOperationToken = bridgeState.continuityToken

    // Antes de A responder, chega um evento estabelecendo a Sessão B (cache era vazio)
    const sessionBSnapshot = createSampleSnapshot({
      sessionId: 'session-B',
      revision: 1,
    })
    expect(isSnapshotNewer(sessionBSnapshot, null, bridgeState)).toBe(true)
    expect(bridgeState.activeSessionId).toBe('session-B')

    // Agora resolve a consulta antiga da Sessão A (que nunca tinha sido vista antes)
    const delayedSessionASnapshot = createSampleSnapshot({
      sessionId: 'session-A',
      revision: 10,
    })

    // Deve ser REJEITADA deterministicamente porque o token capturado (1) é anterior à continuidade de B
    expect(
      isSnapshotNewer(
        delayedSessionASnapshot,
        sessionBSnapshot,
        bridgeState,
        bootstrapOperationToken,
      ),
    ).toBe(false)
    expect(bridgeState.activeSessionId).toBe('session-B')
  })
})

describe('SystemDataSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeBridgeInstance = createMockBridge()
    hostBridgeMocks.eventsOn.mockReturnValue(vi.fn())
  })

  it('renders structured skeleton while loading initial snapshot', () => {
    hostBridgeMocks.getSnapshot.mockReturnValue(new Promise(() => {}))

    renderTab()

    expect(screen.getByTestId('system-data-loading-skeleton')).toBeTruthy()
    expect(screen.queryByTestId('system-data-settings-tab')).toBeNull()
  })

  it('renders error state when snapshot fetch fails with ViewModel error', async () => {
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: false,
      statusCode: 503,
      error: 'Serviço de diagnóstico indisponível temporariamente',
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('system-data-error-state')).toBeTruthy()
    })
    expect(
      screen.getByText('Serviço de diagnóstico indisponível temporariamente'),
    ).toBeTruthy()
  })

  it('renders full operational state with lifecycle, checks, storages, workspaces and events', async () => {
    const snapshot = createSampleSnapshot()
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: snapshot,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('system-data-settings-tab')).toBeTruthy()
    })

    // Header info
    expect(screen.getByText('Revisão #10')).toBeTruthy()

    // Lifecycle card - badge "Pronto"
    expect(screen.getByTestId('lifecycle-badge-ready').textContent).toContain(
      'Pronto',
    )
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-desktop-101',
    )
    expect(screen.getByTestId('lifecycle-session-id').textContent).toBe(
      'session-xyz-123',
    )
    expect(screen.getByTestId('lifecycle-startup-stage').textContent).toBe(
      'runtime_ready',
    )

    // Checks
    expect(screen.getByTestId('diagnostic-check-chk-main-bridge')).toBeTruthy()
    expect(
      screen.getByTestId('diagnostic-check-chk-metadata-read'),
    ).toBeTruthy()

    // Storages
    expect(screen.getByTestId('storage-item-storage-metadata')).toBeTruthy()
    expect(
      screen.getByTestId('storage-item-storage-browser-origin'),
    ).toBeTruthy()
    expect(screen.getByText('1.0 MB')).toBeTruthy()
    expect(screen.getByText('Exato')).toBeTruthy()
    expect(screen.getByText('Estimado')).toBeTruthy()

    // Workspaces
    expect(screen.getByTestId('workspace-status-item-ws-alpha')).toBeTruthy()
    expect(screen.getByTestId('workspace-status-item-ws-beta')).toBeTruthy()

    // Events
    expect(screen.getByTestId('event-item-1')).toBeTruthy()
    expect(screen.getByTestId('event-item-2')).toBeTruthy()
    expect(screen.getByTestId('event-item-3')).toBeTruthy()
    expect(screen.getByTestId('discarded-events-badge')).toBeTruthy()
  })

  it('renders startup failure banner distinguishing deadline timeout from explicit failure', async () => {
    const timeoutSnapshot = createSampleSnapshot({
      dispatcher: {
        state: 'closed',
        generation: 'gen-fail',
        startupStage: 'waiting_executor',
        pendingRequestsByChannel: {},
        lastStartupFailure: {
          kind: 'deadline_exceeded',
          stage: 'when_ready_30s',
          messageKey: 'EXECUTOR_TIMEOUT',
          timestamp: '2026-10-27T18:02:00.000Z',
        },
      },
    })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: timeoutSnapshot,
    })

    renderTab()

    await waitFor(() => {
      expect(
        screen.getByTestId('lifecycle-startup-failure-banner'),
      ).toBeTruthy()
    })
    expect(
      screen.getByText('Prazo de Inicialização Excedido (Timeout)'),
    ).toBeTruthy()
    expect(screen.getByText('when_ready_30s')).toBeTruthy()
  })

  it('renders unavailable storage measurement without fake 0 or fake green', async () => {
    const unavailSnapshot = createSampleSnapshot({
      storages: [
        {
          id: 'storage-offline-db',
          name: 'Banco Operacional Offline',
          role: 'operational',
          technology: 'sqlite',
          measurement: {
            status: 'unavailable',
            reason: 'Runtime não respondeu ao probe de leitura',
            collectedAt: '2026-10-27T18:00:00.000Z',
          },
        },
      ],
    })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: unavailSnapshot,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('storage-unavailable-badge')).toBeTruthy()
    })
    expect(
      screen.getByText('Runtime não respondeu ao probe de leitura'),
    ).toBeTruthy()
    expect(screen.queryByText('0 B')).toBeNull()
  })

  it('discards stale incoming snapshot events based on monotonic revision in queryClient', async () => {
    let capturedCallback: ((payload: DiagnosticSnapshot) => void) | null = null
    hostBridgeMocks.eventsOn.mockImplementation(
      (channel: string, cb: (payload: DiagnosticSnapshot) => void) => {
        if (channel === 'diagnostics:snapshot-updated') {
          capturedCallback = cb
        }
        return vi.fn()
      },
    )

    const initialSnapshot = createSampleSnapshot({ revision: 5 })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: initialSnapshot,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByText('Revisão #5')).toBeTruthy()
    })

    // Dispara evento com revisão atrasada (revisão 3 < 5)
    const staleSnapshot = createSampleSnapshot({
      revision: 3,
      observedGeneration: 'stale-generation',
    })
    act(() => {
      capturedCallback?.(staleSnapshot)
    })

    // A geração NÃO deve ser atualizada para a versão atrasada
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-desktop-101',
    )
    expect(screen.queryByText('Revisão #3')).toBeNull()

    // Dispara evento com revisão mais nova (revisão 6 > 5)
    const freshSnapshot = createSampleSnapshot({
      revision: 6,
      observedGeneration: 'newer-generation-202',
    })
    act(() => {
      capturedCallback?.(freshSnapshot)
    })

    await waitFor(() => {
      expect(screen.getByText('Revisão #6')).toBeTruthy()
    })
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'newer-generation-202',
    )
  })

  it('deterministico: getSnapshot retido com revisao 10, evento revisao 20 chega, liberar consulta 10 mantem revisao 20', async () => {
    let resolveDelayedFetch: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const delayedPromise = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveDelayedFetch = resolve
      },
    )

    let capturedCallback: ((payload: DiagnosticSnapshot) => void) | null = null
    hostBridgeMocks.eventsOn.mockImplementation(
      (channel: string, cb: (payload: DiagnosticSnapshot) => void) => {
        if (channel === 'diagnostics:snapshot-updated') {
          capturedCallback = cb
        }
        return vi.fn()
      },
    )

    // getSnapshot inicial retido
    hostBridgeMocks.getSnapshot.mockReturnValue(delayedPromise)

    renderTab()

    // UI exibe skeleton enquanto getSnapshot está pendente
    expect(screen.getByTestId('system-data-loading-skeleton')).toBeTruthy()

    // Evento com revisão 20 chega enquanto getSnapshot está retido
    const eventSnapshotRev20 = createSampleSnapshot({
      revision: 20,
      observedGeneration: 'gen-fresh-20',
    })

    act(() => {
      capturedCallback?.(eventSnapshotRev20)
    })

    // UI agora exibe Revisão #20 a partir do evento
    await waitFor(() => {
      expect(screen.getByText('Revisão #20')).toBeTruthy()
    })
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-fresh-20',
    )

    // Agora resolve a consulta atrasada de getSnapshot com revisão 10
    const delayedSnapshotRev10 = createSampleSnapshot({
      revision: 10,
      observedGeneration: 'gen-stale-10',
    })

    await act(async () => {
      resolveDelayedFetch({
        isSuccess: true,
        statusCode: 200,
        data: delayedSnapshotRev10,
      })
    })

    // UI e cache DEVEM PERMANECER na revisão 20! A resposta atrasada 10 deve ser rejeitada
    expect(screen.getByText('Revisão #20')).toBeTruthy()
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-fresh-20',
    )
    expect(screen.queryByText('Revisão #10')).toBeNull()
  })

  it('deterministico: query atrasada com falha funcional NAO apaga snapshot saudavel recebido por evento mais novo', async () => {
    let resolveDelayedFetch: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const delayedPromise = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveDelayedFetch = resolve
      },
    )

    let capturedCallback: ((payload: DiagnosticSnapshot) => void) | null = null
    hostBridgeMocks.eventsOn.mockImplementation(
      (channel: string, cb: (payload: DiagnosticSnapshot) => void) => {
        if (channel === 'diagnostics:snapshot-updated') {
          capturedCallback = cb
        }
        return vi.fn()
      },
    )

    // getSnapshot inicial retido
    hostBridgeMocks.getSnapshot.mockReturnValue(delayedPromise)

    renderTab()

    // Evento chega com snapshot válido e saudável
    const healthySnapshot = createSampleSnapshot({
      revision: 15,
      observedGeneration: 'gen-healthy-15',
    })

    act(() => {
      capturedCallback?.(healthySnapshot)
    })

    await waitFor(() => {
      expect(screen.getByText('Revisão #15')).toBeTruthy()
    })

    // Agora a consulta antiga resolve com FALHA FUNCIONAL (503 Service Unavailable)
    await act(async () => {
      resolveDelayedFetch({
        isSuccess: false,
        statusCode: 503,
        error: 'DISPATCHER_STARTING: serviço ainda não disponível',
      })
    })

    // O snapshot saudável NÃO deve ter sido apagado pela falha atrasada!
    expect(screen.getByText('Revisão #15')).toBeTruthy()
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-healthy-15',
    )
    expect(screen.queryByTestId('system-data-error-state')).toBeNull()
  })

  it('deterministico: consulta bootstrap de sessao A nunca antes observada retida nao sobrescreve sessao B recebida por evento', async () => {
    let resolveDelayedFetch: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const delayedPromise = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveDelayedFetch = resolve
      },
    )

    let capturedCallback: ((payload: DiagnosticSnapshot) => void) | null = null
    hostBridgeMocks.eventsOn.mockImplementation(
      (channel: string, cb: (payload: DiagnosticSnapshot) => void) => {
        if (channel === 'diagnostics:snapshot-updated') {
          capturedCallback = cb
        }
        return vi.fn()
      },
    )

    // Consulta bootstrap inicial de getSnapshot fica retida (sem nunca ter emitido sessão A)
    hostBridgeMocks.getSnapshot.mockReturnValue(delayedPromise)

    renderTab()

    // Evento da Sessão B chega e estabelece a sessão ativa e o cache
    const sessionBSnapshot = createSampleSnapshot({
      sessionId: 'session-B-active',
      revision: 1,
      observedGeneration: 'gen-B-1',
    })

    act(() => {
      capturedCallback?.(sessionBSnapshot)
    })

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-session-id').textContent).toBe(
        'session-B-active',
      )
    })

    // Agora resolve a consulta bootstrap atrasada da Sessão A
    await act(async () => {
      resolveDelayedFetch({
        isSuccess: true,
        statusCode: 200,
        data: createSampleSnapshot({
          sessionId: 'session-A-never-observed-before',
          revision: 50,
          observedGeneration: 'gen-A-old',
        }),
      })
    })

    // A UI e o cache DEVEM PERMANECER na Sessão B! A Sessão A antiga não pode aposentar a Sessão B
    expect(screen.getByTestId('lifecycle-session-id').textContent).toBe(
      'session-B-active',
    )
    expect(screen.queryByText('session-A-never-observed-before')).toBeNull()
  })

  it('deterministico: rejection normalizada em getSnapshot retorna ViewModel com erro sem disparar exception na query', async () => {
    // getSnapshot rejeita com erro de transporte IPC
    hostBridgeMocks.getSnapshot.mockRejectedValueOnce(
      new Error('IPC_TRANSPORT_ERROR: Conexão com processo main interrompida'),
    )

    renderTab()

    // O erro é tratado como ViewModel de falha funcional sem throw de controle
    await waitFor(() => {
      expect(screen.getByTestId('system-data-error-state')).toBeTruthy()
    })
    expect(
      screen.getByText(
        'IPC_TRANSPORT_ERROR: Conexão com processo main interrompida',
      ),
    ).toBeTruthy()
  })

  it('deterministico: troca de bridge no mesmo mount isola cache e impede contaminacao por promessa retida do bridge antigo', async () => {
    let resolveOldBridgeFetch: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const oldBridgePromise = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveOldBridgeFetch = resolve
      },
    )

    const bridgeA = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockReturnValue(oldBridgePromise),
        runChecks: vi.fn(),
        generateReport: vi.fn(),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    const bridgeB = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockResolvedValue({
          isSuccess: true,
          statusCode: 200,
          data: createSampleSnapshot({
            sessionId: 'session-bridge-B',
            revision: 99,
            observedGeneration: 'gen-bridge-B',
          }),
        }),
        runChecks: vi.fn(),
        generateReport: vi.fn(),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    activeBridgeInstance = bridgeA

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    // Componente wrapper que permite trocar o bridge no mesmo mount
    function ProviderSwitcher({
      currentBridge,
    }: {
      currentBridge: IHostBridge
    }) {
      activeBridgeInstance = currentBridge
      return (
        <QueryClientProvider client={queryClient}>
          <SystemDataSettingsTab />
        </QueryClientProvider>
      )
    }

    const { rerender } = render(<ProviderSwitcher currentBridge={bridgeA} />)

    // Bridge A está carregando
    expect(screen.getByTestId('system-data-loading-skeleton')).toBeTruthy()

    // Troca para Bridge B no mesmo mount
    rerender(<ProviderSwitcher currentBridge={bridgeB} />)

    // Bridge B resolve com Revisão #99
    await waitFor(() => {
      expect(screen.getByText('Revisão #99')).toBeTruthy()
    })
    expect(screen.getByTestId('lifecycle-session-id').textContent).toBe(
      'session-bridge-B',
    )

    // Agora resolve a promessa retida do Bridge A com sessão antiga
    await act(async () => {
      resolveOldBridgeFetch({
        isSuccess: true,
        statusCode: 200,
        data: createSampleSnapshot({
          sessionId: 'session-bridge-A',
          revision: 1,
          observedGeneration: 'gen-bridge-A',
        }),
      })
    })

    // Bridge B permanece 100% isolado na Revisão #99 e session-bridge-B!
    expect(screen.getByText('Revisão #99')).toBeTruthy()
    expect(screen.getByTestId('lifecycle-session-id').textContent).toBe(
      'session-bridge-B',
    )
    expect(screen.queryByText('session-bridge-A')).toBeNull()
  })

  it('deterministico: acao runChecks retida no bridge A nao limpa isChecking nem sobrescreve actionError da acao B apos troca de bridge', async () => {
    let resolveChecksA: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const checksPromiseA = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveChecksA = resolve
      },
    )

    let resolveChecksB: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const checksPromiseB = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveChecksB = resolve
      },
    )

    const bridgeA = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockResolvedValue({
          isSuccess: true,
          statusCode: 200,
          data: createSampleSnapshot({ sessionId: 'session-A', revision: 1 }),
        }),
        runChecks: vi.fn().mockReturnValue(checksPromiseA),
        generateReport: vi.fn(),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    const bridgeB = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockResolvedValue({
          isSuccess: true,
          statusCode: 200,
          data: createSampleSnapshot({ sessionId: 'session-B', revision: 2 }),
        }),
        runChecks: vi.fn().mockReturnValue(checksPromiseB),
        generateReport: vi.fn(),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    activeBridgeInstance = bridgeA

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    function ProviderSwitcher({
      currentBridge,
    }: {
      currentBridge: IHostBridge
    }) {
      activeBridgeInstance = currentBridge
      return (
        <QueryClientProvider client={queryClient}>
          <SystemDataSettingsTab />
        </QueryClientProvider>
      )
    }

    const { rerender } = render(<ProviderSwitcher currentBridge={bridgeA} />)

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-check-now-btn')).toBeTruthy()
    })

    // Dispara ação no Bridge A (retida)
    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))
    expect(screen.getByText('Verificando...')).toBeTruthy()

    // Troca para o Bridge B no mesmo mount
    rerender(<ProviderSwitcher currentBridge={bridgeB} />)

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-check-now-btn')).toBeTruthy()
    })

    // Dispara ação no Bridge B (retida)
    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))
    expect(screen.getByText('Verificando...')).toBeTruthy()

    // Agora rejeita ou resolve a promessa retida do Bridge A com erro
    await act(async () => {
      resolveChecksA({
        isSuccess: false,
        statusCode: 500,
        error: 'BRIDGE_A_ERROR_STALE',
      })
    })

    // Bridge B DEVE CONTINUAR PENDENTE (isChecking = true) e seu erro NÃO deve ser 'BRIDGE_A_ERROR_STALE'
    expect(screen.getByText('Verificando...')).toBeTruthy()
    expect(screen.queryByText('BRIDGE_A_ERROR_STALE')).toBeNull()

    // Agora resolve a promessa do Bridge B com sucesso
    await act(async () => {
      resolveChecksB({
        isSuccess: true,
        statusCode: 200,
        data: createSampleSnapshot({ sessionId: 'session-B', revision: 3 }),
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Verificar agora')).toBeTruthy()
    })
  })

  it('deterministico: acao generateReport retida no bridge A nao limpa isExporting nem sobrescreve actionError da acao B apos troca de bridge', async () => {
    let resolveExportA: (
      value: ViewModel<SanitizedDiagnosticReport>,
    ) => void = () => {}
    const exportPromiseA = new Promise<ViewModel<SanitizedDiagnosticReport>>(
      (resolve) => {
        resolveExportA = resolve
      },
    )

    let resolveExportB: (
      value: ViewModel<SanitizedDiagnosticReport>,
    ) => void = () => {}
    const exportPromiseB = new Promise<ViewModel<SanitizedDiagnosticReport>>(
      (resolve) => {
        resolveExportB = resolve
      },
    )

    const bridgeA = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockResolvedValue({
          isSuccess: true,
          statusCode: 200,
          data: createSampleSnapshot({ sessionId: 'session-A', revision: 1 }),
        }),
        runChecks: vi.fn(),
        generateReport: vi.fn().mockReturnValue(exportPromiseA),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    const bridgeB = createMockBridge({
      diagnostics: {
        getSnapshot: vi.fn().mockResolvedValue({
          isSuccess: true,
          statusCode: 200,
          data: createSampleSnapshot({ sessionId: 'session-B', revision: 2 }),
        }),
        runChecks: vi.fn(),
        generateReport: vi.fn().mockReturnValue(exportPromiseB),
        openDataDirectory: vi.fn(),
      },
    } as unknown as Partial<IHostBridge>)

    activeBridgeInstance = bridgeA

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    function ProviderSwitcher({
      currentBridge,
    }: {
      currentBridge: IHostBridge
    }) {
      activeBridgeInstance = currentBridge
      return (
        <QueryClientProvider client={queryClient}>
          <SystemDataSettingsTab />
        </QueryClientProvider>
      )
    }

    const { rerender } = render(<ProviderSwitcher currentBridge={bridgeA} />)

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-copy-report-btn')).toBeTruthy()
    })

    // Dispara cópia no Bridge A
    fireEvent.click(screen.getByTestId('diagnostics-copy-report-btn'))
    const copyBtnA = screen.getByTestId('diagnostics-copy-report-btn')
    expect(copyBtnA.hasAttribute('disabled')).toBe(true)

    // Troca para o Bridge B no mesmo mount
    rerender(<ProviderSwitcher currentBridge={bridgeB} />)

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-copy-report-btn')).toBeTruthy()
    })

    // Dispara cópia no Bridge B
    fireEvent.click(screen.getByTestId('diagnostics-copy-report-btn'))
    const copyBtnB = screen.getByTestId('diagnostics-copy-report-btn')
    expect(copyBtnB.hasAttribute('disabled')).toBe(true)

    // Bridge A resolve com falha tardia
    await act(async () => {
      resolveExportA({
        isSuccess: false,
        statusCode: 500,
        error: 'BRIDGE_A_EXPORT_FAILED',
      })
    })

    // Bridge B continua pendente (disabled = true) e não tem erro do Bridge A
    expect(copyBtnB.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('BRIDGE_A_EXPORT_FAILED')).toBeNull()

    // Bridge B resolve com sucesso
    const mockReport: SanitizedDiagnosticReport = {
      formatVersion: '1.0',
      generatedAt: '2026-10-27T18:05:00.000Z',
      sessionId: 'session-B',
      appVersion: '1.2.0',
      platform: 'win32',
      snapshot: createSampleSnapshot({ sessionId: 'session-B', revision: 2 }),
      bootJournal: [],
    }

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    await act(async () => {
      resolveExportB({
        isSuccess: true,
        statusCode: 200,
        data: mockReport,
      })
    })

    await waitFor(() => {
      expect(copyBtnB.hasAttribute('disabled')).toBe(false)
    })
  })

  it('deterministico: Promise.reject real em runChecks restaura controles e nao deixa botao preso', async () => {
    const initialSnapshot = createSampleSnapshot({ revision: 1 })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: initialSnapshot,
    })

    // Rejeição REAL de Promise (ex: falha de canal IPC / processo morreu)
    hostBridgeMocks.runChecks.mockRejectedValueOnce(
      new Error(
        'IPC_CHANNEL_DESTROYED: Processo principal encerrou inesperadamente',
      ),
    )

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-check-now-btn')).toBeTruthy()
    })

    const checkBtn = screen.getByTestId('diagnostics-check-now-btn')

    // Dispara a checagem
    fireEvent.click(checkBtn)

    // O erro de transporte é exibido no banner de ação
    await waitFor(() => {
      expect(screen.getByTestId('system-data-action-error')).toBeTruthy()
      expect(
        screen.getByText(
          'IPC_CHANNEL_DESTROYED: Processo principal encerrou inesperadamente',
        ),
      ).toBeTruthy()
      expect(toast.error).toHaveBeenCalledWith(
        'IPC_CHANNEL_DESTROYED: Processo principal encerrou inesperadamente',
      )
    })

    // OS CONTROLES FORAM RESTAURADOS! O botão NÃO fica preso com spinner ou desabilitado
    expect(checkBtn.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Verificar agora')).toBeTruthy()
    expect(screen.queryByText('Verificando...')).toBeNull()
  })

  it('deterministico: Promise.reject real em generateReport/clipboard restaura controles', async () => {
    const snapshot = createSampleSnapshot()
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: snapshot,
    })

    // Rejeição REAL de Promise no generateReport
    hostBridgeMocks.generateReport.mockRejectedValueOnce(
      new Error('IPC_TIMEOUT_GENERATE_REPORT'),
    )

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-copy-report-btn')).toBeTruthy()
    })

    const copyBtn = screen.getByTestId('diagnostics-copy-report-btn')
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('IPC_TIMEOUT_GENERATE_REPORT')
      expect(screen.getByTestId('system-data-action-error')).toBeTruthy()
    })

    // Botão é restaurado e não fica preso
    expect(copyBtn.hasAttribute('disabled')).toBe(false)
  })

  it('consumes snapshot returned by runChecks directly and shows error banner on functional failure', async () => {
    const initialSnapshot = createSampleSnapshot({ revision: 1 })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: initialSnapshot,
    })

    // 1. Falha funcional de runChecks exibe toast e banner de erro visível
    hostBridgeMocks.runChecks.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 500,
      error: 'EXEC_PROBE_FAILED: timeout no canal IPC',
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-check-now-btn')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))

    await waitFor(() => {
      expect(hostBridgeMocks.runChecks).toHaveBeenCalledTimes(1)
      expect(toast.error).toHaveBeenCalledWith(
        'EXEC_PROBE_FAILED: timeout no canal IPC',
      )
      expect(screen.getByTestId('system-data-action-error')).toBeTruthy()
      expect(
        screen.getByText('EXEC_PROBE_FAILED: timeout no canal IPC'),
      ).toBeTruthy()
    })

    // 2. Sucesso consome o snapshot diretamente sem refetch redundante e limpa erro de ação
    const updatedSnapshot = createSampleSnapshot({
      revision: 2,
      observedGeneration: 'gen-fresh-2',
    })
    hostBridgeMocks.runChecks.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: updatedSnapshot,
    })

    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))

    await waitFor(() => {
      expect(screen.getByText('Revisão #2')).toBeTruthy()
      expect(screen.queryByTestId('system-data-action-error')).toBeNull()
    })
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-fresh-2',
    )
  })

  it('treats runChecks returning isSuccess: true without data as an explicit protocol violation error', async () => {
    const initialSnapshot = createSampleSnapshot({ revision: 1 })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: initialSnapshot,
    })

    // Violação de protocolo: isSuccess true mas sem data
    hostBridgeMocks.runChecks.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: undefined,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-check-now-btn')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('system-data-action-error')).toBeTruthy()
      expect(
        screen.getByText(
          'Violação de protocolo: runChecks reportou sucesso mas não retornou snapshot',
        ),
      ).toBeTruthy()
      expect(toast.error).toHaveBeenCalledWith(
        'Violação de protocolo: runChecks reportou sucesso mas não retornou snapshot',
      )
    })
  })

  it('discards delayed runChecks response if cache was advanced by newer event', async () => {
    let capturedCallback: ((payload: DiagnosticSnapshot) => void) | null = null
    hostBridgeMocks.eventsOn.mockImplementation(
      (channel: string, cb: (payload: DiagnosticSnapshot) => void) => {
        if (channel === 'diagnostics:snapshot-updated') {
          capturedCallback = cb
        }
        return vi.fn()
      },
    )

    const initialSnapshot = createSampleSnapshot({ revision: 5 })
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: initialSnapshot,
    })

    let resolveRunChecks: (
      value: ViewModel<DiagnosticSnapshot>,
    ) => void = () => {}
    const delayedRunChecksPromise = new Promise<ViewModel<DiagnosticSnapshot>>(
      (resolve) => {
        resolveRunChecks = resolve
      },
    )

    hostBridgeMocks.runChecks.mockReturnValue(delayedRunChecksPromise)

    renderTab()

    await waitFor(() => {
      expect(screen.getByText('Revisão #5')).toBeTruthy()
    })

    // Inicia verificação manual
    fireEvent.click(screen.getByTestId('diagnostics-check-now-btn'))

    // Enquanto runChecks está rodando, chega um evento com revisão 30
    act(() => {
      capturedCallback?.(
        createSampleSnapshot({
          revision: 30,
          observedGeneration: 'gen-fresh-30',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Revisão #30')).toBeTruthy()
    })

    // Agora o runChecks atrasado resolve com revisão 20 (< 30)
    await act(async () => {
      resolveRunChecks({
        isSuccess: true,
        statusCode: 200,
        data: createSampleSnapshot({
          revision: 20,
          observedGeneration: 'gen-stale-20',
        }),
      })
    })

    // A UI DEVE permanecer na revisão 30, sem regredir para 20!
    expect(screen.getByText('Revisão #30')).toBeTruthy()
    expect(screen.getByTestId('lifecycle-generation').textContent).toBe(
      'gen-fresh-30',
    )
    expect(screen.queryByText('Revisão #20')).toBeNull()
  })

  it('generates and copies sanitized report to clipboard and treats functional failure', async () => {
    const snapshot = createSampleSnapshot()
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: snapshot,
    })

    // Teste de falha funcional na exportação
    hostBridgeMocks.generateReport.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 500,
      error: 'VAULT_LOCKED: não foi possível sanitizar segredos',
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-copy-report-btn')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('diagnostics-copy-report-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'VAULT_LOCKED: não foi possível sanitizar segredos',
      )
    })

    // Teste de sucesso na exportação
    const mockReport: SanitizedDiagnosticReport = {
      formatVersion: '1.0',
      generatedAt: '2026-10-27T18:05:00.000Z',
      sessionId: 'session-xyz-123',
      appVersion: '1.2.0',
      platform: 'win32',
      snapshot,
      bootJournal: [],
    }
    hostBridgeMocks.generateReport.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockReport,
    })

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    fireEvent.click(screen.getByTestId('diagnostics-copy-report-btn'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        JSON.stringify(mockReport, null, 2),
      )
      expect(toast.success).toHaveBeenCalledWith(
        'Relatório de diagnóstico sanitizado copiado para a área de transferência.',
      )
    })
  })

  it('invokes bridge to open data directory and treats functional failure', async () => {
    const snapshot = createSampleSnapshot()
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: snapshot,
    })

    // Falha funcional
    hostBridgeMocks.openDataDirectory.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 404,
      error: 'DIR_NOT_FOUND',
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('diagnostics-open-folder-btn')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('diagnostics-open-folder-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('DIR_NOT_FOUND')
    })

    // Sucesso
    hostBridgeMocks.openDataDirectory.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
    })

    fireEvent.click(screen.getByTestId('diagnostics-open-folder-btn'))

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        'Diretório de dados aberto no gerenciador de arquivos.',
      )
    })
  })

  it('filters events by level and text search', async () => {
    const snapshot = createSampleSnapshot()
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: snapshot,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('system-events-card')).toBeTruthy()
    })

    expect(screen.getByTestId('event-item-1')).toBeTruthy()
    expect(screen.getByTestId('event-item-2')).toBeTruthy()
    expect(screen.getByTestId('event-item-3')).toBeTruthy()

    const searchInput = screen.getByTestId('events-search-input')
    fireEvent.change(searchInput, { target: { value: 'TASK_TIMEOUT' } })

    expect(screen.queryByTestId('event-item-1')).toBeNull()
    expect(screen.queryByTestId('event-item-2')).toBeNull()
    expect(screen.getByTestId('event-item-3')).toBeTruthy()
  })

  it('unsubscribes from events when unmounted (clean teardown)', async () => {
    const unsubMock = vi.fn()
    hostBridgeMocks.eventsOn.mockReturnValue(unsubMock)
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: createSampleSnapshot(),
    })

    const { unmount } = renderTab()

    await waitFor(() => {
      expect(screen.getByTestId('system-data-settings-tab')).toBeTruthy()
    })

    unmount()

    expect(unsubMock).toHaveBeenCalled()
  })
})
