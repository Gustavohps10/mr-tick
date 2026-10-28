import { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'
import z from 'zod'

import { Entity } from '@/entities/Entity'

// ===== Schema =====

const TaskSchema = z.object({
  title: z
    .string()
    .min(1, 'title é obrigatório')
    .min(3, 'title deve ter no mínimo 3 caracteres'),
  description: z.string().min(1, 'description é obrigatório'),
  workspaceId: z.string().min(1, 'workspaceId é obrigatório'),
  isFallback: z.boolean().optional(),
  externalId: z.string().optional(),
  externalType: z.string().optional(),
})

export type TaskProps = z.infer<typeof TaskSchema>

// ===== Entity =====

export class Task extends Entity {
  private _id: string
  private _title: string
  private _description: string
  private _workspaceId: string
  private _isFallback: boolean
  private _externalId?: string
  private _externalType?: string
  private _createdAt: Date
  private _updatedAt: Date

  private constructor(
    props: TaskProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super()
    this._id = id
    this._title = props.title
    this._description = props.description
    this._workspaceId = props.workspaceId
    this._isFallback = props.isFallback ?? false
    this._externalId = props.externalId
    this._externalType = props.externalType
    this._createdAt = createdAt
    this._updatedAt = updatedAt
  }

  // ===== Factory =====

  static create(props: TaskProps): Either<AppError, Task> {
    const parsed = TaskSchema.safeParse(props)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError(
          'CAMPOS_INVALIDOS',
          mapZodErrors(parsed.error),
        ),
      )
    }

    const now = new Date()

    const instance = new Task(parsed.data, crypto.randomUUID(), now, now)

    return Either.success(instance)
  }

  static createFallback(workspaceId: string): Either<AppError, Task> {
    return Task.create({
      title: 'General Task',
      description: 'Fallback task for time entries without specific tasks',
      workspaceId,
      isFallback: true,
    })
  }

  // ===== Getters =====

  get id(): string {
    return this._id
  }

  get title(): string {
    return this._title
  }

  get description(): string {
    return this._description
  }

  get workspaceId(): string {
    return this._workspaceId
  }

  get isFallback(): boolean {
    return this._isFallback
  }

  get externalId(): string | undefined {
    return this._externalId
  }

  get externalType(): string | undefined {
    return this._externalType
  }

  get createdAt(): Date {
    return this._createdAt
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  // ===== Mutations =====

  updateTitle(title: string): Either<AppError, Task> {
    const parsed = TaskSchema.shape.title.safeParse(title)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('TITULO_INVALIDO', {
          title: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._title = parsed.data
    this.touch()
    return Either.success(this)
  }

  updateDescription(description: string): Either<AppError, Task> {
    const parsed = TaskSchema.shape.description.safeParse(description)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('DESCRICAO_INVALIDA', {
          description: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._description = parsed.data
    this.touch()
    return Either.success(this)
  }

  private touch() {
    this._updatedAt = new Date()
  }
}

// ===== Helpers =====

function mapZodErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'root'
    if (!result[key]) result[key] = []
    result[key].push(issue.message)
  }

  return result
}
