import { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'
import z from 'zod'

import { Entity } from '@/entities/Entity'

// ===== Schema =====

const MemberSchema = z.object({
  id: z.number().positive('id deve ser um número positivo'),
  login: z.string().min(1, 'login é obrigatório'),
  firstname: z.string().min(1, 'firstname é obrigatório'),
  lastname: z.string().min(1, 'lastname é obrigatório'),
  admin: z.boolean(),
  customFields: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      value: z.string(),
    }),
  ),
})

export type MemberProps = z.infer<typeof MemberSchema>

// ===== Entity =====

export class Member extends Entity {
  private _id: number
  private _login: string
  private _firstname: string
  private _lastname: string
  private _admin: boolean
  private _createdAt: Date
  private _lastLoginOn: Date
  private _customFields: { id: number; name: string; value: string }[]

  private constructor(props: MemberProps, createdAt: Date, lastLoginOn: Date) {
    super()
    this._id = props.id
    this._login = props.login
    this._firstname = props.firstname
    this._lastname = props.lastname
    this._admin = props.admin
    this._createdAt = createdAt
    this._lastLoginOn = lastLoginOn
    this._customFields = props.customFields
  }

  // ===== Factory =====

  static create(props: MemberProps): Either<AppError, Member> {
    const parsed = MemberSchema.safeParse(props)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError(
          'CAMPOS_INVALIDOS',
          mapZodErrors(parsed.error),
        ),
      )
    }

    const now = new Date()
    const instance = new Member(parsed.data, now, now)

    return Either.success(instance)
  }

  // ===== Getters =====

  get id(): number {
    return this._id
  }
  get login(): string {
    return this._login
  }
  get firstname(): string {
    return this._firstname
  }
  get lastname(): string {
    return this._lastname
  }
  get admin(): boolean {
    return this._admin
  }
  get createdAt(): Date {
    return this._createdAt
  }
  get lastLoginOn(): Date {
    return this._lastLoginOn
  }
  get customFields() {
    return this._customFields
  }

  // ===== Mutations =====

  updateLogin(login: string): Either<AppError, Member> {
    const parsed = MemberSchema.shape.login.safeParse(login)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError('LOGIN_INVALIDO', {
          login: parsed.error.errors.map((e) => e.message),
        }),
      )
    }

    this._login = parsed.data
    this.touch()
    return Either.success(this)
  }

  updateName(firstname: string, lastname: string): Either<AppError, Member> {
    const parsedFirst = MemberSchema.shape.firstname.safeParse(firstname)
    const parsedLast = MemberSchema.shape.lastname.safeParse(lastname)

    if (!parsedFirst.success || !parsedLast.success) {
      return Either.failure(
        AppError.ValidationError('NOME_INVALIDO', {
          firstname: parsedFirst.success
            ? []
            : parsedFirst.error.errors.map((e) => e.message),
          lastname: parsedLast.success
            ? []
            : parsedLast.error.errors.map((e) => e.message),
        }),
      )
    }

    this._firstname = parsedFirst.data
    this._lastname = parsedLast.data
    this.touch()
    return Either.success(this)
  }

  updateCustomFields(
    fields: { id: number; name: string; value: string }[],
  ): Either<AppError, Member> {
    const parsed = MemberSchema.shape.customFields.safeParse(fields)

    if (!parsed.success) {
      return Either.failure(
        AppError.ValidationError(
          'CAMPOS_CUSTOMIZADOS_INVALIDOS',
          mapZodErrors(parsed.error),
        ),
      )
    }

    this._customFields = parsed.data
    this.touch()
    return Either.success(this)
  }

  private touch() {
    this._lastLoginOn = new Date()
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
