import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { DiagnosticCheckResult } from './DiagnosticCheck'
import type { DiagnosticStorageItem } from './DiagnosticMeasurement'

export interface IAnalyticsDiagnosticAdapter {
  checkStorages(): Promise<Either<AppError, DiagnosticStorageItem[]>>
  readProbes(): Promise<Either<AppError, DiagnosticCheckResult[]>>
}
