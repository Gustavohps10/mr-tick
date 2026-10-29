import type {
  AddonStorageEntry,
  AddonStorageListPage,
  AddonStorageListRequest,
  IAddonStorageRepository,
} from '@mr-tick/application'
import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'
import type { Knex } from 'knex'

import {
  createSQLiteConnection,
  ensureDatabaseSchema,
} from './sqlite-connection'

interface AddonStorageRow {
  readonly addon_id: string
  readonly scope_key: string
  readonly key: string
  readonly value: string
  readonly updated_at: string
}

export class SQLiteAddonStorageRepository implements IAddonStorageRepository {
  private readonly db: Knex
  private readonly ownsConnection: boolean
  private writeQueue: Promise<void> = Promise.resolve()
  private schemaInitPromise: Promise<Either<AppError, void>> | null = null

  constructor(databaseOrPath: Knex | string) {
    if (typeof databaseOrPath === 'string') {
      this.db = createSQLiteConnection(databaseOrPath)
      this.ownsConnection = true
      return
    }
    this.db = databaseOrPath
    this.ownsConnection = false
  }

  private async initializeSchema(): Promise<Either<AppError, void>> {
    if (this.schemaInitPromise === null) {
      this.schemaInitPromise = ensureDatabaseSchema(this.db)
    }
    return this.schemaInitPromise
  }

  public async get(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    if (!isValidAddress(addonId, scopeKey, key)) {
      return Either.failure(
        AppError.ValidationError('ADDON_STORAGE_ADDRESS_INVALID'),
      )
    }
    const schemaResult = await this.initializeSchema()
    if (schemaResult.isFailure()) return schemaResult.forwardFailure()

    try {
      const row = await this.db<AddonStorageRow>('addon_storage')
        .select('value')
        .where({
          addon_id: addonId,
          scope_key: scopeKey,
          key,
        })
        .first()

      if (row === undefined) return Either.success(null)
      return Either.success(row.value)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('ADDON_STORAGE_READ_FAILED'))
    }
  }

  public async set(
    addonId: string,
    scopeKey: string,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    if (!isValidAddress(addonId, scopeKey, key)) {
      return Either.failure(
        AppError.ValidationError('ADDON_STORAGE_ADDRESS_INVALID'),
      )
    }
    const schemaResult = await this.initializeSchema()
    if (schemaResult.isFailure()) return schemaResult.forwardFailure()

    return this.enqueueWrite(async () => {
      const now = new Date().toISOString()
      try {
        await this.db('addon_storage')
          .insert({
            addon_id: addonId,
            scope_key: scopeKey,
            key,
            value,
            updated_at: now,
          })
          .onConflict(['addon_id', 'scope_key', 'key'])
          .merge({
            value,
            updated_at: now,
          })

        return Either.success()
      } catch (error) {
        if (error instanceof Error) {
          return Either.failure(AppError.Internal(error.message))
        }
        return Either.failure(AppError.Internal('ADDON_STORAGE_WRITE_FAILED'))
      }
    })
  }

  public async delete(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, void>> {
    if (!isValidAddress(addonId, scopeKey, key)) {
      return Either.failure(
        AppError.ValidationError('ADDON_STORAGE_ADDRESS_INVALID'),
      )
    }
    const schemaResult = await this.initializeSchema()
    if (schemaResult.isFailure()) return schemaResult.forwardFailure()

    return this.enqueueWrite(async () => {
      try {
        await this.db('addon_storage')
          .where({
            addon_id: addonId,
            scope_key: scopeKey,
            key,
          })
          .delete()

        return Either.success()
      } catch (error) {
        if (error instanceof Error) {
          return Either.failure(AppError.Internal(error.message))
        }
        return Either.failure(AppError.Internal('ADDON_STORAGE_DELETE_FAILED'))
      }
    })
  }

  public async list(
    addonId: string,
    scopeKey: string,
    request: AddonStorageListRequest,
  ): Promise<Either<AppError, AddonStorageListPage>> {
    if (!isNonEmptyString(addonId) || !isNonEmptyString(scopeKey)) {
      return Either.failure(
        AppError.ValidationError('ADDON_STORAGE_ADDRESS_INVALID'),
      )
    }
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100
    ) {
      return Either.failure(AppError.ValidationError('STORAGE_LIMIT_INVALID'))
    }
    const schemaResult = await this.initializeSchema()
    if (schemaResult.isFailure()) return schemaResult.forwardFailure()

    try {
      let query = this.db<AddonStorageRow>('addon_storage')
        .select('key', 'value')
        .where({
          addon_id: addonId,
          scope_key: scopeKey,
        })

      if (request.prefix !== undefined && request.prefix.length > 0) {
        query = query.whereRaw('substr(key, 1, length(?)) = ?', [
          request.prefix,
          request.prefix,
        ])
      }

      if (request.cursor !== undefined && request.cursor.length > 0) {
        query = query.where('key', '>', request.cursor)
      }

      const rows = await query.orderBy('key', 'asc').limit(request.limit + 1)

      const hasMore = rows.length > request.limit
      const pageRows = hasMore ? rows.slice(0, request.limit) : rows

      const entries: readonly AddonStorageEntry[] = pageRows.map((row) => ({
        key: row.key,
        value: row.value,
      }))

      if (hasMore) {
        const lastRow = pageRows[pageRows.length - 1]
        if (lastRow === undefined) {
          return Either.failure(AppError.Internal('STORAGE_PAGE_INVALID'))
        }
        return Either.success({
          entries,
          hasMore: true,
          nextCursor: lastRow.key,
        })
      }

      return Either.success({
        entries,
        hasMore: false,
      })
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('ADDON_STORAGE_LIST_FAILED'))
    }
  }

  private async enqueueWrite<T>(
    operation: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    let resolveQueue: () => void = () => {}
    const nextPromise = new Promise<void>((resolve) => {
      resolveQueue = resolve
    })
    const currentPromise = this.writeQueue
    this.writeQueue = currentPromise.then(() => nextPromise)
    await currentPromise
    try {
      return await operation()
    } finally {
      resolveQueue()
    }
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.db.destroy()
    }
  }
}

function isValidAddress(
  addonId: string,
  scopeKey: string,
  key: string,
): boolean {
  return (
    isNonEmptyString(addonId) &&
    isNonEmptyString(scopeKey) &&
    isNonEmptyString(key)
  )
}
