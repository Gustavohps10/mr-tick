import {
  IWorkspacesRepository,
  PagedResultDTO,
  PaginationOptionsDTO,
  WorkspaceFilterDTO,
} from '@mr-tick/application'
import { ConnectionIdentity, Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { Knex } from 'knex'
import { z } from 'zod'

import {
  createSQLiteConnection,
  ensureDatabaseSchema,
  withSafeTransaction,
} from './sqlite-connection'

const WORKSPACE_COLUMNS = [
  'id',
  'name',
  'description',
  'avatar_url',
  'status',
  'created_at',
  'updated_at',
  'revision',
]

const CONNECTION_COLUMNS = [
  'id',
  'workspace_id',
  'status',
  'addon_id',
  'connection_profile_id',
  'cardinality',
  'generation',
  'authorization_id',
  'config',
]

const CONNECTION_AUTHORIZATION_COLUMNS = [
  'id',
  'workspace_id',
  'connection_id',
  'account_id',
  'role',
  'credential_reference_id',
  'status',
  'auth_profile_id',
  'generation',
  'identity',
  'created_at',
  'updated_at',
]

type WorkspaceRow = {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  status: string
  created_at: string
  updated_at: string
  revision?: number
}

type ConnectionRow = {
  id: string
  workspace_id: string
  status: string
  addon_id: string
  connection_profile_id: string
  cardinality: string
  generation: number
  authorization_id: string | null
  config: string | null
}

type ConnectionAuthorizationRow = {
  id: string
  workspace_id: string
  connection_id: string
  account_id: string
  role: string
  credential_reference_id: string | null
  status: string
  auth_profile_id: string
  generation: number
  identity: string | null
  created_at: string
  updated_at: string
}

const ConnectionIdentitySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('human'),
    providerId: z.string(),
    tenantId: z.string(),
    providerSubjectId: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
  }),
  z.object({
    kind: z.literal('bot'),
    providerId: z.string(),
    tenantId: z.string(),
    providerSubjectId: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
  }),
  z.object({
    kind: z.literal('installation'),
    providerId: z.string(),
    tenantId: z.string(),
    providerSubjectId: z.string(),
    displayName: z.string(),
  }),
])

const ConnectionConfigSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
)

function parseConnectionConfig(
  raw: string | null,
): Either<AppError, Record<string, string | number | boolean> | undefined> {
  if (raw === null || raw.trim().length === 0) {
    return Either.success(undefined)
  }
  try {
    const parsed = JSON.parse(raw)
    const result = ConnectionConfigSchema.safeParse(parsed)
    if (!result.success) {
      return Either.failure(
        AppError.Internal(`INVALID_CONNECTION_CONFIG: ${result.error.message}`),
      )
    }
    return Either.success(result.data)
  } catch (error) {
    if (error instanceof Error) {
      return Either.failure(AppError.Internal(error.message))
    }
    return Either.failure(
      AppError.Internal('FAILED_TO_PARSE_CONNECTION_CONFIG'),
    )
  }
}

function parseAuthorizationIdentity(
  raw: string | null,
): Either<AppError, ConnectionIdentity> {
  if (raw === null || raw.trim().length === 0) {
    return Either.failure(AppError.Internal('AUTHORIZATION_IDENTITY_REQUIRED'))
  }

  try {
    const parsed = JSON.parse(raw)
    const result = ConnectionIdentitySchema.safeParse(parsed)
    if (result.success) {
      return Either.success(result.data)
    }
    return Either.failure(
      AppError.Internal(
        `INVALID_AUTHORIZATION_IDENTITY: ${result.error.message}`,
      ),
    )
  } catch (error) {
    if (error instanceof Error) {
      return Either.failure(AppError.Internal(error.message))
    }
    return Either.failure(
      AppError.Internal('FAILED_TO_PARSE_AUTHORIZATION_IDENTITY'),
    )
  }
}

function parseAuthorizationStatus(
  status: string,
): Either<AppError, 'active' | 'revoked' | 'expired' | 'reauth_required'> {
  if (status === 'active') return Either.success('active')
  if (status === 'revoked') return Either.success('revoked')
  if (status === 'expired') return Either.success('expired')
  if (status === 'reauth_required') return Either.success('reauth_required')
  return Either.failure(
    AppError.Internal(`UNKNOWN_AUTHORIZATION_STATUS: ${status}`),
  )
}

function parseConnectionStatus(
  status: string,
): Either<AppError, 'connected' | 'disabled' | 'disconnected' | 'archived'> {
  if (status === 'connected') return Either.success('connected')
  if (status === 'disabled') return Either.success('disabled')
  if (status === 'disconnected') return Either.success('disconnected')
  if (status === 'archived') return Either.success('archived')
  return Either.failure(
    AppError.Internal(`UNKNOWN_CONNECTION_STATUS: ${status}`),
  )
}

function parseCardinality(
  cardinality: string,
): Either<AppError, 'single' | 'multi'> {
  if (cardinality === 'single') return Either.success('single')
  if (cardinality === 'multi') return Either.success('multi')
  return Either.failure(
    AppError.Internal(`UNKNOWN_CARDINALITY: ${cardinality}`),
  )
}

function parseWorkspaceStatus(
  status: string,
): Either<AppError, 'draft' | 'configured'> {
  if (status === 'draft') return Either.success('draft')
  if (status === 'configured') return Either.success('configured')
  return Either.failure(
    AppError.Internal(`UNKNOWN_WORKSPACE_STATUS: ${status}`),
  )
}

function mapRowsToWorkspace(
  row: WorkspaceRow,
  connectionRows: ConnectionRow[],
  authorizationRows: ConnectionAuthorizationRow[],
): Either<AppError, Workspace> {
  const wsStatusResult = parseWorkspaceStatus(row.status)
  if (wsStatusResult.isFailure()) return wsStatusResult.forwardFailure()

  const authsByConn = new Map<string, ConnectionAuthorizationRow[]>()
  for (const auth of authorizationRows) {
    const list = authsByConn.get(auth.connection_id) ?? []
    list.push(auth)
    authsByConn.set(auth.connection_id, list)
  }

  const connections = []
  for (const conn of connectionRows) {
    const connStatusResult = parseConnectionStatus(conn.status)
    if (connStatusResult.isFailure()) return connStatusResult.forwardFailure()

    const cardinalityResult = parseCardinality(conn.cardinality)
    if (cardinalityResult.isFailure()) return cardinalityResult.forwardFailure()

    const configResult = parseConnectionConfig(conn.config)
    if (configResult.isFailure()) return configResult.forwardFailure()

    const auths = authsByConn.get(conn.id) ?? []
    const authorizations = []

    for (const auth of auths) {
      const authStatusResult = parseAuthorizationStatus(auth.status)
      if (authStatusResult.isFailure()) return authStatusResult.forwardFailure()

      const identityResult = parseAuthorizationIdentity(auth.identity)
      if (identityResult.isFailure()) return identityResult.forwardFailure()

      authorizations.push({
        authorizationId: auth.id,
        authorizationRole: auth.role,
        authProfileId: auth.auth_profile_id,
        credentialReferenceId: auth.credential_reference_id ?? undefined,
        identity: identityResult.success,
        generation: auth.generation,
        status: authStatusResult.success,
        createdAt: auth.created_at,
        updatedAt: auth.updated_at,
      })
    }

    const authId =
      conn.authorization_id !== null &&
      conn.authorization_id !== undefined &&
      conn.authorization_id.trim().length > 0
        ? conn.authorization_id.trim()
        : undefined

    if (authId === undefined && authorizations.length > 1) {
      return Either.failure(
        AppError.Internal('CONNECTION_AUTHORIZATION_ID_REQUIRED'),
      )
    }

    connections.push({
      id: conn.id,
      status: connStatusResult.success,
      addonId: conn.addon_id,
      connectionProfileId: conn.connection_profile_id,
      cardinality: cardinalityResult.success,
      generation: conn.generation,
      authorizations,
      authorizationId: authId,
      config: configResult.success,
    })
  }

  return Either.success(
    Workspace.hydrate({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      status: wsStatusResult.success,
      connections,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      revision: typeof row.revision === 'number' ? row.revision : 1,
    }),
  )
}

export class SQLiteWorkspacesRepository implements IWorkspacesRepository {
  public readonly db: Knex
  private readonly ownsConnection: boolean

  constructor(storagePathOrDb: string | Knex) {
    if (typeof storagePathOrDb === 'string') {
      this.db = createSQLiteConnection(storagePathOrDb)
      this.ownsConnection = true
      return
    }
    this.db = storagePathOrDb
    this.ownsConnection = false
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.db.destroy()
    }
  }

  public async create(workspace: Workspace): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const existing = await trx<WorkspaceRow>('workspaces')
        .select(['id'])
        .where('id', workspace.id)
        .first()
      if (existing) {
        return Either.failure(AppError.Http(409, 'WORKSPACE_ALREADY_EXISTS'))
      }

      await trx<WorkspaceRow>('workspaces').insert({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description ?? null,
        avatar_url: workspace.avatarUrl ?? null,
        status: workspace.status,
        created_at: workspace.createdAt.toISOString(),
        updated_at: workspace.updatedAt.toISOString(),
        revision: workspace.revision,
      })

      for (const connection of workspace.connections) {
        await trx<ConnectionRow>('connections').insert({
          id: connection.id,
          workspace_id: workspace.id,
          status: connection.status,
          addon_id: connection.addonId,
          connection_profile_id: connection.connectionProfileId,
          cardinality: connection.cardinality,
          generation: connection.generation,
          authorization_id: connection.authorizationId ?? null,
          config:
            connection.config !== undefined
              ? JSON.stringify(connection.config)
              : null,
        })

        if (connection.authorizations !== undefined) {
          for (const auth of connection.authorizations) {
            await trx<ConnectionAuthorizationRow>(
              'connection_authorizations',
            ).insert({
              id: auth.authorizationId,
              workspace_id: workspace.id,
              connection_id: connection.id,
              account_id:
                auth.identity !== undefined
                  ? auth.identity.providerSubjectId
                  : auth.authorizationId,
              role: auth.authorizationRole,
              credential_reference_id: auth.credentialReferenceId ?? null,
              status: auth.status,
              auth_profile_id: auth.authProfileId,
              generation: auth.generation,
              identity:
                auth.identity !== undefined
                  ? JSON.stringify(auth.identity)
                  : null,
              created_at: auth.createdAt,
              updated_at: auth.updatedAt,
            })
          }
        }
      }

      return Either.success(undefined)
    })
  }

  public async getById(
    id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const row = await this.db<WorkspaceRow>('workspaces')
        .where('id', id)
        .first<WorkspaceRow | undefined>(WORKSPACE_COLUMNS)
      if (!row) return Either.success(undefined)

      const connectionRows = await this.db<ConnectionRow>('connections')
        .where('workspace_id', id)
        .orderBy('id', 'asc')
        .select<ConnectionRow[]>(CONNECTION_COLUMNS)

      const authRows = await this.db<ConnectionAuthorizationRow>(
        'connection_authorizations',
      )
        .where('workspace_id', id)
        .select<ConnectionAuthorizationRow[]>(CONNECTION_AUTHORIZATION_COLUMNS)

      const mapped = mapRowsToWorkspace(row, connectionRows, authRows)
      if (mapped.isFailure()) return mapped.forwardFailure()

      return Either.success(mapped.success)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async list(
    filter?: WorkspaceFilterDTO,
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const page = pagination?.page ?? 1
      const pageSize = pagination?.pageSize ?? 50
      const offset = (page - 1) * pageSize

      let query = this.db<WorkspaceRow>('workspaces')
      let countQuery = this.db('workspaces')

      if (filter?.status !== undefined) {
        query = query.where('status', filter.status)
        countQuery = countQuery.where('status', filter.status)
      }
      if (filter?.name !== undefined && filter.name.trim().length > 0) {
        query = query.where('name', 'like', `%${filter.name.trim()}%`)
        countQuery = countQuery.where('name', 'like', `%${filter.name.trim()}%`)
      }

      const countResult = await countQuery
        .count<{ count: number | string }>('* as count')
        .first()
      const total = countResult ? Number(countResult.count) : 0

      const rows = await query
        .orderBy('created_at', 'asc')
        .limit(pageSize)
        .offset(offset)
        .select<WorkspaceRow[]>(WORKSPACE_COLUMNS)

      if (rows.length === 0) {
        return Either.success({
          items: [],
          total,
          page,
          pageSize,
        })
      }

      const workspaceIds = rows.map((r) => r.id)
      const allConnections = await this.db<ConnectionRow>('connections')
        .whereIn('workspace_id', workspaceIds)
        .orderBy('id', 'asc')
        .select<ConnectionRow[]>(CONNECTION_COLUMNS)

      const allAuths = await this.db<ConnectionAuthorizationRow>(
        'connection_authorizations',
      )
        .whereIn('workspace_id', workspaceIds)
        .select<ConnectionAuthorizationRow[]>(CONNECTION_AUTHORIZATION_COLUMNS)

      const connsByWs = new Map<string, ConnectionRow[]>()
      for (const conn of allConnections) {
        const list = connsByWs.get(conn.workspace_id) ?? []
        list.push(conn)
        connsByWs.set(conn.workspace_id, list)
      }

      const authsByWs = new Map<string, ConnectionAuthorizationRow[]>()
      for (const auth of allAuths) {
        const list = authsByWs.get(auth.workspace_id) ?? []
        list.push(auth)
        authsByWs.set(auth.workspace_id, list)
      }

      const items: Workspace[] = []
      for (const row of rows) {
        const mapped = mapRowsToWorkspace(
          row,
          connsByWs.get(row.id) ?? [],
          authsByWs.get(row.id) ?? [],
        )
        if (mapped.isFailure()) return mapped.forwardFailure()
        items.push(mapped.success)
      }

      return Either.success({
        items,
        total,
        page,
        pageSize,
      })
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async update(workspace: Workspace): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const existing = await trx<WorkspaceRow>('workspaces')
        .select(['id', 'revision'])
        .where('id', workspace.id)
        .first()
      if (!existing) {
        return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
      }

      const dbRevision =
        typeof existing.revision === 'number' ? existing.revision : 1
      if (dbRevision !== workspace.revision) {
        return Either.failure(
          AppError.Http(409, 'WORKSPACE_CONCURRENT_MODIFICATION'),
        )
      }

      const updatedCount = await trx<WorkspaceRow>('workspaces')
        .where('id', workspace.id)
        .where('revision', dbRevision)
        .update({
          name: workspace.name,
          description: workspace.description ?? null,
          avatar_url: workspace.avatarUrl ?? null,
          status: workspace.status,
          updated_at: workspace.updatedAt.toISOString(),
          revision: dbRevision + 1,
        })
      if (updatedCount === 0) {
        return Either.failure(
          AppError.Http(409, 'WORKSPACE_CONCURRENT_MODIFICATION'),
        )
      }

      const removedIds = [...workspace.getRemovedConnectionIds()]
      if (removedIds.length > 0) {
        await trx('connection_authorizations')
          .where('workspace_id', workspace.id)
          .whereIn('connection_id', removedIds)
          .delete()

        await trx('connections')
          .where('workspace_id', workspace.id)
          .whereIn('id', removedIds)
          .delete()
      }

      for (const connection of workspace.connections) {
        const existingConn = await trx<ConnectionRow>('connections')
          .select(['id', 'generation'])
          .where('workspace_id', workspace.id)
          .where('id', connection.id)
          .first()

        const connectionPayload = {
          status: connection.status,
          addon_id: connection.addonId,
          connection_profile_id: connection.connectionProfileId,
          cardinality: connection.cardinality,
          generation: connection.generation,
          authorization_id: connection.authorizationId ?? null,
          config:
            connection.config !== undefined
              ? JSON.stringify(connection.config)
              : null,
        }

        if (existingConn) {
          if (connection.generation < existingConn.generation) {
            return Either.failure(
              AppError.Http(409, 'CONNECTION_GENERATION_CONFLICT'),
            )
          }
          await trx<ConnectionRow>('connections')
            .where('workspace_id', workspace.id)
            .where('id', connection.id)
            .update(connectionPayload)
        }
        if (!existingConn) {
          const isNewlyCreated = workspace
            .getCreatedConnectionIds()
            .includes(connection.id)
          if (!isNewlyCreated) {
            continue
          }
          await trx<ConnectionRow>('connections').insert({
            id: connection.id,
            workspace_id: workspace.id,
            ...connectionPayload,
          })
        }

        if (connection.authorizations !== undefined) {
          const authIds = connection.authorizations.map(
            (auth) => auth.authorizationId,
          )
          await trx('connection_authorizations')
            .where('workspace_id', workspace.id)
            .where('connection_id', connection.id)
            .whereNotIn('id', authIds)
            .delete()

          for (const auth of connection.authorizations) {
            const existingAuth = await trx<ConnectionAuthorizationRow>(
              'connection_authorizations',
            )
              .select(['id', 'generation'])
              .where('workspace_id', workspace.id)
              .where('connection_id', connection.id)
              .where('id', auth.authorizationId)
              .first()

            if (existingAuth && auth.generation < existingAuth.generation) {
              return Either.failure(
                AppError.Http(409, 'AUTHORIZATION_GENERATION_CONFLICT'),
              )
            }

            const authPayload = {
              account_id:
                auth.identity !== undefined
                  ? auth.identity.providerSubjectId
                  : auth.authorizationId,
              role: auth.authorizationRole,
              credential_reference_id: auth.credentialReferenceId ?? null,
              status: auth.status,
              auth_profile_id: auth.authProfileId,
              generation: auth.generation,
              identity:
                auth.identity !== undefined
                  ? JSON.stringify(auth.identity)
                  : null,
              updated_at: auth.updatedAt,
            }

            if (existingAuth) {
              await trx<ConnectionAuthorizationRow>('connection_authorizations')
                .where('workspace_id', workspace.id)
                .where('connection_id', connection.id)
                .where('id', auth.authorizationId)
                .update(authPayload)
            }
            if (!existingAuth) {
              await trx<ConnectionAuthorizationRow>(
                'connection_authorizations',
              ).insert({
                id: auth.authorizationId,
                workspace_id: workspace.id,
                connection_id: connection.id,
                ...authPayload,
                created_at: auth.createdAt,
              })
            }
          }
        }
      }

      return Either.success(undefined)
    })
  }

  public async remove(id: string): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const count = await trx('workspaces').where('id', id).delete()
      if (count === 0) {
        return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
      }
      return Either.success(undefined)
    })
  }
}
