import { PaginatedViewModel, ViewModel } from '@/view-models'

import { AppError } from './AppError'
import { Either } from './Either'

function translate(msg: string) {
  return msg
}

export interface PaginatedPayload<Data> {
  data: Data
  totalItems: number
  totalPages: number
  currentPage: number
}

export function createResponseViewModel<Data>(
  result: Either<AppError, PaginatedPayload<Data>>,
  successStatusCode?: number,
): PaginatedViewModel<Data>

export function createResponseViewModel<Data>(
  result: Either<AppError, Data>,
  successStatusCode?: number,
): ViewModel<Data>

export function createResponseViewModel(
  result: Either<AppError, any>,
  successStatusCode = 200,
): any {
  if (result.isFailure()) {
    const error = result.failure

    return {
      isSuccess: false,
      statusCode: error.statusCode,
      error: translate(error.messageKey),
      details: error.details,
    }
  }

  const success = result.success

  if (
    success &&
    typeof success === 'object' &&
    'totalItems' in success &&
    'totalPages' in success &&
    'currentPage' in success &&
    'data' in success
  ) {
    return {
      isSuccess: true,
      statusCode: successStatusCode,
      ...success,
    }
  }

  // Cenário de Sucesso (Comum)
  return {
    isSuccess: true,
    statusCode: successStatusCode,
    data: success,
  }
}
