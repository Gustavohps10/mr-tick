import type {
  DiagnosticCheckResult,
  DiagnosticStorageItem,
  IAnalyticsDiagnosticAdapter,
  IWorkspacesRepository,
} from '@mr-tick/application'
import {
  type AppError,
  Either,
  type FieldErrors,
} from '@mr-tick/shared/helpers'

import type {
  AnalyticsStorageDirectoryEntry,
  DuckDBAnalyticsEngine,
} from './DuckDBAnalyticsEngine'

const WORKSPACES_PAGE_SIZE = 50

interface MatchedWorkspaceStorage {
  workspaceId: string
  workspaceName: string
  entry: AnalyticsStorageDirectoryEntry
}

interface WorkspaceScanOutcome {
  matched: MatchedWorkspaceStorage[]
  orphans: AnalyticsStorageDirectoryEntry[]
}

export class AnalyticsDiagnosticAdapter implements IAnalyticsDiagnosticAdapter {
  constructor(
    private readonly analyticsEngine: DuckDBAnalyticsEngine,
    private readonly workspacesRepository: IWorkspacesRepository,
  ) {}

  private async scanEntries(): Promise<Either<AppError, WorkspaceScanOutcome>> {
    const entriesResult = await this.analyticsEngine.listStorageEntries()
    if (entriesResult.isFailure()) return entriesResult.forwardFailure()

    if (entriesResult.success.length === 0)
      return Either.success({ matched: [], orphans: [] })

    const entryByHash = new Map<string, AnalyticsStorageDirectoryEntry>()

    for (const entry of entriesResult.success)
      entryByHash.set(entry.hash, entry)

    const matched: MatchedWorkspaceStorage[] = []
    const matchedHashes = new Set<string>()
    let page = 1

    while (true) {
      const paged = await this.workspacesRepository.list(
        {},
        { page, pageSize: WORKSPACES_PAGE_SIZE },
      )
      if (paged.isFailure()) return paged.forwardFailure()

      for (const workspace of paged.success.items) {
        const paths = this.analyticsEngine.storagePaths(workspace.id)
        const entry = entryByHash.get(paths.hash)
        if (entry === undefined) continue

        matchedHashes.add(paths.hash)
        matched.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          entry,
        })
      }

      if (
        paged.success.items.length === 0 ||
        page * paged.success.pageSize >= paged.success.total
      )
        break

      page += 1
    }

    const orphans = entriesResult.success.filter(
      (entry) => !matchedHashes.has(entry.hash),
    )

    return Either.success({ matched, orphans })
  }

  public async checkStorages(): Promise<
    Either<AppError, DiagnosticStorageItem[]>
  > {
    const scanned = await this.scanEntries()
    if (scanned.isFailure()) return scanned.forwardFailure()

    const collectedAt = new Date().toISOString()
    const items: DiagnosticStorageItem[] = []

    for (const target of scanned.success.matched) {
      const inspected = await this.analyticsEngine.inspectWorkspaceStorage(
        target.workspaceId,
      )

      if (inspected.isFailure()) {
        items.push({
          id: `analytics-${target.workspaceId}`,
          name: `Analytics (${target.workspaceName})`,
          role: 'analytics',
          technology: 'duckdb',
          location: target.entry.dbPath,
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          canReset: true,
          measurement: {
            status: 'error',
            reason: inspected.failure.messageKey,
            details: inspected.failure.details,
            collectedAt,
          },
        })
        continue
      }

      if (!inspected.success.exists) continue

      if (inspected.success.healthy) {
        items.push({
          id: `analytics-${target.workspaceId}`,
          name: `Analytics (${target.workspaceName})`,
          role: 'analytics',
          technology: 'duckdb',
          location: inspected.success.dbPath,
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          canReset: true,
          measurement: {
            status: 'available',
            bytes: inspected.success.bytes,
            precision: 'exact',
            coverage: 'file',
            unit: 'bytes',
            collectedAt,
          },
        })
        continue
      }

      items.push({
        id: `analytics-${target.workspaceId}`,
        name: `Analytics (${target.workspaceName})`,
        role: 'analytics',
        technology: 'duckdb',
        location: inspected.success.dbPath,
        workspaceId: target.workspaceId,
        workspaceName: target.workspaceName,
        canReset: true,
        measurement: {
          status: 'error',
          reason: inspected.success.reason,
          details: inspected.success.details,
          collectedAt,
        },
      })
    }

    for (const orphan of scanned.success.orphans) {
      const details: FieldErrors = { storagePath: [orphan.dbPath] }

      items.push({
        id: `analytics-orphan-${orphan.hash}`,
        name: `Analytics (Arquivo órfão ${orphan.hash.slice(0, 8)})`,
        role: 'analytics',
        technology: 'duckdb',
        location: orphan.dbPath,
        canReset: false,
        measurement: {
          status: 'error',
          reason: 'ANALYTICS_STORAGE_ORPHAN_FILE',
          details,
          collectedAt,
        },
      })
    }

    return Either.success(items)
  }

  public async readProbes(): Promise<
    Either<AppError, DiagnosticCheckResult[]>
  > {
    const scanned = await this.scanEntries()
    if (scanned.isFailure()) return scanned.forwardFailure()

    const checks: DiagnosticCheckResult[] = []

    for (const target of scanned.success.matched) {
      const startedMs = Date.now()
      const startedAt = new Date(startedMs).toISOString()
      const inspected = await this.analyticsEngine.inspectWorkspaceStorage(
        target.workspaceId,
      )
      const finishedMs = Date.now()
      const finishedAt = new Date(finishedMs).toISOString()
      const durationMs = Math.max(0, finishedMs - startedMs)

      if (inspected.isFailure()) {
        checks.push({
          id: `probe-analytics-storage-${target.workspaceId}`,
          name: `Analytics Storage (${target.workspaceName})`,
          capability: 'analytics.storage.read',
          source: 'analytics',
          scope: { type: 'workspace', workspaceId: target.workspaceId },
          status: 'fail',
          reason: inspected.failure.messageKey,
          details: inspected.failure.details,
          startedAt,
          finishedAt,
          durationMs,
        })
        continue
      }

      if (!inspected.success.exists) continue

      if (inspected.success.healthy) {
        checks.push({
          id: `probe-analytics-storage-${target.workspaceId}`,
          name: `Analytics Storage (${target.workspaceName})`,
          capability: 'analytics.storage.read',
          source: 'analytics',
          scope: { type: 'workspace', workspaceId: target.workspaceId },
          status: 'pass',
          provenOperation: 'duckdb_analytics_storage_verified',
          startedAt,
          finishedAt,
          durationMs,
        })
        continue
      }

      checks.push({
        id: `probe-analytics-storage-${target.workspaceId}`,
        name: `Analytics Storage (${target.workspaceName})`,
        capability: 'analytics.storage.read',
        source: 'analytics',
        scope: { type: 'workspace', workspaceId: target.workspaceId },
        status: 'fail',
        reason: inspected.success.reason,
        details: inspected.success.details,
        startedAt,
        finishedAt,
        durationMs,
      })
    }

    const nowIso = new Date().toISOString()

    for (const orphan of scanned.success.orphans) {
      checks.push({
        id: `probe-analytics-orphan-${orphan.hash}`,
        name: `Analytics Storage (Arquivo órfão ${orphan.hash.slice(0, 8)})`,
        capability: 'analytics.storage.read',
        source: 'analytics',
        scope: { type: 'application' },
        status: 'fail',
        reason: 'ANALYTICS_STORAGE_ORPHAN_FILE',
        details: { storagePath: [orphan.dbPath] },
        startedAt: nowIso,
        finishedAt: nowIso,
        durationMs: 0,
      })
    }

    return Either.success(checks)
  }
}
