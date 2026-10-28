import os from 'node:os'
import path from 'node:path'

import type {
  DiagnosticCheckResult,
  DiagnosticStorageItem,
  IMetadataDiagnosticAdapter,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { shell } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalRuntimeDispatcher } from '../local-runtime/LocalRuntimeDispatcher'
import { BootJournal } from './BootJournal'
import { DiagnosticEventsBuffer } from './DiagnosticEventsBuffer'
import { DiagnosticsService } from './DiagnosticsService'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
}))

describe('DiagnosticsService', () => {
  let mockDispatcher: LocalRuntimeDispatcher
  let mockMetadataAdapter: IMetadataDiagnosticAdapter
  let eventsBuffer: DiagnosticEventsBuffer
  let bootJournal: BootJournal
  const userDataPath = path.join(os.homedir(), '.mr-tick-test')
  const sessionId = 'test-session-1'

  beforeEach(() => {
    vi.clearAllMocks()
    mockDispatcher = {
      getState: vi.fn(() => 'ready'),
      getDiagnosticState: vi.fn(() => ({
        state: 'ready',
        generation: 'gen-123',
        startupStage: 'ready',
        pendingRequestsByChannel: {
          core: 0,
          runtime: 0,
          persistence: 0,
          sync: 0,
          diagnosticProbe: 0,
        },
      })),
      onDiagnosticEvent: vi.fn(() => vi.fn()),
      probeExecutor: vi.fn(async () => ({
        ok: true,
        value: {
          observedGeneration: 'gen-123',
          workspaces: [
            { workspaceId: 'ws-1', status: 'ready' as const, hasDb: true },
          ],
          storageEstimate: {
            status: 'available' as const,
            bytes: 2048,
            precision: 'estimated' as const,
            coverage: 'origin' as const,
            unit: 'bytes' as const,
            collectedAt: new Date().toISOString(),
          },
          operationalReadChecks: [
            {
              id: 'probe-workspace-storage-ws-1',
              name: 'Workspace Storage Physical Probe (ws-1)',
              capability: 'storage.read',
              source: 'executor',
              scope: { type: 'workspace', workspaceId: 'ws-1' },
              status: 'pass',
              provenOperation: 'rxdb_time_entries_read',
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: 3,
            },
          ],
        },
      })),
    } as unknown as LocalRuntimeDispatcher

    mockMetadataAdapter = {
      checkStorage: vi.fn(async () =>
        Either.success<DiagnosticStorageItem>({
          id: 'metadata-sqlite',
          name: 'Workspaces Metadata',
          role: 'metadata',
          technology: 'sqlite',
          location: path.join(userDataPath, 'workspaces.sqlite'),
          measurement: {
            status: 'available',
            bytes: 4096,
            precision: 'exact',
            coverage: 'file',
            unit: 'bytes',
            collectedAt: new Date().toISOString(),
          },
        }),
      ),
      readProbe: vi.fn(async () =>
        Either.success<DiagnosticCheckResult>({
          id: 'probe-metadata-read',
          name: 'Metadata Read Probe',
          capability: 'metadata.read',
          source: 'metadata',
          scope: { type: 'application' },
          status: 'pass',
          provenOperation: 'read_workspaces_count',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 2,
        }),
      ),
    }

    eventsBuffer = new DiagnosticEventsBuffer(sessionId)
    bootJournal = {
      initialize: vi.fn(async () => undefined),
      recordPhase: vi.fn(),
      readCurrentJournal: vi.fn(async () =>
        Either.success([
          {
            sequence: 1,
            sessionId,
            origin: 'boot' as const,
            level: 'info' as const,
            stage: 'boot:start',
            message: `Started at ${userDataPath}`,
            timestamp: new Date().toISOString(),
          },
        ]),
      ),
      readPreviousJournal: vi.fn(async () => Either.success([])),
      flush: vi.fn(async () => Either.success()),
    } as unknown as BootJournal
  })

  it('aggregates snapshot with metadata storage, dispatcher state and recent events', async () => {
    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )
    eventsBuffer.record({
      origin: 'main',
      level: 'info',
      stage: 'init',
      message: 'Test event',
    })

    const result = await service.getSnapshot()
    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.formatVersion).toBe('1.0')
      expect(result.success.sessionId).toBe(sessionId)
      expect(result.success.revision).toBe(1)
      expect(result.success.observedGeneration).toBe('gen-123')
      expect(result.success.storages).toHaveLength(1)
      expect(result.success.storages[0]?.id).toBe('metadata-sqlite')
      expect(result.success.recentEvents).toHaveLength(1)
      expect(result.success.recentEvents[0]?.message).toBe('Test event')
    }
  })

  it('executes probes and returns diagnostic snapshot with real check results', async () => {
    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const checksResult = await service.runChecks()
    expect(checksResult.isSuccess()).toBe(true)
    if (checksResult.isSuccess()) {
      expect(checksResult.success.formatVersion).toBe('1.0')
      expect(checksResult.success.observedGeneration).toBe('gen-123')
      expect(checksResult.success.checks).toHaveLength(4)

      const metadataCheck = checksResult.success.checks.find(
        (c) => c.source === 'metadata',
      )
      expect(metadataCheck?.status).toBe('pass')

      const executorCheck = checksResult.success.checks.find(
        (c) => c.id === 'probe-executor-responsiveness',
      )
      expect(executorCheck?.status).toBe('pass')

      const rxdbCheck = checksResult.success.checks.find(
        (c) => c.id === 'probe-workspace-storage-ws-1',
      )
      expect(rxdbCheck?.status).toBe('pass')
      if (rxdbCheck && rxdbCheck.status === 'pass') {
        expect(rxdbCheck.provenOperation).toBe('rxdb_time_entries_read')
        expect(rxdbCheck.scope).toEqual({
          type: 'workspace',
          workspaceId: 'ws-1',
        })
      }
    }
  })

  it('handles unavailable executor without discarding metadata results', async () => {
    mockDispatcher.probeExecutor = vi.fn(async () => ({
      ok: false as const,
      error: { messageKey: 'localRuntime.notReady', statusCode: 503 },
    }))

    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const checksResult = await service.runChecks()
    expect(checksResult.isSuccess()).toBe(true)
    if (checksResult.isSuccess()) {
      expect(checksResult.success.checks).toHaveLength(3)
      const metadataCheck = checksResult.success.checks.find(
        (c) => c.source === 'metadata',
      )
      expect(metadataCheck?.status).toBe('pass')
      const executorCheck = checksResult.success.checks.find(
        (c) => c.source === 'executor',
      )
      expect(executorCheck?.status).toBe('unavailable')
      if (executorCheck && executorCheck.status !== 'pass') {
        expect(executorCheck.reason).toBe('localRuntime.notReady')
      }
    }
  })

  it('generates sanitized report replacing home directory with placeholder', async () => {
    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const reportResult = await service.generateReport()
    expect(reportResult.isSuccess()).toBe(true)
    if (reportResult.isSuccess()) {
      expect(reportResult.success.formatVersion).toBe('1.0')
      expect(reportResult.success.appVersion).toBe('1.0.0')
      const homeDir = os.homedir()
      const storageLocation =
        reportResult.success.snapshot.storages[0]?.location
      expect(storageLocation).toBeDefined()
      if (storageLocation) {
        expect(storageLocation).not.toContain(homeDir)
        expect(storageLocation).toContain('<USER_HOME>')
      }
      const journalMsg = reportResult.success.bootJournal[0]?.message
      expect(journalMsg).not.toContain(homeDir)
      expect(journalMsg).toContain('<USER_HOME>')
    }
  })

  it('preserves remaining report and adds unavailable check when journal read or flush fails', async () => {
    const failingBootJournal = {
      initialize: vi.fn(async () => undefined),
      recordPhase: vi.fn(),
      readCurrentJournal: vi.fn(async () =>
        Either.failure(
          AppError.Internal('BOOT_JOURNAL_CORRUPT_JSON at line 3'),
        ),
      ),
      readPreviousJournal: vi.fn(async () => Either.success([])),
      flush: vi.fn(async () =>
        Either.failure(AppError.Internal('FILE_APPEND_ERROR')),
      ),
    } as unknown as BootJournal

    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      failingBootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const reportResult = await service.generateReport()
    expect(reportResult.isSuccess()).toBe(true)
    if (reportResult.isSuccess()) {
      expect(reportResult.success.formatVersion).toBe('1.0')
      expect(reportResult.success.bootJournal).toEqual([])

      const flushCheck = reportResult.success.snapshot.checks.find(
        (c) => c.id === 'probe-boot-journal-flush',
      )
      expect(flushCheck).toBeDefined()
      expect(flushCheck?.status).toBe('unavailable')
      if (flushCheck && flushCheck.status !== 'pass') {
        expect(flushCheck.reason).toBe('FILE_APPEND_ERROR')
      }

      const currentJournalCheck = reportResult.success.snapshot.checks.find(
        (c) => c.id === 'probe-current-boot-journal',
      )
      expect(currentJournalCheck).toBeDefined()
      expect(currentJournalCheck?.status).toBe('unavailable')
      if (currentJournalCheck && currentJournalCheck.status !== 'pass') {
        expect(currentJournalCheck.reason).toBe(
          'BOOT_JOURNAL_CORRUPT_JSON at line 3',
        )
      }
    }
  })

  it('opens data directory via electron shell without accepting UI path', async () => {
    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const result = await service.openDataDirectory()
    expect(result.isSuccess()).toBe(true)
    expect(shell.openPath).toHaveBeenCalledWith(userDataPath)
  })

  it('prevents stale snapshot superseding newer snapshot across generation change', async () => {
    let generation = 'generation-A'
    mockDispatcher.getDiagnosticState = vi.fn(() => ({
      state: 'ready' as const,
      generation,
      startupStage: 'ready',
      pendingRequestsByChannel: {
        core: 0,
        runtime: 0,
        persistence: 0,
        sync: 0,
        diagnosticProbe: 0,
      },
    }))

    let releaseOld: (
      value: Either<AppError, DiagnosticStorageItem>,
    ) => void = () => {}
    let calls = 0
    mockMetadataAdapter.checkStorage = vi.fn(() => {
      calls += 1
      if (calls === 1) {
        return new Promise<Either<AppError, DiagnosticStorageItem>>(
          (resolve) => {
            releaseOld = resolve
          },
        )
      }
      return Promise.resolve(
        Either.success<DiagnosticStorageItem>({
          id: 'metadata-sqlite',
          name: 'Workspaces Metadata',
          role: 'metadata',
          technology: 'sqlite',
          measurement: {
            status: 'available',
            bytes: 1024,
            precision: 'exact',
            coverage: 'file',
            unit: 'bytes',
            collectedAt: new Date().toISOString(),
          },
        }),
      )
    })

    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const oldPending = service.getSnapshot()
    generation = 'generation-B'
    const newResult = await service.getSnapshot()

    releaseOld(
      Either.success<DiagnosticStorageItem>({
        id: 'metadata-sqlite',
        name: 'Workspaces Metadata',
        role: 'metadata',
        technology: 'sqlite',
        measurement: {
          status: 'available',
          bytes: 1024,
          precision: 'exact',
          coverage: 'file',
          unit: 'bytes',
          collectedAt: new Date().toISOString(),
        },
      }),
    )
    const oldResult = await oldPending

    expect(newResult.isSuccess()).toBe(true)
    expect(oldResult.isSuccess()).toBe(true)

    if (newResult.isSuccess() && oldResult.isSuccess()) {
      const newer = newResult.success
      const older = oldResult.success
      expect(newer.observedGeneration).toBe('generation-B')
      expect(older.observedGeneration).toBe('generation-A')
      expect(older.revision).toBeLessThan(newer.revision)
      const staleSupersedes =
        older.observedGeneration !== generation &&
        older.revision >= newer.revision
      expect(staleSupersedes).toBe(false)
    }
  })

  it('coalesces concurrent runChecks calls into a single in-flight operation', async () => {
    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    const [first, second] = await Promise.all([
      service.runChecks(),
      service.runChecks(),
    ])

    expect(first.isSuccess()).toBe(true)
    expect(second.isSuccess()).toBe(true)
    expect(mockDispatcher.probeExecutor).toHaveBeenCalledTimes(1)
  })

  it('invalidates runtime-dependent checks across generation change', async () => {
    let currentGen = 'generation-A'
    let currentState: 'ready' | 'closed' | 'restarting' = 'ready'

    mockDispatcher.getState = vi.fn(() => currentState)
    mockDispatcher.getDiagnosticState = vi.fn(() => ({
      state: currentState,
      generation: currentGen,
      startupStage: currentState,
      pendingRequestsByChannel: {},
    }))
    mockDispatcher.probeExecutor = vi.fn(async () => ({
      ok: true as const,
      value: {
        observedGeneration: currentGen,
        workspaces: [
          { workspaceId: 'ws-1', status: 'ready' as const, hasDb: true },
        ],
        storageEstimate: {
          status: 'available' as const,
          bytes: 1024,
          precision: 'estimated' as const,
          coverage: 'origin' as const,
          unit: 'bytes' as const,
          collectedAt: new Date().toISOString(),
        },
        operationalReadChecks: [
          {
            id: 'probe-workspace-storage-ws-1',
            name: 'Workspace Storage Physical Probe (ws-1)',
            capability: 'storage.read' as const,
            source: 'executor' as const,
            scope: { type: 'workspace' as const, workspaceId: 'ws-1' },
            status: 'pass' as const,
            provenOperation: 'rxdb_time_entries_read',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: 1,
          },
        ],
      },
    }))

    const service = new DiagnosticsService(
      mockDispatcher,
      mockMetadataAdapter,
      eventsBuffer,
      bootJournal,
      userDataPath,
      sessionId,
      '1.0.0',
    )

    // Run checks in gen A where state is ready
    const resA = await service.runChecks()
    expect(resA.isSuccess()).toBe(true)
    if (resA.isSuccess()) {
      const lifecycleA = resA.success.checks.find(
        (c) => c.id === 'probe-dispatcher-lifecycle',
      )
      expect(lifecycleA?.status).toBe('pass')
    }

    // Now generation changes to B (restarting) without runChecks being called yet
    currentGen = 'generation-B'
    currentState = 'restarting'
    const snapB = await service.getSnapshot()
    expect(snapB.isSuccess()).toBe(true)
    if (snapB.isSuccess()) {
      const lifecycleB = snapB.success.checks.find(
        (c) => c.id === 'probe-dispatcher-lifecycle',
      )
      expect(lifecycleB?.status).toBe('unavailable')
      if (lifecycleB && lifecycleB.status !== 'pass') {
        expect(lifecycleB.reason).toBe('STALE_GENERATION')
      }

      const execB = snapB.success.checks.find(
        (c) => c.id === 'probe-executor-responsiveness',
      )
      expect(execB?.status).toBe('unavailable')
      if (execB && execB.status !== 'pass') {
        expect(execB.reason).toBe('STALE_GENERATION')
      }

      // Metadata check remains pass because it is independent of runtime generation
      const metaB = snapB.success.checks.find((c) => c.source === 'metadata')
      expect(metaB?.status).toBe('pass')
    }

    // Test A fail -> B ready: runChecks in gen A when failed, then gen C ready should not carry old failure
    currentState = 'closed'
    mockDispatcher.probeExecutor = vi.fn(async () => ({
      ok: false as const,
      error: { messageKey: 'localRuntime.closed', statusCode: 503 },
    }))
    await service.runChecks()

    // Now switch to gen C ready without runChecks
    currentGen = 'generation-C'
    currentState = 'ready'
    const snapC = await service.getSnapshot()
    expect(snapC.isSuccess()).toBe(true)
    if (snapC.isSuccess()) {
      const lifecycleC = snapC.success.checks.find(
        (c) => c.id === 'probe-dispatcher-lifecycle',
      )
      expect(lifecycleC?.status).toBe('unavailable')
      if (lifecycleC && lifecycleC.status !== 'pass') {
        expect(lifecycleC.reason).toBe('STALE_GENERATION')
      }

      const execC = snapC.success.checks.find(
        (c) => c.id === 'probe-executor-responsiveness',
      )
      expect(execC?.status).toBe('unavailable')
      if (execC && execC.status !== 'pass') {
        expect(execC.reason).toBe('STALE_GENERATION')
      }
    }
  })
})
