import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { DiagnosticCheckResult } from './DiagnosticCheck'
import type { DiagnosticStorageItem } from './DiagnosticMeasurement'

export interface IMetadataDiagnosticAdapter {
  checkStorage(): Promise<Either<AppError, DiagnosticStorageItem>>
  readProbe(): Promise<Either<AppError, DiagnosticCheckResult>>
}
