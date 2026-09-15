import { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'
import z from 'zod'

import { Entity } from '@/entities/Entity'

type ConnectionMember = {
  id: string
  name: string
  login: string
  avatarUrl?: string
}

type InternalConnection = {
  id: string
  dataSourceId: string
  status: 'connected' | 'disabled' | 'disconnected'
  member?: ConnectionMember
  config?: Record<string, string | number | boolean>
}

export type DataSourceConnection = Readonly<InternalConnection>

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
  private _dataSourceConnections: InternalConnection[]
  private _status: WorkspaceStatus
  private _createdAt: Date
  private _updatedAt: Date

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
    this._dataSourceConnections = connections
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

  get dataSourceConnections(): ReadonlyArray<DataSourceConnection> {
    return this._dataSourceConnections.map((c) =>
      Object.freeze({
        ...c,
        member: c.member ? Object.freeze({ ...c.member }) : undefined,
        config: c.config ? Object.freeze({ ...c.config }) : undefined,
      }),
    )
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

  isLinked(): boolean {
    return this._dataSourceConnections.length > 0
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

  linkDataSource(id: string, dataSourceId: string): Either<AppError, void> {
    if (id === 'local') {
      return Either.failure(
        AppError.ValidationError('DATASOURCE_INVALIDO', {
          id: ['O DataSource "local" é implícito.'],
        }),
      )
    }

    const exists = this._dataSourceConnections.some((c) => c.id === id)

    if (!exists) {
      this._dataSourceConnections.push({
        id,
        dataSourceId,
        status: 'disconnected',
      })
    }

    this.touch()
    return Either.success()
  }

  unlinkDataSource(id?: string): Either<AppError, void> {
    if (id) {
      this._dataSourceConnections = this._dataSourceConnections.filter(
        (c) => c.id !== id,
      )
    } else {
      this._dataSourceConnections = []
    }

    this.touch()
    return Either.success()
  }

  connectDataSource(
    id: string,
    member: ConnectionMember,
    config: Record<string, string | number | boolean>,
  ): Either<AppError, void> {
    const connection = this._dataSourceConnections.find((c) => c.id === id)

    if (!connection) {
      return Either.failure(
        AppError.ValidationError('CONEXAO_NAO_ENCONTRADA', {
          id: [`Conexão ${id} não encontrada.`],
        }),
      )
    }

    connection.status = 'connected'
    connection.config = config
    connection.member = member

    this.touch()
    return Either.success()
  }

  disconnectDataSource(id: string): Either<AppError, void> {
    const connection = this._dataSourceConnections.find((c) => c.id === id)

    if (!connection) {
      return Either.failure(
        AppError.ValidationError('CONEXAO_NAO_ENCONTRADA', {
          id: [`Conexão ${id} não encontrada para desconexão.`],
        }),
      )
    }

    connection.status = 'disconnected'
    connection.config = undefined

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

function mapZodErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'root'
    if (!result[key]) result[key] = []
    result[key].push(issue.message)
  }
  return result
}
