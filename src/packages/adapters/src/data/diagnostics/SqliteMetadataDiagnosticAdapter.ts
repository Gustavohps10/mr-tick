import fs from 'node:fs/promises'

import type {
  DiagnosticCheckResult,
  DiagnosticStorageItem,
  IMetadataDiagnosticAdapter,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Knex } from 'knex'

import { resolveSQLiteFilename } from '../repositories/sqlite-connection'

export class SqliteMetadataDiagnosticAdapter implements IMetadataDiagnosticAdapter {
  constructor(
    private readonly db: Knex,
    private readonly storagePath: string,
  ) {}

  async checkStorage(): Promise<Either<AppError, DiagnosticStorageItem>> {
    const filename = resolveSQLiteFilename(this.storagePath)
    const collectedAt = new Date().toISOString()

    if (filename === ':memory:') {
      return Either.success({
        id: 'metadata-sqlite',
        name: 'Workspaces Metadata (SQLite)',
        role: 'metadata',
        technology: 'sqlite',
        location: ':memory:',
        measurement: {
          status: 'not-supported',
          reason: 'MEMORY_STORAGE_NO_PHYSICAL_FILE',
          collectedAt,
        },
      })
    }

    try {
      const mainStat = await fs.stat(filename)
      let totalBytes = mainStat.size

      const walPath = `${filename}-wal`
      try {
        const walStat = await fs.stat(walPath)
        totalBytes += walStat.size
      } catch (walError) {
        if (
          !this.isMissingFileError(
            typeof walError === 'object' ? walError : null,
          )
        ) {
          const reason =
            walError instanceof Error ? walError.message : 'WAL_STAT_ERROR'
          return Either.success({
            id: 'metadata-sqlite',
            name: 'Workspaces Metadata (SQLite)',
            role: 'metadata',
            technology: 'sqlite',
            location: filename,
            measurement: {
              status: 'unavailable',
              reason,
              collectedAt,
            },
          })
        }
      }

      const shmPath = `${filename}-shm`
      try {
        const shmStat = await fs.stat(shmPath)
        totalBytes += shmStat.size
      } catch (shmError) {
        if (
          !this.isMissingFileError(
            typeof shmError === 'object' ? shmError : null,
          )
        ) {
          const reason =
            shmError instanceof Error ? shmError.message : 'SHM_STAT_ERROR'
          return Either.success({
            id: 'metadata-sqlite',
            name: 'Workspaces Metadata (SQLite)',
            role: 'metadata',
            technology: 'sqlite',
            location: filename,
            measurement: {
              status: 'unavailable',
              reason,
              collectedAt,
            },
          })
        }
      }

      return Either.success({
        id: 'metadata-sqlite',
        name: 'Workspaces Metadata (SQLite)',
        role: 'metadata',
        technology: 'sqlite',
        location: filename,
        measurement: {
          status: 'available',
          bytes: totalBytes,
          precision: 'exact',
          coverage: 'file',
          unit: 'bytes',
          collectedAt,
        },
      })
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'STORAGE_FILE_NOT_FOUND'
      return Either.success({
        id: 'metadata-sqlite',
        name: 'Workspaces Metadata (SQLite)',
        role: 'metadata',
        technology: 'sqlite',
        location: filename,
        measurement: {
          status: 'unavailable',
          reason,
          collectedAt,
        },
      })
    }
  }

  async readProbe(): Promise<Either<AppError, DiagnosticCheckResult>> {
    const startedAt = new Date().toISOString()
    const startTime = Date.now()
    try {
      await this.db.raw('SELECT id FROM workspaces LIMIT 1;')
      const durationMs = Math.max(0, Date.now() - startTime)
      const finishedAt = new Date().toISOString()
      return Either.success({
        id: 'probe-metadata-read',
        name: 'Metadata Storage Read Probe',
        capability: 'metadata.read',
        source: 'metadata',
        scope: { type: 'application' },
        status: 'pass',
        provenOperation: 'read_workspaces_id',
        startedAt,
        finishedAt,
        durationMs,
      })
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - startTime)
      const finishedAt = new Date().toISOString()
      const reason =
        error instanceof Error ? error.message : 'SQLITE_PROBE_FAILED'
      return Either.success({
        id: 'probe-metadata-read',
        name: 'Metadata Storage Read Probe',
        capability: 'metadata.read',
        source: 'metadata',
        scope: { type: 'application' },
        status: 'fail',
        reason,
        startedAt,
        finishedAt,
        durationMs,
      })
    }
  }

  private isFileSystemError(error: object | null): error is { code?: string } {
    if (error === null) return false
    return 'code' in error
  }

  private isMissingFileError(error: object | null): boolean {
    if (!this.isFileSystemError(error)) return false
    return error.code === 'ENOENT'
  }
}
