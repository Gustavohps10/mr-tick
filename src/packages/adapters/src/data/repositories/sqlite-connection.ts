import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AppError, Either } from '@mr-tick/shared/helpers'
import knex, { Knex } from 'knex'

declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath?: string
    }
  }
}

function getElectronAppPath(): string | undefined {
  try {
    const electron = require('electron')
    if (
      electron !== undefined &&
      electron.app !== undefined &&
      typeof electron.app.getAppPath === 'function'
    ) {
      return electron.app.getAppPath()
    }
  } catch {
    // not in electron environment or electron module not available
  }
  return undefined
}

export function resolveNativeBinding(): string | undefined {
  const isElectron = Boolean(process.versions.electron)
  if (!isElectron) return undefined

  if (process.resourcesPath) {
    const candidatePaths = [
      path.join(
        process.resourcesPath,
        'native-prebuilds',
        'better_sqlite3_electron.node',
      ),
      path.join(process.resourcesPath, 'better_sqlite3_electron.node'),
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node',
      ),
    ]
    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) return candidate
    }
  }

  const appPath = getElectronAppPath()
  if (appPath) {
    const appCandidates = [
      path.join(appPath, 'native-prebuilds', 'better_sqlite3_electron.node'),
      path.join(
        appPath,
        'out',
        'main',
        'native-prebuilds',
        'better_sqlite3_electron.node',
      ),
      path.join(
        appPath,
        '..',
        'native-prebuilds',
        'better_sqlite3_electron.node',
      ),
    ]
    for (const candidate of appCandidates) {
      if (fs.existsSync(candidate)) return candidate
    }
  }

  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
  const relativeCandidates = [
    path.resolve(
      currentDirectory,
      'native-prebuilds',
      'better_sqlite3_electron.node',
    ),
    path.resolve(
      currentDirectory,
      '../native-prebuilds',
      'better_sqlite3_electron.node',
    ),
    path.resolve(
      currentDirectory,
      '../../native-prebuilds',
      'better_sqlite3_electron.node',
    ),
    path.resolve(
      currentDirectory,
      '../../../native-prebuilds',
      'better_sqlite3_electron.node',
    ),
    path.resolve(
      currentDirectory,
      '../../../../apps/desktop/native-prebuilds/better_sqlite3_electron.node',
    ),
    path.resolve(
      currentDirectory,
      '../../../../src/apps/desktop/native-prebuilds/better_sqlite3_electron.node',
    ),
  ]
  for (const candidate of relativeCandidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return undefined
}

export function resolveSQLiteFilename(storagePath: string): string {
  if (storagePath === ':memory:') return ':memory:'
  if (storagePath.endsWith('.sqlite') || storagePath.endsWith('.db'))
    return storagePath
  return path.join(storagePath, 'workspaces.sqlite')
}

export function createSQLiteConnection(storagePath: string): Knex {
  const filename = resolveSQLiteFilename(storagePath)

  if (filename !== ':memory:') {
    const directory = path.dirname(filename)
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
  }

  const nativeBinding = resolveNativeBinding()
  const options = nativeBinding ? { nativeBinding } : undefined

  return knex({
    client: 'better-sqlite3',
    connection: {
      filename,
      options,
    },
    useNullAsDefault: true,
  })
}

const initializedDatabases = new WeakSet<Knex>()

export async function ensureDatabaseSchema(
  db: Knex,
): Promise<Either<AppError, void>> {
  if (initializedDatabases.has(db)) return Either.success(undefined)

  try {
    await db.raw('PRAGMA foreign_keys = ON;')
    await db.raw('PRAGMA journal_mode = WAL;')
    await db.raw('PRAGMA busy_timeout = 5000;')

    const hasWorkspaces = await db.schema.hasTable('workspaces')
    if (!hasWorkspaces) {
      await db.schema.createTable('workspaces', (table) => {
        table.string('id').primary()
        table.string('name').notNullable()
        table.string('description').nullable()
        table.string('avatar_url').nullable()
        table.string('status').notNullable().defaultTo('draft')
        table.string('created_at').notNullable()
        table.string('updated_at').notNullable()
        table.integer('revision').notNullable().defaultTo(1)
      })
    }
    if (hasWorkspaces) {
      const hasRevisionCol = await db.schema.hasColumn('workspaces', 'revision')
      if (!hasRevisionCol) {
        await db.schema.table('workspaces', (table) => {
          table.integer('revision').notNullable().defaultTo(1)
        })
      }
    }

    const hasConnections = await db.schema.hasTable('connections')
    if (!hasConnections) {
      await db.schema.createTable('connections', (table) => {
        table.string('id').notNullable()
        table
          .string('workspace_id')
          .notNullable()
          .references('id')
          .inTable('workspaces')
          .onDelete('CASCADE')
        table.string('status').notNullable()
        table.string('addon_id').notNullable()
        table.string('connection_profile_id').notNullable()
        table.string('cardinality').notNullable()
        table.integer('generation').notNullable().defaultTo(0)
        table.string('authorization_id').nullable()
        table.text('config').nullable()
        table.primary(['workspace_id', 'id'])
      })
    }
    if (hasConnections) {
      const hasAuthIdCol = await db.schema.hasColumn(
        'connections',
        'authorization_id',
      )
      if (!hasAuthIdCol) {
        await db.schema.table('connections', (table) => {
          table.string('authorization_id').nullable()
        })
      }
      const hasConfigCol = await db.schema.hasColumn('connections', 'config')
      if (!hasConfigCol) {
        await db.schema.table('connections', (table) => {
          table.text('config').nullable()
        })
      }
    }

    const hasAuthorizations = await db.schema.hasTable(
      'connection_authorizations',
    )
    if (!hasAuthorizations) {
      await db.schema.createTable('connection_authorizations', (table) => {
        table.string('id').notNullable()
        table.string('workspace_id').notNullable()
        table.string('connection_id').notNullable()
        table.string('account_id').notNullable()
        table.string('role').notNullable()
        table.string('credential_reference_id').nullable()
        table.string('status').notNullable().defaultTo('active')
        table.string('auth_profile_id').notNullable().defaultTo('primary')
        table.integer('generation').notNullable().defaultTo(0)
        table.text('identity').nullable()
        table.string('created_at').notNullable()
        table.string('updated_at').notNullable()
        table.primary(['workspace_id', 'connection_id', 'id'])
        table
          .foreign(['workspace_id', 'connection_id'])
          .references(['workspace_id', 'id'])
          .inTable('connections')
          .onDelete('CASCADE')
      })
    }
    if (hasAuthorizations) {
      const hasStatusCol = await db.schema.hasColumn(
        'connection_authorizations',
        'status',
      )
      if (!hasStatusCol) {
        await db.schema.table('connection_authorizations', (table) => {
          table.string('status').notNullable().defaultTo('active')
          table.string('auth_profile_id').notNullable().defaultTo('primary')
          table.string('created_at').nullable()
          table.string('updated_at').nullable()
        })
      }
      const hasIdentityCol = await db.schema.hasColumn(
        'connection_authorizations',
        'identity',
      )
      if (!hasIdentityCol) {
        await db.schema.table('connection_authorizations', (table) => {
          table.text('identity').nullable()
        })
      }
      const hasGenerationCol = await db.schema.hasColumn(
        'connection_authorizations',
        'generation',
      )
      if (!hasGenerationCol) {
        await db.schema.table('connection_authorizations', (table) => {
          table.integer('generation').notNullable().defaultTo(0)
        })
      }
    }

    const hasReservations = await db.schema.hasTable('connection_reservations')
    if (!hasReservations) {
      await db.schema.createTable('connection_reservations', (table) => {
        table.string('reservation_id').primary()
        table.string('workspace_id').notNullable()
        table.string('addon_id').notNullable()
        table.string('connection_profile_id').notNullable()
        table.string('connection_id').notNullable()
        table.string('cardinality').notNullable()
        table.boolean('is_default').notNullable()
        table.string('status').notNullable().defaultTo('pending')
        table.index(['workspace_id', 'addon_id', 'connection_profile_id'])
      })
    }

    const hasJournal = await db.schema.hasTable('workspace_journal')
    if (!hasJournal) {
      await db.schema.createTable('workspace_journal', (table) => {
        table.string('operation_id').primary()
        table.string('kind').notNullable()
        table.string('workspace_id').notNullable()
        table.string('connection_id').nullable()
        table.string('authorization_id').nullable()
        table.integer('expected_authorization_generation').nullable()
        table.integer('expected_connection_generation').nullable()
        table.string('intent').notNullable()
        table.integer('expected_revision').notNullable()
        table.integer('connection_generation').nullable()
        table.string('reservation_id').nullable()
        table.integer('attempts').notNullable().defaultTo(0)
        table.boolean('cleanup_pending').notNullable().defaultTo(false)
        table.string('status').notNullable().defaultTo('pending')
        table.string('phase').nullable()
        table.string('candidate_reference').nullable()
        table.text('previous_references').nullable()
        table.string('created_at').notNullable()
        table.string('updated_at').notNullable()
      })
    }
    if (hasJournal) {
      const hasAuthIdCol = await db.schema.hasColumn(
        'workspace_journal',
        'authorization_id',
      )
      if (!hasAuthIdCol) {
        await db.schema.table('workspace_journal', (table) => {
          table.string('authorization_id').nullable()
        })
      }
      const hasExpectedAuthGenCol = await db.schema.hasColumn(
        'workspace_journal',
        'expected_authorization_generation',
      )
      if (!hasExpectedAuthGenCol) {
        await db.schema.table('workspace_journal', (table) => {
          table.integer('expected_authorization_generation').nullable()
        })
      }
      const hasExpectedConnGenCol = await db.schema.hasColumn(
        'workspace_journal',
        'expected_connection_generation',
      )
      if (!hasExpectedConnGenCol) {
        await db.schema.table('workspace_journal', (table) => {
          table.integer('expected_connection_generation').nullable()
        })
      }
    }

    const hasCredentialReferences = await db.schema.hasTable(
      'workspace_credential_references',
    )
    if (!hasCredentialReferences) {
      await db.schema.createTable(
        'workspace_credential_references',
        (table) => {
          table.string('workspace_id').notNullable()
          table.string('owner_id').notNullable()
          table.string('logical_reference_id').notNullable()
          table.string('status').notNullable()
          table.string('active_reference_id').nullable()
          table.string('candidate_reference_id').nullable()
          table.string('cleanup_reference_id').nullable()
          table.string('created_at').notNullable()
          table.string('updated_at').notNullable()
          table.primary(['workspace_id', 'owner_id', 'logical_reference_id'])
        },
      )
    }

    initializedDatabases.add(db)
    return Either.success(undefined)
  } catch (error) {
    if (error instanceof Error) {
      return Either.failure(AppError.Internal(error.message))
    }
    return Either.failure(
      AppError.Internal('DATABASE_SCHEMA_INITIALIZATION_FAILED'),
    )
  }
}

export async function withSafeTransaction<T>(
  db: Knex,
  action: (trx: Knex.Transaction) => Promise<Either<AppError, T>>,
): Promise<Either<AppError, T>> {
  const schemaResult = await ensureDatabaseSchema(db)
  if (schemaResult.isFailure()) {
    return schemaResult.forwardFailure()
  }

  let trx: Knex.Transaction
  try {
    trx = await db.transaction()
  } catch (error) {
    if (error instanceof Error) {
      return Either.failure(AppError.Internal(error.message))
    }
    return Either.failure(
      AppError.Internal('DATABASE_TRANSACTION_INITIALIZATION_FAILED'),
    )
  }

  try {
    const result = await action(trx)
    if (result.isFailure()) {
      try {
        await trx.rollback()
      } catch {
        // ignore rollback failure on already aborted transaction
      }
      return result
    }
    await trx.commit()
    return result
  } catch (error) {
    try {
      await trx.rollback()
    } catch {
      // ignore rollback failure on already aborted transaction
    }
    if (error instanceof Error) {
      return Either.failure(AppError.Internal(error.message))
    }
    return Either.failure(
      AppError.Internal('DATABASE_TRANSACTION_EXECUTION_FAILED'),
    )
  }
}
