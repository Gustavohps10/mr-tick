import { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'
import z from 'zod'

import { ConnectionProfileDescriptor } from '@/entities/ConnectionProfileDescriptor'
import { Entity } from '@/entities/Entity'

export type ConnectionIdentity =
  | {
      kind: 'human'
      providerId: string
      tenantId: string
      providerSubjectId: string
      displayName: string
      avatarUrl?: string
    }
  | {
      kind: 'bot'
      providerId: string
      tenantId: string
      providerSubjectId: string
      displayName: string
      avatarUrl?: string
    }
  | {
      kind: 'installation'
      providerId: string
      tenantId: string
      providerSubjectId: string
      displayName: string
    }

export interface ConnectionAuthorizationRecord {
  readonly authorizationId: string
  readonly authorizationRole: string
  readonly authProfileId: string
  readonly credentialReferenceId?: string
  readonly identity: ConnectionIdentity
  readonly generation: number
  readonly status: 'active' | 'revoked' | 'expired' | 'reauth_required'
  readonly createdAt: string
  readonly updatedAt: string
}

type InternalConnection = {
  id: string
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  generation: number
  authorizations: ConnectionAuthorizationRecord[]
  authorizationId?: string
  identity?: ConnectionIdentity
  config?: Record<string, string | number | boolean>
}

export type DataSourceConnection = Readonly<{
  id: string
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  generation: number
  authorizations: readonly ConnectionAuthorizationRecord[]
  authorizationId?: string
  identity?: ConnectionIdentity
  config?: Record<string, string | number | boolean>
}>

export type WorkspaceStatus = 'draft' | 'configured'

const avatarUrlSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine(
    (val) => {
      if (!val) return true

      const isBlob = val.startsWith('blob:')
      if (isBlob) return true

      const hasValidExtension = /\.(png|jpg|jpeg|gif|svg)(\?.*)?$/i.test(val)

      if (val.startsWith('mr-tick-app://')) {
        return hasValidExtension
      }

      try {
        const url = new URL(val)
        const isHttp = url.protocol === 'http:' || url.protocol === 'https:'

        if (!isHttp) return false

        return /\.(png|jpg|jpeg|gif|svg)(\?.*)?$/i.test(url.pathname)
      } catch {
        return false
      }
    },
    {
      message:
        'Avatar deve ser uma URL válida (http/https) ou mr-tick-app:// e apontar para uma imagem (png, jpg, jpeg, gif, svg)',
    },
  )

const WorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório')
    .min(3, 'Nome deve ter pelo menos 3 caracteres'),

  description: z
    .string()
    .max(500, 'Descrição não pode ter mais que 500 caracteres')
    .optional()
    .or(z.literal('')),

  avatarUrl: avatarUrlSchema,
})

export type WorkspaceProps = z.infer<typeof WorkspaceSchema>

export class Workspace extends Entity {
  private _id: string
  private _name: string
  private _description?: string
  private _avatarUrl?: string
  private _connections: InternalConnection[]
  private _status: WorkspaceStatus
  private _createdAt: Date
  private _updatedAt: Date
  private _removedConnectionIds: string[]
  private _createdConnectionIds: string[]
  private _revision: number

  private constructor(
    id: string,
    name: string,
    createdAt: Date,
    updatedAt: Date,
    status: WorkspaceStatus,
    description?: string,
    avatarUrl?: string,
    connections: InternalConnection[] = [],
  ) {
    super()
    this._id = id
    this._name = name
    this._status = status
    this._description = description
    this._avatarUrl = avatarUrl
    this._createdAt = createdAt
    this._updatedAt = updatedAt
    this._removedConnectionIds = []
    this._createdConnectionIds = []
    this._revision = 1
    this._connections = connections.map((conn) => {
      const auths = Array.isArray(conn.authorizations)
        ? [...conn.authorizations]
        : []
      return {
        ...conn,
        authorizations: auths,
      }
    })
  }

  static create(input: WorkspaceProps): Either<AppError, Workspace> {
    const parsed = WorkspaceSchema.safeParse(input)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError(
          'WORKSPACE_INVALIDO',
          mapZodErrors(parsed.error),
        ),
      )
    }

    const data = parsed.data
    const now = new Date()

    const workspace = new Workspace(
      `ws-${crypto.randomUUID()}`,
      data.name.trim(),
      now,
      now,
      'draft',
      data.description?.trim(),
      data.avatarUrl?.trim(),
      [],
    )

    return Either.success(workspace)
  }

  get id(): string {
    return this._id
  }
  get name(): string {
    return this._name
  }
  get description(): string | undefined {
    return this._description
  }
  get avatarUrl(): string | undefined {
    return this._avatarUrl
  }

  get connections(): ReadonlyArray<DataSourceConnection> {
    return this._connections.map((c) => {
      const snapshot: DataSourceConnection = {
        id: c.id,
        addonId: c.addonId,
        connectionProfileId: c.connectionProfileId,
        cardinality: c.cardinality,
        status: c.status,
        generation: c.generation,
        authorizations: Object.freeze(
          c.authorizations.map((auth) =>
            Object.freeze({
              ...auth,
              identity: Object.freeze({ ...auth.identity }),
            }),
          ),
        ),
        identity:
          c.identity !== undefined
            ? Object.freeze({ ...c.identity })
            : undefined,
        config:
          c.config !== undefined ? Object.freeze({ ...c.config }) : undefined,
        ...(c.authorizationId !== undefined
          ? { authorizationId: c.authorizationId }
          : {}),
      }
      return Object.freeze(snapshot)
    })
  }

  get createdAt(): Date {
    return this._createdAt
  }
  get updatedAt(): Date {
    return this._updatedAt
  }
  get status(): WorkspaceStatus {
    return this._status
  }
  get revision(): number {
    return typeof this._revision === 'number' ? this._revision : 1
  }

  getRemovedConnectionIds(): ReadonlyArray<string> {
    if (Array.isArray(this._removedConnectionIds)) {
      return this._removedConnectionIds
    }
    return []
  }

  getCreatedConnectionIds(): ReadonlyArray<string> {
    if (Array.isArray(this._createdConnectionIds)) {
      return this._createdConnectionIds
    }
    return []
  }

  isLinked(): boolean {
    return this._connections.length > 0
  }

  updateName(newName: string): Either<AppError, void> {
    const parsed = WorkspaceSchema.shape.name.safeParse(newName)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('NOME_INVALIDO', {
          name: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._name = parsed.data.trim()
    this.touch()
    return Either.success()
  }

  updateDescription(description?: string): Either<AppError, void> {
    const parsed = WorkspaceSchema.shape.description.safeParse(description)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('DESCRICAO_INVALIDA', {
          description: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._description = parsed.data?.trim()
    this.touch()
    return Either.success()
  }

  updateAvatarUrl(url?: string): Either<AppError, void> {
    const parsed = WorkspaceSchema.shape.avatarUrl.safeParse(url)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('AVATAR_INVALIDO', {
          avatarUrl: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._avatarUrl = parsed.data?.trim()
    this.touch()
    return Either.success()
  }

  updateIdentity(props: WorkspaceProps): Either<AppError, void> {
    const errors: FieldErrors = {}

    const nameResult = this.updateName(props.name)
    if (nameResult.isFailure())
      Object.assign(errors, nameResult.failure.details)

    const descResult = this.updateDescription(props.description)
    if (descResult.isFailure())
      Object.assign(errors, descResult.failure.details)

    const avatarResult = this.updateAvatarUrl(props.avatarUrl)
    if (avatarResult.isFailure())
      Object.assign(errors, avatarResult.failure.details)

    if (Object.keys(errors).length > 0) {
      return Either.failure(
        AppError.ValidationError('CAMPOS_INVALIDOS', errors),
      )
    }

    return Either.success()
  }

  createConnection(
    id: string,
    addonId: string,
    profile: ConnectionProfileDescriptor,
  ): Either<AppError, void> {
    if (id === 'local') {
      return Either.failure(
        AppError.ValidationError('DATASOURCE_INVALIDO', {
          id: ['O DataSource "local" é implícito.'],
        }),
      )
    }

    const existing = this._connections.find((c) => c.id === id)
    if (existing) {
      if (
        existing.addonId !== addonId ||
        existing.connectionProfileId !== profile.connectionProfileId ||
        existing.cardinality !== profile.cardinality
      )
        return Either.failure(
          AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
        )
      return Either.success()
    }

    const singleProfileOccupied =
      profile.cardinality === 'single' &&
      this._connections.some(
        (connection) =>
          connection.status !== 'archived' &&
          connection.addonId === addonId &&
          connection.connectionProfileId === profile.connectionProfileId,
      )
    if (singleProfileOccupied)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_CARDINALITY_REACHED'),
      )
    if (!Array.isArray(this._createdConnectionIds)) {
      this._createdConnectionIds = []
    }
    this._createdConnectionIds.push(id)

    this._connections.push({
      id,
      addonId,
      connectionProfileId: profile.connectionProfileId,
      cardinality: profile.cardinality,
      status: 'disconnected',
      generation: 0,
      authorizations: [],
    })

    this.touch()
    return Either.success()
  }

  removeConnection(id?: string): Either<AppError, void> {
    if (!Array.isArray(this._removedConnectionIds)) {
      this._removedConnectionIds = []
    }
    if (id) {
      if (Array.isArray(this._createdConnectionIds)) {
        this._createdConnectionIds = this._createdConnectionIds.filter(
          (candidate) => candidate !== id,
        )
      }
      this._connections = this._connections.filter((c) => c.id !== id)
      if (!this._removedConnectionIds.includes(id)) {
        this._removedConnectionIds.push(id)
      }
      this.touch()
      return Either.success()
    }

    this._createdConnectionIds = []
    for (const connection of this._connections) {
      if (!this._removedConnectionIds.includes(connection.id)) {
        this._removedConnectionIds.push(connection.id)
      }
    }
    this._connections = []

    this.touch()
    return Either.success()
  }

  connectAuthorization(
    id: string,
    authorization: {
      authorizationRole: string
      authProfileId: string
      identity: ConnectionIdentity
      authorizationId: string
      credentialReferenceId?: string
    },
    config?: Record<string, string | number | boolean>,
  ): Either<AppError, void> {
    const connection = this._connections.find((c) => c.id === id)
    if (connection === undefined) {
      return Either.failure(
        AppError.ValidationError('CONEXAO_NAO_ENCONTRADA', {
          id: [`Conexão ${id} não encontrada.`],
        }),
      )
    }
    if (connection.status === 'archived') {
      return Either.failure(AppError.ValidationError('CONNECTION_ARCHIVED'))
    }
    const targetIdentity: ConnectionIdentity = { ...authorization.identity }
    const existingIndex = connection.authorizations.findIndex(
      (a) => a.authorizationRole === authorization.authorizationRole,
    )
    if (
      connection.identity !== undefined &&
      (authorization.authorizationRole === 'primary' ||
        connection.authorizations.length === 0) &&
      !sameConnectionIdentity(connection.identity, targetIdentity)
    ) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_IDENTITY_MISMATCH'),
      )
    }
    const nowIso = new Date().toISOString()
    if (existingIndex >= 0) {
      const existingAuth = connection.authorizations[existingIndex]
      if (!sameConnectionIdentity(existingAuth.identity, targetIdentity)) {
        return Either.failure(
          AppError.ValidationError('CONNECTION_IDENTITY_MISMATCH'),
        )
      }
      const updatedAuth: ConnectionAuthorizationRecord = {
        authorizationId: existingAuth.authorizationId,
        authorizationRole: existingAuth.authorizationRole,
        authProfileId: authorization.authProfileId,
        credentialReferenceId: authorization.credentialReferenceId,
        identity: targetIdentity,
        generation: existingAuth.generation + 1,
        status: 'active',
        createdAt: existingAuth.createdAt,
        updatedAt: nowIso,
      }
      connection.authorizations[existingIndex] = updatedAuth
    }
    if (existingIndex < 0) {
      const newAuth: ConnectionAuthorizationRecord = {
        authorizationId: authorization.authorizationId,
        authorizationRole: authorization.authorizationRole,
        authProfileId: authorization.authProfileId,
        credentialReferenceId: authorization.credentialReferenceId,
        identity: targetIdentity,
        generation: 1,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      connection.authorizations.push(newAuth)
    }
    const wasConnected = connection.status === 'connected'
    connection.status = 'connected'
    if (
      authorization.authorizationRole === 'primary' ||
      connection.identity === undefined
    ) {
      connection.authorizationId = authorization.authorizationId
      connection.identity = targetIdentity
    }
    if (!wasConnected) {
      connection.generation += 1
    }
    if (config !== undefined) {
      connection.config = config
    }
    this.touch()
    return Either.success()
  }

  connectNone(
    id: string,
    config?: Record<string, string | number | boolean>,
  ): Either<AppError, void> {
    const connection = this._connections.find((c) => c.id === id)
    if (connection === undefined) {
      return Either.failure(
        AppError.ValidationError('CONEXAO_NAO_ENCONTRADA', {
          id: [`Conexão ${id} não encontrada.`],
        }),
      )
    }
    if (connection.status === 'archived') {
      return Either.failure(AppError.ValidationError('CONNECTION_ARCHIVED'))
    }
    if (connection.authorizations.length > 0) {
      return Either.failure(
        AppError.ValidationError(
          'CANNOT_CONVERT_AUTHORIZED_CONNECTION_TO_ANONYMOUS',
        ),
      )
    }
    connection.status = 'connected'
    connection.generation += 1
    connection.authorizations = []
    connection.authorizationId = undefined
    connection.identity = undefined
    if (config !== undefined) {
      connection.config = config
    }
    this.touch()
    return Either.success()
  }

  disconnectConnection(id: string): Either<AppError, void> {
    const connection = this._connections.find((c) => c.id === id)

    if (!connection) {
      return Either.failure(
        AppError.ValidationError('CONEXAO_NAO_ENCONTRADA', {
          id: [`Conexão ${id} não encontrada para desconexão.`],
        }),
      )
    }

    connection.status = 'disconnected'
    connection.authorizationId = undefined
    connection.authorizations = connection.authorizations.map((auth) => ({
      ...auth,
      status: 'revoked',
      generation: auth.generation + 1,
      updatedAt: new Date().toISOString(),
    }))
    connection.generation += 1

    this.touch()
    return Either.success()
  }

  archiveConnection(id: string): Either<AppError, void> {
    const connection = this._connections.find((item) => item.id === id)
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    }
    connection.status = 'archived'
    connection.authorizationId = undefined
    connection.authorizations = connection.authorizations.map((auth) => ({
      ...auth,
      status: 'expired',
      updatedAt: new Date().toISOString(),
    }))
    connection.generation += 1
    this.touch()
    return Either.success()
  }

  restoreConnection(id: string): Either<AppError, void> {
    const connection = this._connections.find((item) => item.id === id)
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    }
    if (connection.status !== 'archived') {
      return Either.failure(AppError.ValidationError('CONNECTION_NOT_ARCHIVED'))
    }
    connection.status = 'disconnected'
    connection.authorizationId = undefined
    connection.generation += 1
    this.touch()
    return Either.success()
  }

  markAuthorizationReauthRequired(
    connectionId: string,
    authorizationId: string,
  ): Either<AppError, void> {
    const connection = this._connections.find((c) => c.id === connectionId)
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    }
    const auth = connection.authorizations.find(
      (a) => a.authorizationId === authorizationId,
    )
    if (auth === undefined) {
      return Either.failure(AppError.NotFound('AUTHORIZATION_NOT_FOUND'))
    }
    if (auth.status === 'revoked' || auth.status === 'expired') {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_NOT_ACTIVE'),
      )
    }
    const index = connection.authorizations.indexOf(auth)
    connection.authorizations[index] = {
      ...auth,
      status: 'reauth_required',
      generation: auth.generation + 1,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
    return Either.success()
  }

  markAsConfigured(): void {
    this._status = 'configured'
    this.touch()
  }

  private touch(): void {
    this._updatedAt = new Date()
  }
}

export function sameConnectionIdentity(
  left: ConnectionIdentity,
  right: ConnectionIdentity,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.providerId !== right.providerId) return false
  if (left.tenantId !== right.tenantId) return false
  return left.providerSubjectId === right.providerSubjectId
}

function mapZodErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'root'
    if (!result[key]) result[key] = []
    result[key].push(issue.message)
  }
  return result
}
