import { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'
import z from 'zod'

import { Entity } from '@/entities/Entity'

const CommentSchema = z
  .string()
  .max(255, 'O comentário não pode ter mais que 255 caracteres')
  .optional()

const UserSchema = z.object({
  id: z.string().min(1, 'user.id é obrigatório'),
  name: z.string().optional(),
})

const TimeEntrySchema = z.object({
  task: z.object({ id: z.string() }),
  activity: z.object({ id: z.string().min(1) }),
  user: UserSchema,
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  timeSpent: z.number().nonnegative().optional(),
  comments: CommentSchema,
})

type TimeEntryProps = z.infer<typeof TimeEntrySchema>

export class TimeEntry extends Entity {
  private _id: string
  private _task: { id: string }
  private _activity: { id: string }
  private _user: { id: string; name?: string }
  private _startDate?: Date
  private _endDate?: Date
  private _timeSpent: number
  private _comments?: string
  private _createdAt: Date
  private _updatedAt: Date

  private constructor(
    id: string,
    task: { id: string },
    activity: { id: string },
    user: { id: string; name?: string },
    timeSpent: number,
    createdAt: Date,
    updatedAt: Date,
    startDate?: Date,
    endDate?: Date,
    comments?: string,
  ) {
    super()
    this._id = id
    this._task = task
    this._activity = activity
    this._user = user
    this._startDate = startDate
    this._endDate = endDate
    this._timeSpent = timeSpent
    this._comments = comments
    this._createdAt = createdAt
    this._updatedAt = updatedAt
  }

  // ===== Factory =====

  static create(props: TimeEntryProps): Either<AppError, TimeEntry> {
    const parsed = TimeEntrySchema.safeParse(props)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError(
          'CAMPOS_INVALIDOS',
          mapZodErrors(parsed.error),
        ),
      )
    }

    const data = parsed.data
    const now = new Date()

    const hoursResult = validateHours(
      data.startDate,
      data.endDate,
      data.timeSpent,
    )

    if (hoursResult.isFailure()) {
      return Either.failure(hoursResult.failure)
    }

    const hours = hoursResult.success

    const instance = new TimeEntry(
      crypto.randomUUID(),
      data.task,
      data.activity,
      data.user,
      hours.timeSpent,
      now,
      now,
      hours.startDate,
      hours.endDate,
      data.comments?.trim(),
    )

    return Either.success(instance)
  }

  // ===== Getters =====

  get id() {
    return this._id
  }

  get task() {
    return { ...this._task }
  }

  get activity() {
    return { ...this._activity }
  }

  get user() {
    return { ...this._user }
  }

  get startDate() {
    return this._startDate
  }

  get endDate() {
    return this._endDate
  }

  get timeSpent() {
    return this._timeSpent
  }

  get comments() {
    return this._comments
  }

  get createdAt() {
    return this._createdAt
  }

  get updatedAt() {
    return this._updatedAt
  }

  // ===== Mutations =====

  updateComments(comments?: string): Either<AppError, TimeEntry> {
    const parsed = CommentSchema.safeParse(comments)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('COMENTARIO_INVALIDO', {
          comments: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._comments = comments?.trim()
    this.touch()
    return Either.success(this)
  }

  updateHours(
    startDate?: Date,
    endDate?: Date,
    timeSpent?: number,
  ): Either<AppError, TimeEntry> {
    const result = validateHours(startDate, endDate, timeSpent)

    if (result.isFailure()) {
      return Either.failure(result.failure)
    }

    const hours = result.success

    this._startDate = hours.startDate
    this._endDate = hours.endDate
    this._timeSpent = hours.timeSpent

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

function validateHours(
  startDate?: Date,
  endDate?: Date,
  timeSpent?: number,
): Either<
  AppError,
  {
    startDate?: Date
    endDate?: Date
    timeSpent: number
  }
> {
  const hasStart = startDate !== undefined
  const hasEnd = endDate !== undefined
  const hasTime = timeSpent !== undefined

  if ((hasStart && !hasEnd) || (!hasStart && hasEnd)) {
    return Either.failure(
      AppError.ValidationError('DATAS_INCOMPLETAS', {
        ...(hasStart &&
          !hasEnd && {
            endDate: ['endDate é obrigatório quando startDate é fornecida'],
          }),
        ...(!hasStart &&
          hasEnd && {
            startDate: ['startDate é obrigatório quando endDate é fornecida'],
          }),
      }),
    )
  }

  if (hasStart && hasEnd) {
    const diff = endDate!.getTime() - startDate!.getTime()

    if (diff < 0) {
      return Either.failure(
        AppError.ValidationError('DATA_INVALIDA', {
          endDate: ['Data de término não pode ser anterior à de início'],
        }),
      )
    }

    const computed = Math.floor(diff / 1000)

    if (hasTime && computed !== timeSpent) {
      return Either.failure(
        AppError.ValidationError('TEMPO_INCONSISTENTE', {
          timeSpent: ['timeSpent não corresponde ao intervalo entre as datas'],
        }),
      )
    }

    return Either.success({
      startDate,
      endDate,
      timeSpent: computed,
    })
  }

  if (!hasTime) {
    return Either.failure(
      AppError.ValidationError('TEMPO_FALTANDO', {
        timeSpent: ['timeSpent é obrigatório se não fornecer datas'],
      }),
    )
  }

  return Either.success({
    startDate: undefined,
    endDate: undefined,
    timeSpent: timeSpent!,
  })
}
