import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBTypeId,
  DuckDBValue,
} from '@duckdb/node-api'
import {
  type AnalyticsColumnSchema,
  type AnalyticsDatasetCellValue,
  type AnalyticsDatasetManifest,
  type AnalyticsDatasetQueryInput,
  type AnalyticsDatasetResult,
  type AnalyticsDatasetRow,
  type AnalyticsGeneration,
  type AnalyticsGenerationOwner,
  type AnalyticsPublication,
  type AnalyticsPublicationEntry,
  type AnalyticsQueryAuthorization,
  type AnalyticsQueryInput,
  type AnalyticsQueryResult,
  type AnalyticsResetStorageResult,
  type AnalyticsSyncMetadata,
  type AnalyticsSyncState,
  type AnalyticsSyncStrategy,
  type AnalyticsWindowBounds,
  type AnalyticsWorkspaceState,
  type IAnalyticsEngine,
  type JsonValue,
  type SaveAnalyticsWorkspaceStateInput,
  validatePersistedAnalyticsSpacesJson,
} from '@mr-tick/application'
import { AppError, Either, type FieldErrors } from '@mr-tick/shared/helpers'
import { z } from 'zod'

import { analyticsDatasetQuerySchema } from '../../validation/analyticsQuery'
import {
  analyticsLocalQuerySchema,
  analyticsManifestSchema,
} from '../../validation/analyticsWarehouse'
import {
  AnalyticsSqlCompiler,
  identifier,
  SqlScalar,
  storageType,
  StoredAnalyticsSource,
} from './AnalyticsSqlCompiler'

export interface AnalyticsStorageDirectoryEntry {
  hash: string
  dbPath: string
  bytes: number
}

export type AnalyticsStorageInspection =
  | { exists: false; dbPath: string }
  | {
      exists: true
      healthy: true
      dbPath: string
      bytes: number
      spacesCount: number
      publicationsCount: number
    }
  | {
      exists: true
      healthy: false
      dbPath: string
      bytes: number
      reason: string
      details?: FieldErrors
    }

type FileStatOutcome =
  | { exists: false; bytes: 0 }
  | { exists: true; bytes: number }
  | { exists: true; bytes: 0; errorReason: string }

const systemErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
})

const REQUIRED_ANALYTICS_TABLES = [
  'analytics_generations',
  'analytics_publications',
  'analytics_sync_states',
  'analytics_workspace_settings',
]

interface Database {
  instance: DuckDBInstance
  connection: DuckDBConnection
}

interface GenerationMetadata {
  generation: AnalyticsGeneration
  rowCount: number
  state: 'staging' | 'published'
  coverage: 'complete' | 'unverified'
  fetchedAt: string
  loadedAt: string
}

function failure(message: string) {
  return Either.failure(AppError.ValidationError(message))
}

function tableName(id: string): string {
  return `generation_${id.replace(/-/g, '')}`
}

function ownerMatches(
  left: AnalyticsGenerationOwner,
  right: AnalyticsGenerationOwner,
): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.connectionInstanceId === right.connectionInstanceId &&
    left.authorizationKey === right.authorizationKey &&
    left.selectionKey === right.selectionKey
  )
}

function nullableString(value: string | undefined): string | null {
  if (value === undefined) return null

  return value
}

function readOptionalString(
  value: DuckDBValue | undefined,
): Either<AppError, string | undefined> {
  if (value === undefined || value === null) return Either.success(undefined)
  if (typeof value !== 'string')
    return failure('ANALYTICS_STORAGE_METADATA_INVALID')

  return Either.success(value)
}

function readSyncStrategy(
  value: DuckDBValue | undefined,
): Either<AppError, AnalyticsSyncStrategy> {
  if (
    value === 'incremental_changes' ||
    value === 'window_rescan' ||
    value === 'full_replace'
  )
    return Either.success(value)

  return failure('ANALYTICS_STORAGE_METADATA_INVALID')
}

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false

  return new Date(value).toISOString().slice(0, 10) === value
}

function scalar(
  value: DuckDBValue,
  type: DuckDBTypeId,
): Either<AppError, AnalyticsDatasetCellValue> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return Either.success(value)

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return failure('ANALYTICS_NUMBER_OUT_OF_RANGE')

    return Either.success(value)
  }

  if (typeof value === 'bigint') {
    const number = Number(value)
    if (!Number.isSafeInteger(number))
      return failure('ANALYTICS_NUMBER_OUT_OF_RANGE')

    return Either.success(number)
  }

  if (
    [
      DuckDBTypeId.DATE,
      DuckDBTypeId.TIMESTAMP,
      DuckDBTypeId.TIMESTAMP_TZ,
      DuckDBTypeId.TIMESTAMP_MS,
      DuckDBTypeId.TIMESTAMP_NS,
      DuckDBTypeId.TIMESTAMP_S,
      DuckDBTypeId.TIME,
    ].includes(type)
  )
    return Either.success(value.toString())

  if (type === DuckDBTypeId.DECIMAL) {
    const number = Number(value.toString())
    if (!Number.isFinite(number))
      return failure('ANALYTICS_NUMBER_OUT_OF_RANGE')

    return Either.success(number)
  }

  return failure('ANALYTICS_QUERY_VALUE_NOT_SUPPORTED')
}

function identityKey(
  row: AnalyticsDatasetRow,
  identityColumns: readonly string[],
): string {
  return JSON.stringify(identityColumns.map((col) => row[col]))
}

function deduplicateDeltaRows(
  rows: AnalyticsDatasetRow[],
  identityColumns: readonly string[],
): AnalyticsDatasetRow[] {
  const byKey = new Map<string, AnalyticsDatasetRow>()

  for (const row of rows) {
    const key = identityKey(row, identityColumns)
    if (byKey.has(key)) byKey.delete(key)
    byKey.set(key, row)
  }

  return Array.from(byKey.values())
}

function buildPublication(
  generation: AnalyticsGeneration,
  rowCount: number,
  coverage: 'complete' | 'unverified',
  coverageReason: string | undefined,
  fetchedAt: string,
  loadedAt: string,
): AnalyticsPublication {
  const publication: AnalyticsPublication = {
    generationId: generation.generationId,
    selectionKey: generation.selectionKey,
    connectionInstanceId: generation.connectionInstanceId,
    manifest: generation.manifest,
    query: generation.query,
    rowCount,
    coverage,
    loadedAt,
    fetchedAt,
    remoteAggregate: generation.query.execution?.kind === 'aggregate',
  }

  if (coverage === 'unverified' && coverageReason !== undefined)
    publication.coverageReason = coverageReason

  return publication
}

/** One native store for analytical generations; no operational entities or credentials. */
export class DuckDBAnalyticsEngine implements IAnalyticsEngine {
  private readonly databases = new Map<string, Database>()
  private readonly activeGenerations = new Map<string, string>()
  private tail: Promise<void> = Promise.resolve()
  private pending = 0
  private closed = false

  constructor(private readonly directory: string) {}

  public storagePaths(workspaceId: string): {
    hash: string
    dbPath: string
    walPath: string
    tmpPath: string
  } {
    const hash = createHash('sha256').update(workspaceId).digest('hex')
    const dbPath = join(this.directory, `${hash}.duckdb`)

    return {
      hash,
      dbPath,
      walPath: `${dbPath}.wal`,
      tmpPath: `${dbPath}.tmp`,
    }
  }

  public async listStorageEntries(): Promise<
    Either<AppError, AnalyticsStorageDirectoryEntry[]>
  > {
    try {
      const entries = await readdir(this.directory)
      const byHash = new Map<
        string,
        { hasDb: boolean; hasWal: boolean; files: string[] }
      >()

      for (const entry of entries) {
        const match = /^([0-9a-f]{64})\.duckdb(\.wal|\.tmp)?$/u.exec(entry)
        const hash = match?.[1]
        if (hash === undefined) continue

        let current = byHash.get(hash)

        if (current === undefined) {
          current = { hasDb: false, hasWal: false, files: [] }
          byHash.set(hash, current)
        }

        if (match?.[2] === undefined) current.hasDb = true
        if (match?.[2] === '.wal') current.hasWal = true
        current.files.push(join(this.directory, entry))
      }

      const result: AnalyticsStorageDirectoryEntry[] = []

      for (const [hash, item] of byHash.entries()) {
        if (!item.hasDb && !item.hasWal) continue

        let bytes = 0

        for (const filePath of item.files) {
          const outcome = await this.inspectFileStat(filePath)
          bytes += outcome.bytes
        }

        let primaryPath = join(this.directory, `${hash}.duckdb`)
        if (!item.hasDb)
          primaryPath = join(this.directory, `${hash}.duckdb.wal`)

        result.push({
          hash,
          dbPath: primaryPath,
          bytes,
        })
      }

      return Either.success(result)
    } catch (error) {
      const parsed = systemErrorSchema.safeParse(error)
      if (parsed.success && parsed.data.code === 'ENOENT')
        return Either.success([])

      let reason = 'ANALYTICS_STORAGE_UNREADABLE'
      if (parsed.success && parsed.data.message !== undefined)
        reason = parsed.data.message

      return Either.failure(
        AppError.Internal('ANALYTICS_STORAGE_UNREADABLE', {
          storagePath: [this.directory],
          reason: [reason],
        }),
      )
    }
  }

  private async inspectFileStat(filePath: string): Promise<FileStatOutcome> {
    try {
      const info = await stat(filePath)
      return { exists: true, bytes: info.size }
    } catch (error) {
      const parsed = systemErrorSchema.safeParse(error)
      if (parsed.success && parsed.data.code === 'ENOENT')
        return { exists: false, bytes: 0 }

      let reason = 'STORAGE_STAT_FAILED'
      if (parsed.success && parsed.data.message !== undefined)
        reason = parsed.data.message

      return { exists: true, bytes: 0, errorReason: reason }
    }
  }

  private runSerialized<T>(
    admission: 'normal' | 'cleanup',
    task: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    if (this.closed) return Promise.resolve(failure('ANALYTICS_ENGINE_CLOSED'))

    let queueLimit = 32
    if (admission === 'cleanup') queueLimit = 40
    if (this.pending >= queueLimit)
      return Promise.resolve(
        Either.failure(AppError.Http(429, 'ANALYTICS_ENGINE_QUEUE_LIMIT')),
      )

    const previous = this.tail
    let release = () => {}

    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })

    this.pending += 1

    return previous
      .then(task)
      .catch((error: Error) => {
        const decoded = z.object({ message: z.string() }).safeParse(error)
        if (decoded.success)
          return Either.failure(
            AppError.Internal('ANALYTICS_ENGINE_FAILURE', {
              engine: [decoded.data.message],
            }),
          )

        return Either.failure(AppError.Internal('ANALYTICS_ENGINE_FAILURE'))
      })
      .finally(() => {
        this.pending -= 1
        release()
      })
  }

  private execute<T>(
    workspaceId: string,
    operation: (db: Database) => Promise<Either<AppError, T>>,
    admission: 'normal' | 'cleanup' = 'normal',
  ): Promise<Either<AppError, T>> {
    return this.runSerialized(admission, async () => {
      const opened = await this.open(workspaceId)
      if (opened.isFailure()) return opened.forwardFailure<T>()

      const deadline = AbortSignal.timeout(30000)
      const interrupt = () => opened.success.connection.interrupt()
      deadline.addEventListener('abort', interrupt, { once: true })

      try {
        return await operation(opened.success)
      } finally {
        deadline.removeEventListener('abort', interrupt)
      }
    })
  }

  private async open(workspaceId: string): Promise<Either<AppError, Database>> {
    const cached = this.databases.get(workspaceId)

    if (cached !== undefined) {
      this.databases.delete(workspaceId)
      this.databases.set(workspaceId, cached)
      return Either.success(cached)
    }

    if (this.databases.size >= 2) {
      const oldest = this.databases.keys().next()

      if (!oldest.done) {
        const db = this.databases.get(oldest.value)

        if (db !== undefined) {
          db.connection.closeSync()
          db.instance.closeSync()
          this.databases.delete(oldest.value)
        }
      }
    }

    await mkdir(this.directory, { recursive: true })
    const { dbPath: path } = this.storagePaths(workspaceId)
    let instance: DuckDBInstance

    try {
      instance = await DuckDBInstance.create(path, {
        threads: '2',
        memory_limit: '256MB',
        enable_external_access: 'false',
        autoinstall_known_extensions: 'false',
        allow_community_extensions: 'false',
      })
    } catch (error) {
      const parsed = systemErrorSchema.safeParse(error)
      let reason = 'ANALYTICS_STORAGE_UNREADABLE'
      if (parsed.success && parsed.data.message !== undefined)
        reason = parsed.data.message

      return Either.failure(
        AppError.Internal('ANALYTICS_STORAGE_UNREADABLE', {
          storagePath: [path],
          reason: [reason],
        }),
      )
    }

    let connection: DuckDBConnection | undefined
    let ready = false

    try {
      connection = await instance.connect()
      await connection.run("SET TimeZone='UTC'")
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_format(version INTEGER NOT NULL)',
      )
      const format = await connection.runAndReadAll(
        'SELECT version FROM analytics_format LIMIT 2',
      )
      const versions = format.getRowObjects()
      format.closeSync()
      if (versions.length === 0)
        await connection.run('INSERT INTO analytics_format VALUES (2)')
      if (versions.length > 1 || versions.some((row) => row.version !== 2))
        return Either.failure(
          AppError.ValidationError('ANALYTICS_STORAGE_FORMAT_UNSUPPORTED', {
            storagePath: [path],
            storedFormatVersion: versions.map((row) => String(row.version)),
            supportedFormatVersion: ['2'],
          }),
        )

      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_generations(generation_id VARCHAR PRIMARY KEY, connection_id VARCHAR NOT NULL, authorization_key VARCHAR NOT NULL, selection_key VARCHAR NOT NULL, manifest_json VARCHAR NOT NULL, query_json VARCHAR NOT NULL, row_count BIGINT NOT NULL, state VARCHAR NOT NULL, coverage VARCHAR NOT NULL, fetched_at VARCHAR NOT NULL, loaded_at VARCHAR NOT NULL)',
      )
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_publications(connection_id VARCHAR NOT NULL, authorization_key VARCHAR NOT NULL, selection_key VARCHAR NOT NULL, generation_id VARCHAR NOT NULL, PRIMARY KEY(connection_id,authorization_key,selection_key))',
      )
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_sync_states(connection_id VARCHAR NOT NULL, authorization_key VARCHAR NOT NULL, selection_key VARCHAR NOT NULL, dataset_id VARCHAR NOT NULL, strategy VARCHAR NOT NULL, checkpoint VARCHAR, last_fast_sync_at VARCHAR NOT NULL, last_full_reconcile_at VARCHAR NOT NULL, coverage VARCHAR NOT NULL, coverage_reason VARCHAR, last_window_start VARCHAR, last_window_end VARCHAR, last_error VARCHAR, last_error_at VARCHAR, PRIMARY KEY(connection_id,authorization_key,selection_key))',
      )
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_workspace_settings(workspace_id VARCHAR PRIMARY KEY, polling_interval_minutes INTEGER NOT NULL, spaces_json VARCHAR, date_from VARCHAR, date_to VARCHAR, updated_at VARCHAR NOT NULL)',
      )
      const abandoned = await connection.runAndReadAll(
        "SELECT generation_id FROM analytics_generations WHERE state='staging'",
      )

      for (const row of abandoned.getRowObjects()) {
        if (typeof row.generation_id !== 'string')
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')
        if (this.activeGenerations.has(row.generation_id)) continue
        await connection.run(
          `DROP TABLE IF EXISTS ${identifier(tableName(row.generation_id))}`,
        )
        await connection.run(
          'DELETE FROM analytics_generations WHERE generation_id=?',
          [row.generation_id],
        )
      }

      abandoned.closeSync()
      const db = { instance, connection }
      this.databases.set(workspaceId, db)
      ready = true
      return Either.success(db)
    } finally {
      if (!ready) {
        if (connection !== undefined) connection.closeSync()
        instance.closeSync()
      }
    }
  }

  private async atomic<T>(
    db: Database,
    operation: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    await db.connection.run('BEGIN TRANSACTION')
    let committed = false

    try {
      const result = await operation()
      if (result.isFailure()) return result.forwardFailure()
      await db.connection.run('COMMIT')
      committed = true
      return result
    } finally {
      if (!committed) await db.connection.run('ROLLBACK')
    }
  }

  private async metadata(
    db: Database,
    workspaceId: string,
    generationId: string,
  ): Promise<Either<AppError, GenerationMetadata>> {
    const reader = await db.connection.runAndReadAll(
      'SELECT generation_id, connection_id, authorization_key, selection_key, manifest_json, query_json, row_count, state, coverage, fetched_at, loaded_at FROM analytics_generations WHERE generation_id=?',
      [generationId],
    )
    const row = reader.getRowObjects().find(() => true)
    reader.closeSync()
    if (row === undefined)
      return Either.failure(AppError.NotFound('ANALYTICS_GENERATION_NOT_FOUND'))

    if (
      typeof row.generation_id !== 'string' ||
      typeof row.connection_id !== 'string' ||
      typeof row.authorization_key !== 'string' ||
      typeof row.selection_key !== 'string' ||
      typeof row.manifest_json !== 'string' ||
      typeof row.query_json !== 'string' ||
      (row.state !== 'staging' && row.state !== 'published') ||
      (row.coverage !== 'complete' && row.coverage !== 'unverified') ||
      typeof row.fetched_at !== 'string' ||
      typeof row.loaded_at !== 'string'
    )
      return failure('ANALYTICS_STORAGE_METADATA_INVALID')

    const manifest = analyticsManifestSchema.safeParse(
      JSON.parse(row.manifest_json),
    )
    const query = analyticsDatasetQuerySchema.safeParse(
      JSON.parse(row.query_json),
    )
    if (!manifest.success || !query.success)
      return failure('ANALYTICS_STORAGE_METADATA_INVALID')

    const count = scalar(row.row_count, DuckDBTypeId.BIGINT)
    if (count.isFailure()) return count.forwardFailure()
    if (typeof count.success !== 'number')
      return failure('ANALYTICS_STORAGE_METADATA_INVALID')

    return Either.success({
      generation: {
        workspaceId,
        generationId: row.generation_id,
        connectionInstanceId: row.connection_id,
        authorizationKey: row.authorization_key,
        selectionKey: row.selection_key,
        manifest: manifest.data,
        query: query.data,
      },
      rowCount: count.success,
      state: row.state,
      coverage: row.coverage,
      fetchedAt: row.fetched_at,
      loadedAt: row.loaded_at,
    })
  }

  private decodeSyncStateRow(
    row: Record<string, DuckDBValue>,
  ): Either<AppError, AnalyticsSyncState> {
    if (
      typeof row.connection_id !== 'string' ||
      typeof row.selection_key !== 'string' ||
      typeof row.dataset_id !== 'string' ||
      typeof row.last_fast_sync_at !== 'string' ||
      typeof row.last_full_reconcile_at !== 'string' ||
      (row.coverage !== 'complete' && row.coverage !== 'unverified')
    )
      return failure('ANALYTICS_STORAGE_METADATA_INVALID')

    const strategy = readSyncStrategy(row.strategy)
    if (strategy.isFailure()) return strategy.forwardFailure()

    const checkpoint = readOptionalString(row.checkpoint)
    if (checkpoint.isFailure()) return checkpoint.forwardFailure()

    const coverageReason = readOptionalString(row.coverage_reason)
    if (coverageReason.isFailure()) return coverageReason.forwardFailure()

    const lastWindowStart = readOptionalString(row.last_window_start)
    if (lastWindowStart.isFailure()) return lastWindowStart.forwardFailure()

    const lastWindowEnd = readOptionalString(row.last_window_end)
    if (lastWindowEnd.isFailure()) return lastWindowEnd.forwardFailure()

    const lastError = readOptionalString(row.last_error)
    if (lastError.isFailure()) return lastError.forwardFailure()

    const lastErrorAt = readOptionalString(row.last_error_at)
    if (lastErrorAt.isFailure()) return lastErrorAt.forwardFailure()

    const state: AnalyticsSyncState = {
      connectionInstanceId: row.connection_id,
      selectionKey: row.selection_key,
      datasetId: row.dataset_id,
      strategy: strategy.success,
      lastFastSyncAt: row.last_fast_sync_at,
      lastFullReconcileAt: row.last_full_reconcile_at,
      coverage: row.coverage,
    }

    if (checkpoint.success !== undefined) state.checkpoint = checkpoint.success
    if (coverageReason.success !== undefined)
      state.coverageReason = coverageReason.success
    if (lastWindowStart.success !== undefined)
      state.lastWindowStart = lastWindowStart.success
    if (lastWindowEnd.success !== undefined)
      state.lastWindowEnd = lastWindowEnd.success
    if (lastError.success !== undefined) state.lastError = lastError.success
    if (lastErrorAt.success !== undefined)
      state.lastErrorAt = lastErrorAt.success

    return Either.success(state)
  }

  private async readSyncState(
    db: Database,
    owner: AnalyticsGenerationOwner,
  ): Promise<Either<AppError, AnalyticsSyncState | undefined>> {
    const reader = await db.connection.runAndReadAll(
      'SELECT connection_id, selection_key, dataset_id, strategy, checkpoint, last_fast_sync_at, last_full_reconcile_at, coverage, coverage_reason, last_window_start, last_window_end, last_error, last_error_at FROM analytics_sync_states WHERE connection_id=? AND authorization_key=? AND selection_key=?',
      [owner.connectionInstanceId, owner.authorizationKey, owner.selectionKey],
    )
    const row = reader.getRowObjects().find(() => true)
    reader.closeSync()
    if (row === undefined) return Either.success(undefined)

    return this.decodeSyncStateRow(row)
  }

  private async writeSyncState(
    db: Database,
    owner: AnalyticsGenerationOwner,
    datasetId: string,
    coverage: 'complete' | 'unverified',
    lastFastSyncAt: string,
    lastFullReconcileAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<void> {
    let reason: string | undefined
    if (coverage === 'unverified') reason = syncMeta.coverageReason

    await db.connection.run(
      'INSERT INTO analytics_sync_states VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL) ON CONFLICT(connection_id,authorization_key,selection_key) DO UPDATE SET dataset_id=excluded.dataset_id, strategy=excluded.strategy, checkpoint=excluded.checkpoint, last_fast_sync_at=excluded.last_fast_sync_at, last_full_reconcile_at=excluded.last_full_reconcile_at, coverage=excluded.coverage, coverage_reason=excluded.coverage_reason, last_window_start=excluded.last_window_start, last_window_end=excluded.last_window_end, last_error=NULL, last_error_at=NULL',
      [
        owner.connectionInstanceId,
        owner.authorizationKey,
        owner.selectionKey,
        datasetId,
        syncMeta.strategy,
        nullableString(syncMeta.checkpoint),
        lastFastSyncAt,
        lastFullReconcileAt,
        coverage,
        nullableString(reason),
        nullableString(syncMeta.lastWindowStart),
        nullableString(syncMeta.lastWindowEnd),
      ],
    )
  }

  public create(
    owner: AnalyticsGenerationOwner,
    manifest: AnalyticsDatasetManifest,
    query: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsGeneration>> {
    return this.execute(owner.workspaceId, async (db) => {
      if (this.activeGenerations.size >= 8)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_LOADS_LIMIT'),
        )

      const validated = analyticsManifestSchema.safeParse(manifest)
      if (!validated.success) return failure('ANALYTICS_SCHEMA_INVALID')

      const names = manifest.columns.map((column) => column.name.toLowerCase())
      if (
        new Set(names).size !== names.length ||
        names.some((name) => name.includes('\0'))
      )
        return failure('ANALYTICS_SCHEMA_DUPLICATE_COLUMN')

      const count = await db.connection.runAndReadAll(
        "SELECT count(1) AS active FROM analytics_generations WHERE state='staging'",
      )
      const active = count.getRowObjects().find(() => true)?.active
      count.closeSync()
      if (typeof active !== 'bigint' || active >= 8n)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_LOADS_LIMIT'),
        )

      const generation: AnalyticsGeneration = {
        ...owner,
        generationId: randomUUID(),
        manifest: validated.data,
        query,
      }

      const outcome = await this.atomic(db, async () => {
        await db.connection.run(
          `CREATE TABLE ${identifier(tableName(generation.generationId))} (${manifest.columns.map((column) => `${identifier(column.name)} ${storageType(column.type)}`).join(', ')})`,
        )

        if (manifest.extraction.identity.kind === 'row') {
          if (
            manifest.extraction.identity.columns.some(
              (name) =>
                !manifest.columns.some((column) => column.name === name),
            )
          )
            return failure('ANALYTICS_IDENTITY_COLUMN_MISSING')

          await db.connection.run(
            `CREATE UNIQUE INDEX ${identifier(`identity_${generation.generationId.replace(/-/g, '')}`)} ON ${identifier(tableName(generation.generationId))} (${manifest.extraction.identity.columns.map(identifier).join(', ')})`,
          )
        }

        if (
          query.execution?.kind === 'aggregate' &&
          query.execution.groupBy.length > 0
        ) {
          const groups = query.execution.groupBy
          if (
            groups.some(
              (name) =>
                !manifest.columns.some((column) => column.name === name),
            )
          )
            return failure('ANALYTICS_AGGREGATE_SCHEMA_MISMATCH')

          // A null flag keeps NULL distinct from every real value, including the index sentinel.
          const expressions = manifest.columns
            .filter((column) => groups.includes(column.name))
            .flatMap((column) => {
              let sentinel = "''"
              if (column.type === 'number') sentinel = '0'
              if (column.type === 'boolean') sentinel = 'false'

              return [
                `(${identifier(column.name)} IS NULL)`,
                `coalesce(${identifier(column.name)}, ${sentinel})`,
              ]
            })

          await db.connection.run(
            `CREATE UNIQUE INDEX ${identifier(`aggregate_${generation.generationId.replace(/-/g, '')}`)} ON ${identifier(tableName(generation.generationId))} (${expressions.join(', ')})`,
          )
        }

        await db.connection.run(
          "INSERT INTO analytics_generations VALUES (?, ?, ?, ?, ?, ?, 0, 'staging', 'unverified', '', '')",
          [
            generation.generationId,
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
            JSON.stringify(generation.manifest),
            JSON.stringify(query),
          ],
        )

        return Either.success(generation)
      })

      if (outcome.isSuccess())
        this.activeGenerations.set(generation.generationId, owner.workspaceId)

      return outcome
    })
  }

  public append(
    generation: AnalyticsGeneration,
    batch: AnalyticsDatasetResult,
  ): Promise<Either<AppError, void>> {
    return this.execute(generation.workspaceId, async (db) => {
      const found = await this.metadata(
        db,
        generation.workspaceId,
        generation.generationId,
      )
      if (found.isFailure()) return found.forwardFailure()

      const stored = found.success
      if (
        !ownerMatches(stored.generation, generation) ||
        stored.state !== 'staging'
      )
        return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

      const valid = analyticsManifestSchema.safeParse(batch.dataset)
      if (!valid.success || batch.dataset.id !== generation.query.datasetId)
        return failure('ANALYTICS_SCHEMA_INVALID')

      if (
        JSON.stringify(batch.dataset.extraction.identity) !==
        JSON.stringify(stored.generation.manifest.extraction.identity)
      )
        return failure('ANALYTICS_IDENTITY_CHANGED_DURING_LOAD')

      const isDeltaStaging = generation.query.execution?.kind === 'changes'

      if (!isDeltaStaging && stored.rowCount + batch.rows.length > 50000)
        return failure('ANALYTICS_LOAD_ROWS_LIMIT')

      if (
        generation.query.execution?.kind === 'aggregate' &&
        generation.query.execution.groupBy.length === 0 &&
        stored.rowCount + batch.rows.length > 1
      )
        return failure('ANALYTICS_AGGREGATE_SINGLE_TOTAL_REQUIRED')

      const columns = [...stored.generation.manifest.columns]
      const added: AnalyticsColumnSchema[] = []

      for (const column of batch.dataset.columns) {
        const existing = columns.find(
          (item) => item.name.toLowerCase() === column.name.toLowerCase(),
        )

        if (
          existing !== undefined &&
          (existing.name !== column.name ||
            existing.type !== column.type ||
            existing.providerFieldId !== column.providerFieldId)
        )
          return failure('ANALYTICS_SCHEMA_CHANGED_DURING_LOAD')

        if (existing === undefined) {
          columns.push(column)
          added.push(column)
        }
      }

      if (columns.length > 256) return failure('ANALYTICS_SCHEMA_COLUMNS_LIMIT')

      const keys = new Set(columns.map((column) => column.name))

      for (const row of batch.rows) {
        if (Object.keys(row).some((name) => !keys.has(name)))
          return failure('ANALYTICS_ROW_OUTSIDE_SCHEMA')

        for (const column of columns) {
          const value = row[column.name]
          if (value === undefined || value === null) continue
          if (
            column.type === 'number' &&
            (typeof value !== 'number' || !Number.isFinite(value))
          )
            return failure('ANALYTICS_ROW_TYPE_MISMATCH')
          if (column.type === 'boolean' && typeof value !== 'boolean')
            return failure('ANALYTICS_ROW_TYPE_MISMATCH')
          if (
            (column.type === 'string' || column.type === 'date') &&
            typeof value !== 'string'
          )
            return failure('ANALYTICS_ROW_TYPE_MISMATCH')
          if (
            column.type === 'date' &&
            typeof value === 'string' &&
            (!/^\d{4}-\d{2}-\d{2}(?:$|T)/u.test(value) ||
              !Number.isFinite(Date.parse(value)) ||
              new Date(value.slice(0, 10)).toISOString().slice(0, 10) !==
                value.slice(0, 10))
          )
            return failure('ANALYTICS_ROW_DATE_INVALID')
        }

        if (
          batch.dataset.extraction.identity.kind === 'row' &&
          batch.dataset.extraction.identity.columns.some(
            (name) => row[name] === undefined || row[name] === null,
          )
        )
          return failure('ANALYTICS_ROW_IDENTITY_REQUIRED')
      }

      let rowsToInsert = batch.rows
      const identity = stored.generation.manifest.extraction.identity

      if (isDeltaStaging && identity.kind === 'row' && batch.rows.length > 0)
        rowsToInsert = deduplicateDeltaRows(batch.rows, identity.columns)

      return this.atomic(db, async () => {
        const targetTable = identifier(tableName(generation.generationId))

        for (const column of added)
          await db.connection.run(
            `ALTER TABLE ${targetTable} ADD COLUMN ${identifier(column.name)} ${storageType(column.type)}`,
          )

        if (
          isDeltaStaging &&
          identity.kind === 'row' &&
          rowsToInsert.length > 0
        )
          await this.deleteRowsByIdentity(
            db,
            targetTable,
            identity.columns,
            rowsToInsert,
          )

        for (let offset = 0; offset < rowsToInsert.length; offset += 100) {
          const rows = rowsToInsert.slice(offset, offset + 100)
          const values: SqlScalar[] = []
          const tuples = rows.map(
            (row) =>
              `(${columns
                .map((column) => {
                  const value = row[column.name]

                  if (value === undefined) {
                    values.push(null)
                    return '?'
                  }

                  values.push(value)
                  return '?'
                })
                .join(', ')})`,
          )

          await db.connection.run(
            `INSERT INTO ${targetTable} (${columns.map((column) => identifier(column.name)).join(', ')}) VALUES ${tuples.join(', ')}`,
            values,
          )
        }

        let nextRowCount = stored.rowCount + rowsToInsert.length

        if (isDeltaStaging) {
          const countReader = await db.connection.runAndReadAll(
            `SELECT count(1) AS total FROM ${targetTable}`,
          )
          const countRaw = countReader.getRowObjects().find(() => true)?.total
          countReader.closeSync()
          if (typeof countRaw !== 'bigint')
            return failure('ANALYTICS_STORAGE_METADATA_INVALID')
          nextRowCount = Number(countRaw)
        }

        if (nextRowCount > 50000) return failure('ANALYTICS_LOAD_ROWS_LIMIT')

        const manifest = { ...stored.generation.manifest, columns }
        await db.connection.run(
          'UPDATE analytics_generations SET manifest_json=?, row_count=? WHERE generation_id=?',
          [JSON.stringify(manifest), nextRowCount, generation.generationId],
        )

        return Either.success(undefined)
      })
    })
  }

  private async deleteRowsByIdentity(
    db: Database,
    targetTableSql: string,
    identityColumns: readonly string[],
    rows: AnalyticsDatasetRow[],
  ): Promise<void> {
    if (identityColumns.length === 1) {
      const [col] = identityColumns
      if (col === undefined) return

      for (let offset = 0; offset < rows.length; offset += 200) {
        const slice = rows.slice(offset, offset + 200)
        const placeholders = slice.map(() => '?').join(', ')
        const values: SqlScalar[] = slice.map((row) => {
          const val = row[col]
          if (val === undefined) return null
          return val
        })
        await db.connection.run(
          `DELETE FROM ${targetTableSql} WHERE ${identifier(col)} IN (${placeholders})`,
          values,
        )
      }

      return
    }

    for (let offset = 0; offset < rows.length; offset += 50) {
      const slice = rows.slice(offset, offset + 50)
      const values: SqlScalar[] = []
      const predicates = slice.map((row) => {
        const clauses = identityColumns.map((col) => {
          const val = row[col]
          if (val === undefined) values.push(null)
          if (val !== undefined) values.push(val)
          return `${identifier(col)}=?`
        })
        return `(${clauses.join(' AND ')})`
      })
      await db.connection.run(
        `DELETE FROM ${targetTableSql} WHERE ${predicates.join(' OR ')}`,
        values,
      )
    }
  }

  public publish(
    generation: AnalyticsGeneration,
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>> {
    return this.execute(generation.workspaceId, async (db) => {
      const found = await this.metadata(
        db,
        generation.workspaceId,
        generation.generationId,
      )
      if (found.isFailure()) return found.forwardFailure()

      if (
        found.success.state !== 'staging' ||
        !ownerMatches(found.success.generation, generation)
      )
        return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

      const loadedAt = new Date().toISOString()
      let lastFullReconcileAt = loadedAt
      if (syncMeta.lastFullReconcileAt !== undefined)
        lastFullReconcileAt = syncMeta.lastFullReconcileAt

      const outcome = await this.atomic(db, async () => {
        const previous = await db.connection.runAndReadAll(
          'SELECT generation_id FROM analytics_publications WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            generation.connectionInstanceId,
            generation.authorizationKey,
            generation.selectionKey,
          ],
        )
        const oldId = previous.getRowObjects().find(() => true)?.generation_id
        previous.closeSync()
        await db.connection.run(
          "UPDATE analytics_generations SET state='published',coverage=?,fetched_at=?,loaded_at=? WHERE generation_id=?",
          [coverage, fetchedAt, loadedAt, generation.generationId],
        )
        await db.connection.run(
          'INSERT INTO analytics_publications VALUES (?, ?, ?, ?) ON CONFLICT(connection_id,authorization_key,selection_key) DO UPDATE SET generation_id=excluded.generation_id',
          [
            generation.connectionInstanceId,
            generation.authorizationKey,
            generation.selectionKey,
            generation.generationId,
          ],
        )

        await this.writeSyncState(
          db,
          generation,
          found.success.generation.manifest.id,
          coverage,
          loadedAt,
          lastFullReconcileAt,
          syncMeta,
        )

        if (typeof oldId === 'string' && oldId !== generation.generationId) {
          await db.connection.run(`DROP TABLE ${identifier(tableName(oldId))}`)
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE generation_id=?',
            [oldId],
          )
        }

        return Either.success(
          buildPublication(
            found.success.generation,
            found.success.rowCount,
            coverage,
            syncMeta.coverageReason,
            fetchedAt,
            loadedAt,
          ),
        )
      })

      if (outcome.isSuccess())
        this.activeGenerations.delete(generation.generationId)

      return outcome
    })
  }

  public publishWindowMerge(
    owner: AnalyticsGenerationOwner,
    baseGenerationId: string,
    windowGeneration: AnalyticsGeneration | undefined,
    windowBounds: AnalyticsWindowBounds,
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>> {
    if (
      !isIsoDateOnly(windowBounds.startDate) ||
      !isIsoDateOnly(windowBounds.endDate) ||
      windowBounds.startDate > windowBounds.endDate
    )
      return Promise.resolve(failure('ANALYTICS_WINDOW_BOUNDS_INVALID'))

    return this.execute(owner.workspaceId, async (db) => {
      const baseFound = await this.metadata(
        db,
        owner.workspaceId,
        baseGenerationId,
      )
      if (baseFound.isFailure()) return baseFound.forwardFailure()

      const base = baseFound.success
      if (
        base.state !== 'published' ||
        !ownerMatches(base.generation, owner) ||
        base.generation.manifest.extraction.identity.kind !== 'row'
      )
        return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

      const syncFound = await this.readSyncState(db, owner)
      if (syncFound.isFailure()) return syncFound.forwardFailure()

      let staging: GenerationMetadata | undefined

      if (windowGeneration !== undefined) {
        const stagingFound = await this.metadata(
          db,
          owner.workspaceId,
          windowGeneration.generationId,
        )
        if (stagingFound.isFailure()) return stagingFound.forwardFailure()

        staging = stagingFound.success
        if (
          staging.state !== 'staging' ||
          !ownerMatches(staging.generation, owner)
        )
          return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

        if (
          JSON.stringify(staging.generation.manifest.extraction.identity) !==
          JSON.stringify(base.generation.manifest.extraction.identity)
        )
          return failure('ANALYTICS_SCHEMA_CHANGED_DURING_LOAD')
      }

      const mergePlan = this.planSchemaMerge(base.generation.manifest, staging)
      if (mergePlan.isFailure()) return mergePlan.forwardFailure()

      const { mergedColumns, addedColumns } = mergePlan.success
      const dateCol = mergedColumns.find(
        (col) => col.name === windowBounds.dateColumn && col.type === 'date',
      )
      if (dateCol === undefined)
        return failure('ANALYTICS_WINDOW_DATE_COLUMN_INVALID')

      const newGenerationId = randomUUID()
      const loadedAt = new Date().toISOString()

      let nextCoverage: 'complete' | 'unverified' = coverage
      if (base.coverage === 'unverified') nextCoverage = 'unverified'

      let nextCoverageReason: string | undefined

      if (nextCoverage === 'unverified') {
        if (coverage === 'unverified' && syncMeta.coverageReason !== undefined)
          nextCoverageReason = syncMeta.coverageReason
        if (
          nextCoverageReason === undefined &&
          syncFound.success?.coverageReason !== undefined
        )
          nextCoverageReason = syncFound.success.coverageReason
      }

      let lastFullReconcileAt = base.loadedAt
      if (syncFound.success !== undefined)
        lastFullReconcileAt = syncFound.success.lastFullReconcileAt

      let nextCheckpoint = syncMeta.checkpoint
      if (nextCheckpoint === undefined && syncFound.success !== undefined)
        nextCheckpoint = syncFound.success.checkpoint

      const identityCols = base.generation.manifest.extraction.identity.columns

      const outcome = await this.atomic(db, async () => {
        const activePub = await db.connection.runAndReadAll(
          'SELECT generation_id FROM analytics_publications WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
          ],
        )
        const currentPublishedId = activePub
          .getRowObjects()
          .find(() => true)?.generation_id
        activePub.closeSync()
        if (currentPublishedId !== baseGenerationId)
          return failure('ANALYTICS_PUBLICATION_CONFLICT')

        const newTable = identifier(tableName(newGenerationId))
        const baseTable = identifier(tableName(baseGenerationId))

        await db.connection.run(
          `CREATE TABLE ${newTable} AS SELECT * FROM ${baseTable}`,
        )

        for (const col of addedColumns)
          await db.connection.run(
            `ALTER TABLE ${newTable} ADD COLUMN ${identifier(col.name)} ${storageType(col.type)}`,
          )

        await db.connection.run(
          `CREATE UNIQUE INDEX ${identifier(`identity_${newGenerationId.replace(/-/g, '')}`)} ON ${newTable} (${identityCols.map(identifier).join(', ')})`,
        )

        const dateIdentifier = identifier(dateCol.name)
        await db.connection.run(
          `DELETE FROM ${newTable} WHERE ${dateIdentifier} IS NOT NULL AND CAST(substr(${dateIdentifier}, 1, 10) AS DATE) >= CAST(? AS DATE) AND CAST(substr(${dateIdentifier}, 1, 10) AS DATE) <= CAST(? AS DATE)`,
          [windowBounds.startDate, windowBounds.endDate],
        )

        if (staging !== undefined && staging.rowCount > 0) {
          const stagingTable = identifier(
            tableName(staging.generation.generationId),
          )
          const matchPredicate = identityCols
            .map(
              (col) => `${newTable}.${identifier(col)} = s.${identifier(col)}`,
            )
            .join(' AND ')

          await db.connection.run(
            `DELETE FROM ${newTable} WHERE EXISTS (SELECT 1 FROM ${stagingTable} AS s WHERE ${matchPredicate})`,
          )

          const stagingColsSql = staging.generation.manifest.columns
            .map((col) => identifier(col.name))
            .join(', ')
          await db.connection.run(
            `INSERT INTO ${newTable} (${stagingColsSql}) SELECT ${stagingColsSql} FROM ${stagingTable}`,
          )
        }

        const countReader = await db.connection.runAndReadAll(
          `SELECT count(1) AS total FROM ${newTable}`,
        )
        const totalRaw = countReader.getRowObjects().find(() => true)?.total
        countReader.closeSync()
        if (typeof totalRaw !== 'bigint')
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')
        const totalCount = Number(totalRaw)
        if (totalCount > 50000) return failure('ANALYTICS_LOAD_ROWS_LIMIT')

        const mergedManifest: AnalyticsDatasetManifest = {
          ...base.generation.manifest,
          columns: mergedColumns,
        }
        const mergedGeneration: AnalyticsGeneration = {
          ...owner,
          generationId: newGenerationId,
          manifest: mergedManifest,
          query: base.generation.query,
        }

        await db.connection.run(
          "INSERT INTO analytics_generations VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)",
          [
            newGenerationId,
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
            JSON.stringify(mergedManifest),
            JSON.stringify(base.generation.query),
            totalCount,
            nextCoverage,
            fetchedAt,
            loadedAt,
          ],
        )
        await db.connection.run(
          'UPDATE analytics_publications SET generation_id=? WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            newGenerationId,
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
          ],
        )

        const effectiveMeta: AnalyticsSyncMetadata = {
          ...syncMeta,
          strategy: 'window_rescan',
          checkpoint: nextCheckpoint,
          coverageReason: nextCoverageReason,
          lastWindowStart: windowBounds.startDate,
          lastWindowEnd: windowBounds.endDate,
        }

        await this.writeSyncState(
          db,
          owner,
          mergedManifest.id,
          nextCoverage,
          loadedAt,
          lastFullReconcileAt,
          effectiveMeta,
        )

        if (staging !== undefined) {
          await db.connection.run(
            `DROP TABLE ${identifier(tableName(staging.generation.generationId))}`,
          )
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE generation_id=?',
            [staging.generation.generationId],
          )
        }

        await db.connection.run(`DROP TABLE ${baseTable}`)
        await db.connection.run(
          'DELETE FROM analytics_generations WHERE generation_id=?',
          [baseGenerationId],
        )

        return Either.success(
          buildPublication(
            mergedGeneration,
            totalCount,
            nextCoverage,
            nextCoverageReason,
            fetchedAt,
            loadedAt,
          ),
        )
      })

      if (outcome.isSuccess() && windowGeneration !== undefined)
        this.activeGenerations.delete(windowGeneration.generationId)

      return outcome
    })
  }

  public publishChangesMerge(
    owner: AnalyticsGenerationOwner,
    baseGenerationId: string,
    deltaGeneration: AnalyticsGeneration | undefined,
    deletedIds: string[],
    deletions: 'none' | 'explicit',
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>> {
    if (deletedIds.length > 0 && deletions !== 'explicit')
      return Promise.resolve(failure('ANALYTICS_CHANGES_DELETION_NOT_ALLOWED'))

    return this.execute(owner.workspaceId, async (db) => {
      const baseFound = await this.metadata(
        db,
        owner.workspaceId,
        baseGenerationId,
      )
      if (baseFound.isFailure()) return baseFound.forwardFailure()

      const base = baseFound.success
      if (
        base.state !== 'published' ||
        !ownerMatches(base.generation, owner) ||
        base.generation.manifest.extraction.identity.kind !== 'row'
      )
        return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

      const syncFound = await this.readSyncState(db, owner)
      if (syncFound.isFailure()) return syncFound.forwardFailure()

      let staging: GenerationMetadata | undefined

      if (deltaGeneration !== undefined) {
        const stagingFound = await this.metadata(
          db,
          owner.workspaceId,
          deltaGeneration.generationId,
        )
        if (stagingFound.isFailure()) return stagingFound.forwardFailure()

        staging = stagingFound.success
        if (
          staging.state !== 'staging' ||
          !ownerMatches(staging.generation, owner)
        )
          return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

        if (
          JSON.stringify(staging.generation.manifest.extraction.identity) !==
          JSON.stringify(base.generation.manifest.extraction.identity)
        )
          return failure('ANALYTICS_SCHEMA_CHANGED_DURING_LOAD')
      }

      const mergePlan = this.planSchemaMerge(base.generation.manifest, staging)
      if (mergePlan.isFailure()) return mergePlan.forwardFailure()

      const { mergedColumns, addedColumns } = mergePlan.success
      const identityCols = base.generation.manifest.extraction.identity.columns

      const parsedDeletes: SqlScalar[] = []

      if (deletedIds.length > 0) {
        const [identityColName] = identityCols
        if (identityCols.length !== 1 || identityColName === undefined)
          return failure('ANALYTICS_CHANGES_COMPOSITE_DELETE_NOT_SUPPORTED')

        const idColumn = mergedColumns.find(
          (col) => col.name === identityColName,
        )
        if (idColumn === undefined)
          return failure('ANALYTICS_IDENTITY_COLUMN_MISSING')

        for (const rawId of deletedIds) {
          if (idColumn.type === 'number') {
            const numericId = Number(rawId)
            if (rawId.trim() === '' || !Number.isFinite(numericId))
              return failure('ANALYTICS_CHANGES_INVALID_DELETED_ID')
            parsedDeletes.push(numericId)
            continue
          }

          parsedDeletes.push(rawId)
        }
      }

      let nextCoverage: 'complete' | 'unverified' = coverage
      if (base.coverage === 'unverified') nextCoverage = 'unverified'

      let nextCoverageReason: string | undefined

      if (nextCoverage === 'unverified') {
        if (coverage === 'unverified' && syncMeta.coverageReason !== undefined)
          nextCoverageReason = syncMeta.coverageReason
        if (
          nextCoverageReason === undefined &&
          syncFound.success?.coverageReason !== undefined
        )
          nextCoverageReason = syncFound.success.coverageReason
      }

      let lastFullReconcileAt = base.loadedAt
      if (syncFound.success !== undefined)
        lastFullReconcileAt = syncFound.success.lastFullReconcileAt

      let nextCheckpoint = syncMeta.checkpoint
      if (nextCheckpoint === undefined && syncFound.success !== undefined)
        nextCheckpoint = syncFound.success.checkpoint

      const now = new Date().toISOString()
      const hasStagingRows = staging !== undefined && staging.rowCount > 0
      const hasDataChanges =
        hasStagingRows || deletedIds.length > 0 || addedColumns.length > 0

      if (!hasDataChanges && nextCoverage === base.coverage) {
        const outcome = await this.atomic(db, async () => {
          const activePub = await db.connection.runAndReadAll(
            'SELECT generation_id FROM analytics_publications WHERE connection_id=? AND authorization_key=? AND selection_key=?',
            [
              owner.connectionInstanceId,
              owner.authorizationKey,
              owner.selectionKey,
            ],
          )
          const currentPublishedId = activePub
            .getRowObjects()
            .find(() => true)?.generation_id
          activePub.closeSync()
          if (currentPublishedId !== baseGenerationId)
            return failure('ANALYTICS_PUBLICATION_CONFLICT')

          const effectiveMeta: AnalyticsSyncMetadata = {
            ...syncMeta,
            strategy: 'incremental_changes',
            checkpoint: nextCheckpoint,
            coverageReason: nextCoverageReason,
          }

          await this.writeSyncState(
            db,
            owner,
            base.generation.manifest.id,
            nextCoverage,
            now,
            lastFullReconcileAt,
            effectiveMeta,
          )

          if (staging !== undefined) {
            await db.connection.run(
              `DROP TABLE ${identifier(tableName(staging.generation.generationId))}`,
            )
            await db.connection.run(
              'DELETE FROM analytics_generations WHERE generation_id=?',
              [staging.generation.generationId],
            )
          }

          return Either.success(
            buildPublication(
              base.generation,
              base.rowCount,
              base.coverage,
              nextCoverageReason,
              base.fetchedAt,
              base.loadedAt,
            ),
          )
        })

        if (outcome.isSuccess() && deltaGeneration !== undefined)
          this.activeGenerations.delete(deltaGeneration.generationId)

        return outcome
      }

      const newGenerationId = randomUUID()
      const outcome = await this.atomic(db, async () => {
        const activePub = await db.connection.runAndReadAll(
          'SELECT generation_id FROM analytics_publications WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
          ],
        )
        const currentPublishedId = activePub
          .getRowObjects()
          .find(() => true)?.generation_id
        activePub.closeSync()
        if (currentPublishedId !== baseGenerationId)
          return failure('ANALYTICS_PUBLICATION_CONFLICT')

        const newTable = identifier(tableName(newGenerationId))
        const baseTable = identifier(tableName(baseGenerationId))

        await db.connection.run(
          `CREATE TABLE ${newTable} AS SELECT * FROM ${baseTable}`,
        )

        for (const col of addedColumns)
          await db.connection.run(
            `ALTER TABLE ${newTable} ADD COLUMN ${identifier(col.name)} ${storageType(col.type)}`,
          )

        await db.connection.run(
          `CREATE UNIQUE INDEX ${identifier(`identity_${newGenerationId.replace(/-/g, '')}`)} ON ${newTable} (${identityCols.map(identifier).join(', ')})`,
        )

        if (parsedDeletes.length > 0) {
          const [identityColName] = identityCols
          if (identityColName === undefined)
            return failure('ANALYTICS_IDENTITY_COLUMN_MISSING')

          const deleteCol = identifier(identityColName)

          for (let offset = 0; offset < parsedDeletes.length; offset += 200) {
            const slice = parsedDeletes.slice(offset, offset + 200)
            const placeholders = slice.map(() => '?').join(', ')
            await db.connection.run(
              `DELETE FROM ${newTable} WHERE ${deleteCol} IN (${placeholders})`,
              slice,
            )
          }
        }

        if (staging !== undefined && staging.rowCount > 0) {
          const stagingTable = identifier(
            tableName(staging.generation.generationId),
          )
          const matchPredicate = identityCols
            .map(
              (col) => `${newTable}.${identifier(col)} = s.${identifier(col)}`,
            )
            .join(' AND ')

          await db.connection.run(
            `DELETE FROM ${newTable} WHERE EXISTS (SELECT 1 FROM ${stagingTable} AS s WHERE ${matchPredicate})`,
          )

          const stagingColsSql = staging.generation.manifest.columns
            .map((col) => identifier(col.name))
            .join(', ')
          await db.connection.run(
            `INSERT INTO ${newTable} (${stagingColsSql}) SELECT ${stagingColsSql} FROM ${stagingTable}`,
          )
        }

        const countReader = await db.connection.runAndReadAll(
          `SELECT count(1) AS total FROM ${newTable}`,
        )
        const totalRaw = countReader.getRowObjects().find(() => true)?.total
        countReader.closeSync()
        if (typeof totalRaw !== 'bigint')
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')
        const totalCount = Number(totalRaw)
        if (totalCount > 50000) return failure('ANALYTICS_LOAD_ROWS_LIMIT')

        const mergedManifest: AnalyticsDatasetManifest = {
          ...base.generation.manifest,
          columns: mergedColumns,
        }
        const mergedGeneration: AnalyticsGeneration = {
          ...owner,
          generationId: newGenerationId,
          manifest: mergedManifest,
          query: base.generation.query,
        }

        await db.connection.run(
          "INSERT INTO analytics_generations VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)",
          [
            newGenerationId,
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
            JSON.stringify(mergedManifest),
            JSON.stringify(base.generation.query),
            totalCount,
            nextCoverage,
            fetchedAt,
            now,
          ],
        )
        await db.connection.run(
          'UPDATE analytics_publications SET generation_id=? WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            newGenerationId,
            owner.connectionInstanceId,
            owner.authorizationKey,
            owner.selectionKey,
          ],
        )

        const effectiveMeta: AnalyticsSyncMetadata = {
          ...syncMeta,
          strategy: 'incremental_changes',
          checkpoint: nextCheckpoint,
          coverageReason: nextCoverageReason,
        }

        await this.writeSyncState(
          db,
          owner,
          mergedManifest.id,
          nextCoverage,
          now,
          lastFullReconcileAt,
          effectiveMeta,
        )

        if (staging !== undefined) {
          await db.connection.run(
            `DROP TABLE ${identifier(tableName(staging.generation.generationId))}`,
          )
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE generation_id=?',
            [staging.generation.generationId],
          )
        }

        await db.connection.run(`DROP TABLE ${baseTable}`)
        await db.connection.run(
          'DELETE FROM analytics_generations WHERE generation_id=?',
          [baseGenerationId],
        )

        return Either.success(
          buildPublication(
            mergedGeneration,
            totalCount,
            nextCoverage,
            nextCoverageReason,
            fetchedAt,
            now,
          ),
        )
      })

      if (outcome.isSuccess() && deltaGeneration !== undefined)
        this.activeGenerations.delete(deltaGeneration.generationId)

      return outcome
    })
  }

  private planSchemaMerge(
    baseManifest: AnalyticsDatasetManifest,
    staging: GenerationMetadata | undefined,
  ): Either<
    AppError,
    {
      mergedColumns: AnalyticsColumnSchema[]
      addedColumns: AnalyticsColumnSchema[]
    }
  > {
    const mergedColumns = [...baseManifest.columns]
    const addedColumns: AnalyticsColumnSchema[] = []

    if (staging !== undefined) {
      for (const col of staging.generation.manifest.columns) {
        const existing = mergedColumns.find(
          (item) => item.name.toLowerCase() === col.name.toLowerCase(),
        )

        if (
          existing !== undefined &&
          (existing.name !== col.name ||
            existing.type !== col.type ||
            existing.providerFieldId !== col.providerFieldId)
        )
          return failure('ANALYTICS_SCHEMA_CHANGED_DURING_LOAD')

        if (existing === undefined) {
          mergedColumns.push(col)
          addedColumns.push(col)
        }
      }
    }

    if (mergedColumns.length > 256)
      return failure('ANALYTICS_SCHEMA_COLUMNS_LIMIT')

    return Either.success({ mergedColumns, addedColumns })
  }

  public listPublications(
    workspaceId: string,
    authorizations: AnalyticsQueryAuthorization[],
  ): Promise<Either<AppError, AnalyticsPublicationEntry[]>> {
    if (authorizations.length === 0) return Promise.resolve(Either.success([]))

    return this.execute(workspaceId, async (db) => {
      const predicates: string[] = []
      const values: SqlScalar[] = []

      for (const auth of authorizations) {
        predicates.push('(p.connection_id=? AND p.authorization_key=?)')
        values.push(auth.connectionInstanceId, auth.authorizationKey)
      }

      const reader = await db.connection.runAndReadAll(
        `SELECT g.generation_id, g.connection_id, g.authorization_key, g.selection_key, g.manifest_json, g.query_json, g.row_count, g.coverage, g.fetched_at, g.loaded_at, s.dataset_id, s.strategy, s.checkpoint, s.last_fast_sync_at, s.last_full_reconcile_at, s.coverage AS s_coverage, s.coverage_reason, s.last_window_start, s.last_window_end, s.last_error, s.last_error_at FROM analytics_publications p JOIN analytics_generations g ON g.generation_id = p.generation_id LEFT JOIN analytics_sync_states s ON s.connection_id = p.connection_id AND s.authorization_key = p.authorization_key AND s.selection_key = p.selection_key WHERE ${predicates.join(' OR ')}`,
        values,
      )
      const rows = reader.getRowObjects()
      reader.closeSync()

      const entries: AnalyticsPublicationEntry[] = []

      for (const row of rows) {
        if (
          typeof row.generation_id !== 'string' ||
          typeof row.connection_id !== 'string' ||
          typeof row.authorization_key !== 'string' ||
          typeof row.selection_key !== 'string' ||
          typeof row.manifest_json !== 'string' ||
          typeof row.query_json !== 'string' ||
          (row.coverage !== 'complete' && row.coverage !== 'unverified') ||
          typeof row.fetched_at !== 'string' ||
          typeof row.loaded_at !== 'string'
        )
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')

        const manifest = analyticsManifestSchema.safeParse(
          JSON.parse(row.manifest_json),
        )
        const query = analyticsDatasetQuerySchema.safeParse(
          JSON.parse(row.query_json),
        )
        if (!manifest.success || !query.success)
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')

        const count = scalar(row.row_count, DuckDBTypeId.BIGINT)
        if (count.isFailure()) return count.forwardFailure()
        if (typeof count.success !== 'number')
          return failure('ANALYTICS_STORAGE_METADATA_INVALID')

        const generation: AnalyticsGeneration = {
          workspaceId,
          generationId: row.generation_id,
          connectionInstanceId: row.connection_id,
          authorizationKey: row.authorization_key,
          selectionKey: row.selection_key,
          manifest: manifest.data,
          query: query.data,
        }

        let syncState: AnalyticsSyncState = {
          connectionInstanceId: row.connection_id,
          selectionKey: row.selection_key,
          datasetId: manifest.data.id,
          strategy: 'full_replace',
          lastFastSyncAt: row.loaded_at,
          lastFullReconcileAt: row.loaded_at,
          coverage: row.coverage,
        }

        if (typeof row.dataset_id === 'string') {
          const decodedSync = this.decodeSyncStateRow({
            ...row,
            coverage: row.s_coverage,
          })
          if (decodedSync.isFailure()) return decodedSync.forwardFailure()

          syncState = decodedSync.success
        }

        const publication = buildPublication(
          generation,
          count.success,
          row.coverage,
          syncState.coverageReason,
          row.fetched_at,
          row.loaded_at,
        )

        entries.push({ publication, syncState })
      }

      return Either.success(entries)
    })
  }

  public getSyncState(
    owner: AnalyticsGenerationOwner,
  ): Promise<Either<AppError, AnalyticsSyncState | undefined>> {
    return this.execute(owner.workspaceId, async (db) =>
      this.readSyncState(db, owner),
    )
  }

  public recordSyncFailure(
    owner: AnalyticsGenerationOwner,
    errorMessage: string,
    failedAt: string,
  ): Promise<Either<AppError, void>> {
    return this.execute(owner.workspaceId, async (db) => {
      await db.connection.run(
        'UPDATE analytics_sync_states SET last_error=?, last_error_at=? WHERE connection_id=? AND authorization_key=? AND selection_key=?',
        [
          errorMessage,
          failedAt,
          owner.connectionInstanceId,
          owner.authorizationKey,
          owner.selectionKey,
        ],
      )

      return Either.success(undefined)
    })
  }

  public revokeConnection(
    workspaceId: string,
    connectionInstanceId: string,
  ): Promise<Either<AppError, void>> {
    return this.execute(
      workspaceId,
      async (db) => {
        const reader = await db.connection.runAndReadAll(
          'SELECT generation_id FROM analytics_generations WHERE connection_id=?',
          [connectionInstanceId],
        )
        const generationIds: string[] = []

        for (const row of reader.getRowObjects()) {
          if (typeof row.generation_id === 'string')
            generationIds.push(row.generation_id)
        }

        reader.closeSync()

        const outcome = await this.atomic(db, async () => {
          await db.connection.run(
            'DELETE FROM analytics_sync_states WHERE connection_id=?',
            [connectionInstanceId],
          )
          await db.connection.run(
            'DELETE FROM analytics_publications WHERE connection_id=?',
            [connectionInstanceId],
          )
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE connection_id=?',
            [connectionInstanceId],
          )

          for (const generationId of generationIds)
            await db.connection.run(
              `DROP TABLE IF EXISTS ${identifier(tableName(generationId))}`,
            )

          return Either.success(undefined)
        })

        if (outcome.isSuccess()) {
          for (const generationId of generationIds)
            this.activeGenerations.delete(generationId)
        }

        return outcome
      },
      'cleanup',
    )
  }

  public getWorkspaceState(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsWorkspaceState | undefined>> {
    return this.execute(workspaceId, async (db) => {
      const reader = await db.connection.runAndReadAll(
        'SELECT workspace_id, polling_interval_minutes, spaces_json, date_from, date_to, updated_at FROM analytics_workspace_settings WHERE workspace_id=?',
        [workspaceId],
      )
      const row = reader.getRowObjects().find(() => true)
      reader.closeSync()
      if (row === undefined) return Either.success(undefined)

      if (
        typeof row.workspace_id !== 'string' ||
        typeof row.updated_at !== 'string'
      )
        return failure('ANALYTICS_STORAGE_METADATA_INVALID')

      const interval = scalar(
        row.polling_interval_minutes,
        DuckDBTypeId.INTEGER,
      )
      if (interval.isFailure() || typeof interval.success !== 'number')
        return failure('ANALYTICS_STORAGE_METADATA_INVALID')

      const spacesJson = readOptionalString(row.spaces_json)
      if (spacesJson.isFailure()) return spacesJson.forwardFailure()

      const startDate = readOptionalString(row.date_from)
      if (startDate.isFailure()) return startDate.forwardFailure()

      const endDate = readOptionalString(row.date_to)
      if (endDate.isFailure()) return endDate.forwardFailure()

      const state: AnalyticsWorkspaceState = {
        workspaceId: row.workspace_id,
        pollingIntervalMinutes: interval.success,
        updatedAt: row.updated_at,
      }

      if (spacesJson.success !== undefined)
        state.spacesJson = spacesJson.success
      if (startDate.success !== undefined) state.startDate = startDate.success
      if (endDate.success !== undefined) state.endDate = endDate.success

      return Either.success(state)
    })
  }

  public saveWorkspaceState(
    input: SaveAnalyticsWorkspaceStateInput,
  ): Promise<Either<AppError, AnalyticsWorkspaceState>> {
    if (!input.workspaceId.trim() || input.pollingIntervalMinutes < 0)
      return Promise.resolve(failure('ANALYTICS_WORKSPACE_STATE_INVALID'))

    return this.execute(input.workspaceId, async (db) => {
      const updatedAt = new Date().toISOString()

      await db.connection.run(
        'INSERT INTO analytics_workspace_settings VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET polling_interval_minutes=excluded.polling_interval_minutes, spaces_json=excluded.spaces_json, date_from=excluded.date_from, date_to=excluded.date_to, updated_at=excluded.updated_at',
        [
          input.workspaceId,
          input.pollingIntervalMinutes,
          nullableString(input.spacesJson),
          nullableString(input.startDate),
          nullableString(input.endDate),
          updatedAt,
        ],
      )

      const saved: AnalyticsWorkspaceState = {
        workspaceId: input.workspaceId,
        pollingIntervalMinutes: input.pollingIntervalMinutes,
        updatedAt,
      }

      if (input.spacesJson !== undefined) saved.spacesJson = input.spacesJson
      if (input.startDate !== undefined) saved.startDate = input.startDate
      if (input.endDate !== undefined) saved.endDate = input.endDate

      return Either.success(saved)
    })
  }

  private async inspectConnection(
    connection: DuckDBConnection,
    workspaceId: string,
    dbPath: string,
    bytes: number,
  ): Promise<AnalyticsStorageInspection> {
    const tablesReader = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='main'",
    )
    const tableNames = new Set<string>()

    for (const row of tablesReader.getRowObjects()) {
      if (typeof row.table_name === 'string') tableNames.add(row.table_name)
    }

    tablesReader.closeSync()

    if (tableNames.has('analytics_format')) {
      const formatReader = await connection.runAndReadAll(
        'SELECT version FROM analytics_format LIMIT 2',
      )
      const versions = formatReader.getRowObjects()
      formatReader.closeSync()

      if (
        versions.length === 0 ||
        versions.length > 1 ||
        versions.some((row) => row.version !== 2)
      )
        return {
          exists: true,
          healthy: false,
          dbPath,
          bytes,
          reason: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
          details: {
            storagePath: [dbPath],
            storedFormatVersion: versions.map((row) => String(row.version)),
            supportedFormatVersion: ['2'],
          },
        }
    }

    if (
      !tableNames.has('analytics_format') ||
      REQUIRED_ANALYTICS_TABLES.some((name) => !tableNames.has(name))
    )
      return {
        exists: true,
        healthy: false,
        dbPath,
        bytes,
        reason: 'ANALYTICS_STORAGE_METADATA_INVALID',
        details: { storagePath: [dbPath] },
      }

    const settingsReader = await connection.runAndReadAll(
      'SELECT spaces_json FROM analytics_workspace_settings WHERE workspace_id=?',
      [workspaceId],
    )
    const settingsRow = settingsReader.getRowObjects().find(() => true)
    settingsReader.closeSync()

    let spacesCount = 0

    if (settingsRow !== undefined && settingsRow.spaces_json !== null) {
      if (typeof settingsRow.spaces_json !== 'string')
        return {
          exists: true,
          healthy: false,
          dbPath,
          bytes,
          reason: 'ANALYTICS_STORAGE_METADATA_INVALID',
          details: { storagePath: [dbPath] },
        }

      const validSpaces = validatePersistedAnalyticsSpacesJson(
        settingsRow.spaces_json,
      )
      if (validSpaces.isFailure())
        return {
          exists: true,
          healthy: false,
          dbPath,
          bytes,
          reason: 'ANALYTICS_SPACES_STATE_INVALID',
          details: { storagePath: [dbPath] },
        }

      const parsedSpaces: JsonValue = JSON.parse(settingsRow.spaces_json)
      if (Array.isArray(parsedSpaces)) spacesCount = parsedSpaces.length
    }

    const publicationsReader = await connection.runAndReadAll(
      'SELECT count(1) AS total FROM analytics_publications',
    )
    const publicationsTotal = publicationsReader
      .getRowObjects()
      .find(() => true)?.total
    publicationsReader.closeSync()

    if (typeof publicationsTotal !== 'bigint')
      return {
        exists: true,
        healthy: false,
        dbPath,
        bytes,
        reason: 'ANALYTICS_STORAGE_METADATA_INVALID',
        details: { storagePath: [dbPath] },
      }

    return {
      exists: true,
      healthy: true,
      dbPath,
      bytes,
      spacesCount,
      publicationsCount: Number(publicationsTotal),
    }
  }

  public inspectWorkspaceStorage(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsStorageInspection>> {
    if (!workspaceId.trim())
      return Promise.resolve(failure('WORKSPACE_ID_REQUIRED'))

    return this.runSerialized('normal', async () => {
      const paths = this.storagePaths(workspaceId)
      const [dbStat, walStat, tmpStat] = await Promise.all([
        this.inspectFileStat(paths.dbPath),
        this.inspectFileStat(paths.walPath),
        this.inspectFileStat(paths.tmpPath),
      ])

      const statFailure = [dbStat, walStat, tmpStat].find(
        (item) => 'errorReason' in item,
      )

      if (statFailure !== undefined && 'errorReason' in statFailure)
        return Either.success<AnalyticsStorageInspection>({
          exists: true,
          healthy: false,
          dbPath: paths.dbPath,
          bytes: dbStat.bytes + walStat.bytes + tmpStat.bytes,
          reason: 'ANALYTICS_STORAGE_UNREADABLE',
          details: {
            storagePath: [paths.dbPath],
            reason: [statFailure.errorReason],
          },
        })

      const totalBytes = dbStat.bytes + walStat.bytes + tmpStat.bytes

      if (!dbStat.exists && walStat.exists)
        return Either.success<AnalyticsStorageInspection>({
          exists: true,
          healthy: false,
          dbPath: paths.dbPath,
          bytes: totalBytes,
          reason: 'ANALYTICS_STORAGE_WAL_ORPHAN',
          details: { storagePath: [paths.walPath] },
        })

      if (!dbStat.exists)
        return Either.success<AnalyticsStorageInspection>({
          exists: false,
          dbPath: paths.dbPath,
        })

      const cached = this.databases.get(workspaceId)
      if (cached !== undefined)
        return Either.success(
          await this.inspectConnection(
            cached.connection,
            workspaceId,
            paths.dbPath,
            totalBytes,
          ),
        )

      let instance: DuckDBInstance | undefined
      let connection: DuckDBConnection | undefined

      try {
        instance = await DuckDBInstance.create(paths.dbPath, {
          access_mode: 'READ_ONLY',
          threads: '2',
          memory_limit: '128MB',
          enable_external_access: 'false',
          autoinstall_known_extensions: 'false',
          allow_community_extensions: 'false',
        })
        connection = await instance.connect()
        const result = await this.inspectConnection(
          connection,
          workspaceId,
          paths.dbPath,
          totalBytes,
        )
        return Either.success(result)
      } catch (error) {
        const parsed = systemErrorSchema.safeParse(error)
        let reason = 'ANALYTICS_STORAGE_UNREADABLE'
        if (parsed.success && parsed.data.message !== undefined)
          reason = parsed.data.message

        return Either.success<AnalyticsStorageInspection>({
          exists: true,
          healthy: false,
          dbPath: paths.dbPath,
          bytes: totalBytes,
          reason: 'ANALYTICS_STORAGE_UNREADABLE',
          details: {
            storagePath: [paths.dbPath],
            reason: [reason],
          },
        })
      } finally {
        if (connection !== undefined) connection.closeSync()
        if (instance !== undefined) instance.closeSync()
      }
    })
  }

  public resetStorage(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsResetStorageResult>> {
    if (!workspaceId.trim())
      return Promise.resolve(failure('WORKSPACE_ID_REQUIRED'))

    return this.runSerialized('cleanup', async () => {
      for (const activeWorkspaceId of this.activeGenerations.values()) {
        if (activeWorkspaceId === workspaceId)
          return Either.failure(
            AppError.Http(409, 'ANALYTICS_RESET_ACTIVE_LOAD'),
          )
      }

      const cached = this.databases.get(workspaceId)

      if (cached !== undefined) {
        cached.connection.closeSync()
        cached.instance.closeSync()
        this.databases.delete(workspaceId)
      }

      const paths = this.storagePaths(workspaceId)
      const [dbStat, walStat, tmpStat] = await Promise.all([
        this.inspectFileStat(paths.dbPath),
        this.inspectFileStat(paths.walPath),
        this.inspectFileStat(paths.tmpPath),
      ])
      const removed = dbStat.exists || walStat.exists || tmpStat.exists

      try {
        await rm(paths.dbPath, { force: true })
        await rm(paths.walPath, { force: true })
        await rm(paths.tmpPath, { recursive: true, force: true })
      } catch (error) {
        const parsed = systemErrorSchema.safeParse(error)
        let reason = 'ANALYTICS_STORAGE_RESET_FAILED'
        if (parsed.success && parsed.data.message !== undefined)
          reason = parsed.data.message

        return Either.failure(
          AppError.Internal('ANALYTICS_STORAGE_UNREADABLE', {
            storagePath: [paths.dbPath],
            reason: [reason],
          }),
        )
      }

      return Either.success({ workspaceId, removed })
    })
  }

  public remove(
    generation: AnalyticsGeneration,
  ): Promise<Either<AppError, void>> {
    return this.execute(
      generation.workspaceId,
      async (db) => {
        const found = await this.metadata(
          db,
          generation.workspaceId,
          generation.generationId,
        )
        if (found.isFailure()) return found.forwardFailure()

        if (
          found.success.state !== 'staging' ||
          !ownerMatches(found.success.generation, generation)
        )
          return failure('ANALYTICS_GENERATION_NOT_WRITABLE')

        const outcome = await this.atomic(db, async () => {
          await db.connection.run(
            `DROP TABLE ${identifier(tableName(generation.generationId))}`,
          )
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE generation_id=?',
            [generation.generationId],
          )

          return Either.success(undefined)
        })

        if (outcome.isSuccess())
          this.activeGenerations.delete(generation.generationId)

        return outcome
      },
      'cleanup',
    )
  }

  public query(
    input: AnalyticsQueryInput,
    authorizations: AnalyticsQueryAuthorization[],
  ): Promise<Either<AppError, AnalyticsQueryResult>> {
    const validated = analyticsLocalQuerySchema.safeParse(input)
    if (!validated.success)
      return Promise.resolve(failure('ANALYTICS_QUERY_INVALID'))

    return this.execute(input.workspaceId, async (db) => {
      const sources = new Map<string, StoredAnalyticsSource>()
      const reasons: string[] = []

      for (const node of input.nodes) {
        if (node.kind !== 'source') continue

        const authorization = authorizations.find(
          (item) => item.connectionInstanceId === node.connectionInstanceId,
        )
        if (authorization === undefined)
          return Either.failure(
            AppError.Unauthorized('ANALYTICS_SOURCE_NOT_AUTHORIZED', {
              connectionInstanceIds: [node.connectionInstanceId],
            }),
          )

        const lookup = await db.connection.runAndReadAll(
          'SELECT generation_id FROM analytics_publications WHERE connection_id=? AND authorization_key=? AND selection_key=?',
          [
            node.connectionInstanceId,
            authorization.authorizationKey,
            node.selectionKey,
          ],
        )
        const generationId = lookup
          .getRowObjects()
          .find(() => true)?.generation_id
        lookup.closeSync()
        if (typeof generationId !== 'string')
          return Either.failure(
            AppError.NotFound('ANALYTICS_PUBLICATION_NOT_AVAILABLE'),
          )

        const metadata = await this.metadata(
          db,
          input.workspaceId,
          generationId,
        )
        if (metadata.isFailure()) return metadata.forwardFailure()

        const syncState = await this.readSyncState(db, {
          workspaceId: input.workspaceId,
          connectionInstanceId: node.connectionInstanceId,
          authorizationKey: authorization.authorizationKey,
          selectionKey: node.selectionKey,
        })
        if (syncState.isFailure()) return syncState.forwardFailure()

        if (
          metadata.success.coverage === 'unverified' &&
          syncState.success?.coverageReason !== undefined
        )
          reasons.push(syncState.success.coverageReason)

        sources.set(node.id, {
          tableName: tableName(generationId),
          columns: metadata.success.generation.manifest.columns,
          remoteAggregate:
            metadata.success.generation.query.execution?.kind === 'aggregate',
          generationId,
          coverage: metadata.success.coverage,
          loadedAt: metadata.success.loadedAt,
        })
      }

      const version = createHash('sha256')
        .update(
          JSON.stringify([
            input.nodes,
            input.targetNodeId,
            input.projection,
            input.filters,
            input.search,
            input.groupBy,
            input.measures,
            input.pivot,
            input.calculation,
            input.rollup,
            Array.from(sources.entries()).map(([id, source]) => [
              id,
              source.generationId,
            ]),
          ]),
        )
        .digest('hex')

      if (
        (input.offset > 0 && input.version === undefined) ||
        (input.version !== undefined && input.version !== version)
      )
        return failure('ANALYTICS_QUERY_VERSION_CHANGED')

      const compiled = await new AnalyticsSqlCompiler(
        db.connection,
        sources,
      ).compile(input)
      if (compiled.isFailure()) return compiled.forwardFailure()

      const relation = compiled.success
      const count = await db.connection.runAndReadAll(
        `WITH result AS (${relation.sql}) SELECT count(1) AS total FROM result`,
        relation.values,
      )
      const countValue = count.getRowObjects().find(() => true)?.total
      count.closeSync()
      if (
        typeof countValue !== 'bigint' ||
        !Number.isSafeInteger(Number(countValue))
      )
        return failure('ANALYTICS_RESULT_COUNT_INVALID')

      let ordering = ''
      if (!relation.ordered)
        ordering = ` ORDER BY ${relation.columns
          .map((column) => {
            if (column.type === 'date')
              return `CAST(${identifier(column.name)} AS TIMESTAMPTZ) ASC NULLS LAST`

            return `${identifier(column.name)} ASC NULLS LAST`
          })
          .join(', ')}`

      const reader = await db.connection.runAndReadAll(
        `WITH result AS (${relation.sql}) SELECT ${relation.columns.map((column) => identifier(column.name)).join(', ')} FROM result${ordering} LIMIT ? OFFSET ?`,
        [...relation.values, input.limit + 1, input.offset],
      )
      const rows: AnalyticsDatasetRow[] = []
      const rawRows = reader.getRows()

      for (const rawRow of rawRows.slice(0, input.limit)) {
        const row: AnalyticsDatasetRow = {}

        for (let index = 0; index < reader.columnCount; index += 1) {
          const value = rawRow.at(index)

          if (value === undefined) {
            reader.closeSync()
            return failure('ANALYTICS_RESULT_VALUE_MISSING')
          }

          const decoded = scalar(value, reader.columnTypeId(index))

          if (decoded.isFailure()) {
            reader.closeSync()
            return decoded.forwardFailure()
          }

          row[reader.columnName(index)] = decoded.success
        }

        rows.push(row)
      }

      reader.closeSync()

      let coverage: 'complete' | 'unverified' = 'complete'
      let loadedAt = ''

      for (const source of sources.values()) {
        if (source.coverage === 'unverified') coverage = 'unverified'
        if (loadedAt === '' || source.loadedAt < loadedAt)
          loadedAt = source.loadedAt
      }

      const result: AnalyticsQueryResult = {
        columns: relation.columns,
        rows,
        totalRows: Number(countValue),
        offset: input.offset,
        limit: input.limit,
        hasMore: rawRows.length > input.limit,
        version,
        coverage,
        loadedAt,
        remoteAggregate: relation.remoteAggregate,
        groupingColumn: relation.groupingColumn,
      }

      const lastReason = reasons.at(-1)
      if (coverage === 'unverified' && lastReason !== undefined)
        result.coverageReason = lastReason

      return Either.success(result)
    })
  }

  public async close(): Promise<void> {
    this.closed = true
    await this.tail

    for (const db of this.databases.values()) {
      db.connection.closeSync()
      db.instance.closeSync()
    }

    this.databases.clear()
    this.activeGenerations.clear()
  }
}
