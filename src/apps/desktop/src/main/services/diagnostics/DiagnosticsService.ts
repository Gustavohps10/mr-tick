import os from 'node:os'

import type {
  DiagnosticCheckResult,
  DiagnosticEvent,
  DiagnosticOperationalWorkspaceStatus,
  DiagnosticSnapshot,
  DiagnosticStorageAvailability,
  DiagnosticStorageItem,
  IMetadataDiagnosticAdapter,
  SanitizedDiagnosticReport,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { BrowserWindow, shell } from 'electron'

import type { LocalRuntimeDispatcher } from '../local-runtime/LocalRuntimeDispatcher'
import type { BootJournal } from './BootJournal'
import type { DiagnosticEventsBuffer } from './DiagnosticEventsBuffer'

interface BrowserStorageMeasurementRecord {
  measurement: DiagnosticStorageAvailability
  observedGeneration: string
}

export class DiagnosticsService {
  private revision = 0
  private lastChecks: DiagnosticCheckResult[] = []
  private lastWorkspaces: DiagnosticOperationalWorkspaceStatus[] = []
  private lastBrowserStorageMeasurement:
    BrowserStorageMeasurementRecord | undefined
  private lastChecksGeneration: string | undefined
  private inflightRunChecks: Promise<
    Either<AppError, DiagnosticSnapshot>
  > | null = null
  private readonly unsubscribeDiagnosticEvents: () => void

  constructor(
    private readonly dispatcher: LocalRuntimeDispatcher,
    private readonly metadataAdapter: IMetadataDiagnosticAdapter,
    private readonly eventsBuffer: DiagnosticEventsBuffer,
    private readonly bootJournal: BootJournal,
    private readonly userDataPath: string,
    private readonly sessionId: string,
    private readonly appVersion: string,
  ) {
    this.unsubscribeDiagnosticEvents = this.dispatcher.onDiagnosticEvent(
      (event) => {
        this.eventsBuffer.push(event)
        void this.publishUpdatedSnapshot()
      },
    )
  }

  dispose(): void {
    this.unsubscribeDiagnosticEvents()
  }

  async getSnapshot(): Promise<Either<AppError, DiagnosticSnapshot>> {
    this.revision += 1
    const revision = this.revision
    const emittedAt = new Date().toISOString()
    const dispatcherState = this.dispatcher.getDiagnosticState()

    const storages: DiagnosticStorageItem[] = []
    const metadataResult = await this.metadataAdapter.checkStorage()
    if (metadataResult.isSuccess()) {
      storages.push(metadataResult.success)
    }
    if (metadataResult.isFailure()) {
      storages.push({
        id: 'metadata-sqlite',
        name: 'Workspaces Metadata (SQLite)',
        role: 'metadata',
        technology: 'sqlite',
        measurement: {
          status: 'unavailable',
          reason: metadataResult.failure.messageKey,
          collectedAt: emittedAt,
        },
      })
    }

    if (this.lastBrowserStorageMeasurement !== undefined) {
      const isCurrentGeneration =
        this.lastBrowserStorageMeasurement.observedGeneration ===
        dispatcherState.generation

      if (isCurrentGeneration) {
        storages.push({
          id: 'browser-storage',
          name: 'Browser Origin Storage (Dexie / IndexedDB)',
          role: 'browser',
          technology: 'indexeddb',
          measurement: this.lastBrowserStorageMeasurement.measurement,
        })
      }
      if (!isCurrentGeneration) {
        storages.push({
          id: 'browser-storage',
          name: 'Browser Origin Storage (Dexie / IndexedDB)',
          role: 'browser',
          technology: 'indexeddb',
          measurement: {
            status: 'unavailable',
            reason: 'STORAGE_ESTIMATE_STALE_GENERATION',
            collectedAt:
              this.lastBrowserStorageMeasurement.measurement.collectedAt,
          },
        })
      }
    }

    let checks = this.lastChecks
    let workspaces = this.lastWorkspaces

    if (
      this.lastChecksGeneration !== undefined &&
      this.lastChecksGeneration !== dispatcherState.generation
    ) {
      checks = this.lastChecks.map((check) => {
        if (
          check.source === 'executor' ||
          check.id === 'probe-dispatcher-lifecycle'
        ) {
          return {
            ...check,
            status: 'unavailable',
            reason: 'STALE_GENERATION',
          }
        }
        return check
      })

      workspaces = this.lastWorkspaces.map((ws) => {
        if (ws.status === 'ready') {
          return {
            ...ws,
            status: 'unavailable',
          }
        }
        return ws
      })
    }

    const snapshot: DiagnosticSnapshot = {
      formatVersion: '1.0',
      sessionId: this.sessionId,
      revision,
      emittedAt,
      observedGeneration: dispatcherState.generation,
      dispatcher: dispatcherState,
      checks,
      storages,
      workspaces,
      recentEvents: this.eventsBuffer.getEvents(),
      discardedEventsCount: this.eventsBuffer.getDiscardedCount(),
    }

    return Either.success(snapshot)
  }

  async runChecks(): Promise<Either<AppError, DiagnosticSnapshot>> {
    if (this.inflightRunChecks !== null) {
      return this.inflightRunChecks
    }
    const task = this.executeRunChecks()
    this.inflightRunChecks = task
    try {
      return await task
    } finally {
      this.inflightRunChecks = null
    }
  }

  async generateReport(): Promise<Either<AppError, SanitizedDiagnosticReport>> {
    const flushResult = await this.bootJournal.flush()

    const snapshotResult = await this.getSnapshot()
    if (snapshotResult.isFailure()) {
      return snapshotResult.forwardFailure()
    }

    const currentJournalResult = await this.bootJournal.readCurrentJournal()
    const previousJournalResult = await this.bootJournal.readPreviousJournal()

    let snapshot = snapshotResult.success
    const extraChecks: DiagnosticCheckResult[] = []

    if (flushResult.isFailure()) {
      extraChecks.push({
        id: 'probe-boot-journal-flush',
        name: 'Boot Journal Flush Pending Writes',
        capability: 'journal.write',
        source: 'main',
        scope: { type: 'application' },
        status: 'unavailable',
        reason: flushResult.failure.messageKey,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }

    if (currentJournalResult.isFailure()) {
      extraChecks.push({
        id: 'probe-current-boot-journal',
        name: 'Current Boot Journal Read',
        capability: 'journal.read',
        source: 'main',
        scope: { type: 'application' },
        status: 'unavailable',
        reason: currentJournalResult.failure.messageKey,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }

    if (previousJournalResult.isFailure()) {
      extraChecks.push({
        id: 'probe-previous-boot-journal',
        name: 'Previous Boot Journal Read',
        capability: 'journal.read',
        source: 'main',
        scope: { type: 'application' },
        status: 'unavailable',
        reason: previousJournalResult.failure.messageKey,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }

    if (extraChecks.length > 0) {
      snapshot = {
        ...snapshot,
        checks: [...snapshot.checks, ...extraChecks],
      }
    }

    const sanitizedSnapshot = this.sanitizeSnapshotPaths(snapshot)

    const currentEvents = currentJournalResult.isSuccess()
      ? currentJournalResult.success
      : []
    const previousEvents = previousJournalResult.isSuccess()
      ? previousJournalResult.success
      : []

    const sanitizeEvents = (events: DiagnosticEvent[]): DiagnosticEvent[] =>
      events.map((event) => ({
        sequence: event.sequence,
        sessionId: event.sessionId,
        generation: event.generation,
        origin: event.origin,
        level: event.level,
        stage: this.sanitizeString(event.stage),
        scope: event.scope,
        correlationId: event.correlationId,
        code:
          event.code !== undefined
            ? this.sanitizeString(event.code)
            : undefined,
        message: this.sanitizeString(event.message),
        timestamp: event.timestamp,
      }))

    const sanitizedCurrent = sanitizeEvents(currentEvents)
    const sanitizedPrevious = sanitizeEvents(previousEvents)

    const report: SanitizedDiagnosticReport = {
      formatVersion: '1.0',
      generatedAt: new Date().toISOString(),
      sessionId: this.sessionId,
      appVersion: this.appVersion,
      platform: process.platform,
      snapshot: sanitizedSnapshot,
      bootJournal: sanitizedCurrent,
      previousBootJournal: sanitizedPrevious,
    }

    return Either.success(report)
  }

  async openDataDirectory(): Promise<Either<AppError, void>> {
    try {
      const result = await shell.openPath(this.userDataPath)
      if (result && result.trim().length > 0) {
        return Either.failure(AppError.Internal(result))
      }
      return Either.success()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'FAILED_TO_OPEN_DATA_DIRECTORY'
      return Either.failure(AppError.Internal(message))
    }
  }

  private async executeRunChecks(): Promise<
    Either<AppError, DiagnosticSnapshot>
  > {
    const checks: DiagnosticCheckResult[] = []

    const metadataProbe = await this.metadataAdapter.readProbe()
    if (metadataProbe.isSuccess()) {
      checks.push(metadataProbe.success)
    }
    if (metadataProbe.isFailure()) {
      checks.push({
        id: 'probe-metadata-read',
        name: 'Metadata Storage Read Probe',
        capability: 'metadata.read',
        source: 'metadata',
        scope: { type: 'application' },
        status: 'fail',
        reason: metadataProbe.failure.messageKey,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }

    const mainState = this.dispatcher.getState()
    const mainCheckStartedAt = new Date().toISOString()
    if (mainState === 'ready') {
      checks.push({
        id: 'probe-dispatcher-lifecycle',
        name: 'Main Process Dispatcher Lifecycle',
        capability: 'dispatcher.lifecycle',
        source: 'main',
        scope: { type: 'application' },
        status: 'pass',
        provenOperation: 'dispatcher_ready_observed',
        startedAt: mainCheckStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }
    if (mainState !== 'ready') {
      checks.push({
        id: 'probe-dispatcher-lifecycle',
        name: 'Main Process Dispatcher Lifecycle',
        capability: 'dispatcher.lifecycle',
        source: 'main',
        scope: { type: 'application' },
        status: mainState === 'closed' ? 'fail' : 'unavailable',
        reason: `Dispatcher is currently in ${mainState} state`,
        startedAt: mainCheckStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      })
    }

    const executorProbeStartTime = Date.now()
    const executorProbeStartedAt = new Date().toISOString()
    const probeResponse = await this.dispatcher.probeExecutor(5000)
    const executorProbeFinishedAt = new Date().toISOString()
    const executorProbeDurationMs = Math.max(
      0,
      Date.now() - executorProbeStartTime,
    )

    if (probeResponse.ok) {
      this.lastWorkspaces = probeResponse.value.workspaces
      this.lastBrowserStorageMeasurement = {
        measurement: probeResponse.value.storageEstimate,
        observedGeneration: probeResponse.value.observedGeneration,
      }
      checks.push({
        id: 'probe-executor-responsiveness',
        name: 'Local Runtime Executor Process',
        capability: 'executor.responsiveness',
        source: 'executor',
        scope: { type: 'application' },
        status: 'pass',
        provenOperation: 'executor_diagnostic_probe_reply',
        startedAt: executorProbeStartedAt,
        finishedAt: executorProbeFinishedAt,
        durationMs: executorProbeDurationMs,
      })

      for (const opCheck of probeResponse.value.operationalReadChecks) {
        checks.push(opCheck)
      }
    }
    if (!probeResponse.ok) {
      checks.push({
        id: 'probe-executor-responsiveness',
        name: 'Local Runtime Executor Process',
        capability: 'executor.responsiveness',
        source: 'executor',
        scope: { type: 'application' },
        status: probeResponse.error.statusCode === 503 ? 'unavailable' : 'fail',
        reason: probeResponse.error.messageKey,
        startedAt: executorProbeStartedAt,
        finishedAt: executorProbeFinishedAt,
        durationMs: executorProbeDurationMs,
      })
    }

    this.lastChecks = checks
    this.lastChecksGeneration = probeResponse.ok
      ? probeResponse.value.observedGeneration
      : this.dispatcher.getDiagnosticState().generation

    const snapshotResult = await this.getSnapshot()
    if (snapshotResult.isSuccess()) {
      this.broadcastSnapshot(snapshotResult.success)
    }
    return snapshotResult
  }

  private async publishUpdatedSnapshot(): Promise<void> {
    const snapshotResult = await this.getSnapshot()
    if (snapshotResult.isSuccess()) {
      this.broadcastSnapshot(snapshotResult.success)
    }
  }

  private broadcastSnapshot(snapshot: DiagnosticSnapshot): void {
    for (const client of BrowserWindow.getAllWindows()) {
      if (client.isDestroyed()) continue
      if (client.windowType !== 'main' && client.windowType !== 'widget')
        continue
      client.webContents.send('diagnostics:snapshot-updated', snapshot)
    }
  }

  private sanitizeSnapshotPaths(
    snapshot: DiagnosticSnapshot,
  ): DiagnosticSnapshot {
    return {
      ...snapshot,
      dispatcher: {
        ...snapshot.dispatcher,
        lastStartupFailure:
          snapshot.dispatcher.lastStartupFailure !== undefined
            ? {
                ...snapshot.dispatcher.lastStartupFailure,
                stage: this.sanitizeString(
                  snapshot.dispatcher.lastStartupFailure.stage,
                ),
                messageKey: this.sanitizeString(
                  snapshot.dispatcher.lastStartupFailure.messageKey,
                ),
              }
            : undefined,
      },
      checks: snapshot.checks.map((check) => {
        if (check.status === 'pass') {
          return {
            ...check,
            name: this.sanitizeString(check.name),
            provenOperation: this.sanitizeString(check.provenOperation),
          }
        }
        return {
          ...check,
          name: this.sanitizeString(check.name),
          reason: this.sanitizeString(check.reason),
        }
      }),
      storages: snapshot.storages.map((storage) => {
        let location = storage.location
        if (location !== undefined) location = this.sanitizeString(location)

        let measurement = storage.measurement
        if (
          measurement.status === 'available' &&
          measurement.overlappingTargets !== undefined
        ) {
          measurement = {
            ...measurement,
            overlappingTargets: measurement.overlappingTargets.map((target) =>
              this.sanitizeString(target),
            ),
          }
        }
        if (measurement.status !== 'available') {
          measurement = {
            ...measurement,
            reason: this.sanitizeString(measurement.reason),
          }
        }
        return {
          ...storage,
          location,
          measurement,
        }
      }),
      workspaces: snapshot.workspaces.map((ws) => ({
        ...ws,
        receipts:
          ws.receipts !== undefined
            ? ws.receipts.status !== 'available'
              ? {
                  ...ws.receipts,
                  reason: this.sanitizeString(ws.receipts.reason),
                }
              : ws.receipts
            : undefined,
        replication:
          ws.replication !== undefined
            ? ws.replication.status === 'available'
              ? {
                  ...ws.replication,
                  items: ws.replication.items.map((item) => ({
                    ...item,
                    key: this.sanitizeString(item.key),
                  })),
                }
              : {
                  ...ws.replication,
                  reason: this.sanitizeString(ws.replication.reason),
                }
            : undefined,
      })),
      recentEvents: snapshot.recentEvents.map((event) => ({
        ...event,
        stage: this.sanitizeString(event.stage),
        code:
          event.code !== undefined
            ? this.sanitizeString(event.code)
            : undefined,
        message: this.sanitizeString(event.message),
      })),
    }
  }

  private sanitizeString(input: string): string {
    let result = input
    const homeDir = os.homedir()
    if (homeDir && homeDir.length > 0) {
      result = result.replaceAll(homeDir, '<USER_HOME>')
      const normalizedHome = homeDir.replace(/\\/g, '/')
      result = result.replaceAll(normalizedHome, '<USER_HOME>')
    }
    result = result
      .replace(/[A-Za-z]:\\Users\\[^\\]+/g, '<USER_HOME>')
      .replace(/\/Users\/[^\/]+/g, '<USER_HOME>')
      .replace(/\/home\/[^\/]+/g, '<USER_HOME>')
      .replace(/bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      .replace(/token[=:][\s]*['"]?[a-zA-Z0-9_\-.]+['"]?/gi, 'token=[REDACTED]')
      .replace(/password[=:][\s]*['"]?[^\s'"]+['"]?/gi, 'password=[REDACTED]')
      .replace(/key[=:][\s]*['"]?[a-zA-Z0-9_\-.]+['"]?/gi, 'key=[REDACTED]')
      .replace(
        /secret[=:][\s]*['"]?[a-zA-Z0-9_\-.]+['"]?/gi,
        'secret=[REDACTED]',
      )
      .replace(/https?:\/\/[^\s?]+\?[^\s]*/gi, (match) => {
        const urlWithoutQuery = match.split('?')[0]
        return urlWithoutQuery + '?[REDACTED_PARAMS]'
      })
    return result
  }
}
