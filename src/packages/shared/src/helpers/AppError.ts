export type AppErrorType = 'danger' | 'warning'

export type FieldErrors = Record<string, string[]>

export abstract class AppError {
  public readonly messageKey: string
  public readonly details?: FieldErrors
  public readonly statusCode: number
  public readonly type: AppErrorType

  protected constructor(
    messageKey: string,
    statusCode: number,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ) {
    this.messageKey = messageKey
    this.details = details
    this.statusCode = statusCode
    this.type = type
  }

  // ===== FACTORIES (ÚNICO PONTO DE ENTRADA) =====

  static ValidationError(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ): ValidationError {
    return new ValidationError(messageKey, details, type)
  }

  static NotFound(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ): NotFoundError {
    return new NotFoundError(messageKey, details, type)
  }

  static Unauthorized(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ): UnauthorizedError {
    return new UnauthorizedError(messageKey, details, type)
  }

  static Internal(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ): InternalServerError {
    return new InternalServerError(messageKey, details, type)
  }

  static Http(
    statusCode: number,
    messageKey: string,
    details?: FieldErrors,
  ): AppError {
    return new HttpError(messageKey, statusCode, details)
  }

  // ===== HELPERS =====

  getFieldErrors(field: string): string[] {
    return this.details?.[field] ?? []
  }

  hasErrors(): boolean {
    return !!this.details && Object.keys(this.details).length > 0
  }
}

// ===== IMPLEMENTAÇÕES =====

class ValidationError extends AppError {
  constructor(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ) {
    super(messageKey, 422, details, type)
  }
}

class NotFoundError extends AppError {
  constructor(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ) {
    super(messageKey, 404, details, type)
  }
}

class UnauthorizedError extends AppError {
  constructor(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ) {
    super(messageKey, 401, details, type)
  }
}

class InternalServerError extends AppError {
  constructor(
    messageKey: string,
    details?: FieldErrors,
    type: AppErrorType = 'danger',
  ) {
    super(messageKey, 500, details, type)
  }
}

class HttpError extends AppError {
  constructor(messageKey: string, statusCode: number, details?: FieldErrors) {
    super(messageKey, statusCode, details)
  }
}

export interface TokenRefreshErrorOptions {
  readonly reauthRequired?: boolean
  readonly remoteOutcomeUncertain?: boolean
  readonly details?: FieldErrors
}

export class TokenRefreshError extends AppError {
  public readonly reauthRequired: boolean
  public readonly remoteOutcomeUncertain: boolean

  constructor(
    messageKey: string,
    statusCode: number,
    options?: TokenRefreshErrorOptions,
  ) {
    let details: FieldErrors | undefined = undefined
    let reauth = false
    let uncertain = false
    if (options !== undefined) {
      if (options.details !== undefined) {
        details = options.details
      }
      if (options.reauthRequired === true) {
        reauth = true
      }
      if (options.remoteOutcomeUncertain === true) {
        uncertain = true
      }
    }
    super(messageKey, statusCode, details)
    this.reauthRequired = reauth
    this.remoteOutcomeUncertain = uncertain
  }

  static reauthRequired(
    messageKey: string,
    statusCode = 401,
    details?: FieldErrors,
  ): TokenRefreshError {
    return new TokenRefreshError(messageKey, statusCode, {
      reauthRequired: true,
      details,
    })
  }

  static remoteOutcomeUncertain(
    messageKey: string,
    statusCode = 504,
    details?: FieldErrors,
  ): TokenRefreshError {
    return new TokenRefreshError(messageKey, statusCode, {
      remoteOutcomeUncertain: true,
      details,
    })
  }

  static transient(
    messageKey: string,
    statusCode = 504,
    details?: FieldErrors,
  ): TokenRefreshError {
    return new TokenRefreshError(messageKey, statusCode, { details })
  }

  static clientError(
    messageKey: string,
    statusCode = 401,
    details?: FieldErrors,
  ): TokenRefreshError {
    return new TokenRefreshError(messageKey, statusCode, { details })
  }
}
