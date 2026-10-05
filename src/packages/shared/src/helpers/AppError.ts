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
