import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBTypeId,
  DuckDBValue,
} from '@duckdb/node-api'
import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetCellValue,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsDatasetRow,
  AnalyticsGeneration,
  AnalyticsGenerationOwner,
  AnalyticsPublication,
  AnalyticsQueryAuthorization,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAnalyticsEngine,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
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

/** One native store for analytical generations; no operational entities or credentials. */

export class DuckDBAnalyticsEngine implements IAnalyticsEngine {
  private readonly databases = new Map<string, Database>()
  private readonly activeGenerations = new Set<string>()
  private tail: Promise<void> = Promise.resolve()
  private pending = 0
  private closed = false

  constructor(private readonly directory: string) {}

  private execute<T>(
    workspaceId: string,
    operation: (db: Database) => Promise<Either<AppError, T>>,
    admission: 'normal' | 'cleanup' = 'normal',
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
      .then(async () => {
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
    const path = join(
      this.directory,
      `${createHash('sha256').update(workspaceId).digest('hex')}.duckdb`,
    )
    const instance = await DuckDBInstance.create(path, {
      threads: '2',
      memory_limit: '256MB',
      enable_external_access: 'false',
      autoinstall_known_extensions: 'false',
      allow_community_extensions: 'false',
    })
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
        await connection.run('INSERT INTO analytics_format VALUES (1)')
      if (versions.length > 1 || versions.some((row) => row.version !== 1))
        return failure('ANALYTICS_STORAGE_FORMAT_UNSUPPORTED')
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_generations(generation_id VARCHAR PRIMARY KEY, connection_id VARCHAR NOT NULL, authorization_key VARCHAR NOT NULL, selection_key VARCHAR NOT NULL, manifest_json VARCHAR NOT NULL, query_json VARCHAR NOT NULL, row_count BIGINT NOT NULL, state VARCHAR NOT NULL, coverage VARCHAR NOT NULL, fetched_at VARCHAR NOT NULL, loaded_at VARCHAR NOT NULL)',
      )
      await connection.run(
        'CREATE TABLE IF NOT EXISTS analytics_publications(connection_id VARCHAR NOT NULL, authorization_key VARCHAR NOT NULL, selection_key VARCHAR NOT NULL, generation_id VARCHAR NOT NULL, PRIMARY KEY(connection_id,authorization_key,selection_key))',
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
      ),
      query = analyticsDatasetQuerySchema.safeParse(JSON.parse(row.query_json))
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
        this.activeGenerations.add(generation.generationId)
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
      if (stored.rowCount + batch.rows.length > 50000)
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

      return this.atomic(db, async () => {
        for (const column of added)
          await db.connection.run(
            `ALTER TABLE ${identifier(tableName(generation.generationId))} ADD COLUMN ${identifier(column.name)} ${storageType(column.type)}`,
          )

        for (let offset = 0; offset < batch.rows.length; offset += 100) {
          const rows = batch.rows.slice(offset, offset + 100)
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
            `INSERT INTO ${identifier(tableName(generation.generationId))} (${columns.map((column) => identifier(column.name)).join(', ')}) VALUES ${tuples.join(', ')}`,
            values,
          )
        }

        const manifest = { ...stored.generation.manifest, columns }
        await db.connection.run(
          'UPDATE analytics_generations SET manifest_json=?, row_count=row_count+? WHERE generation_id=?',
          [
            JSON.stringify(manifest),
            batch.rows.length,
            generation.generationId,
          ],
        )
        return Either.success(undefined)
      })
    })
  }

  public publish(
    generation: AnalyticsGeneration,
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
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

        if (typeof oldId === 'string' && oldId !== generation.generationId) {
          await db.connection.run(`DROP TABLE ${identifier(tableName(oldId))}`)
          await db.connection.run(
            'DELETE FROM analytics_generations WHERE generation_id=?',
            [oldId],
          )
        }

        return Either.success({
          generationId: generation.generationId,
          selectionKey: generation.selectionKey,
          connectionInstanceId: generation.connectionInstanceId,
          manifest: found.success.generation.manifest,
          query: found.success.generation.query,
          rowCount: found.success.rowCount,
          coverage,
          loadedAt,
          fetchedAt,
          remoteAggregate: generation.query.execution?.kind === 'aggregate',
        })
      })
      if (outcome.isSuccess())
        this.activeGenerations.delete(generation.generationId)
      return outcome
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

      for (const node of input.nodes) {
        if (node.kind !== 'source') continue
        const authorization = authorizations.find(
          (item) => item.connectionInstanceId === node.connectionInstanceId,
        )
        if (authorization === undefined)
          return Either.failure(
            AppError.Unauthorized('ANALYTICS_SOURCE_NOT_AUTHORIZED'),
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

      return Either.success({
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
      })
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
