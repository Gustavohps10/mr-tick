import type { ViewModel } from '@mr-tick/shared/view-models'

import type { SanitizedDiagnosticReport } from './DiagnosticReport'
import type { DiagnosticSnapshot } from './DiagnosticSnapshot'

export const DIAGNOSTICS_SNAPSHOT_UPDATED_EVENT = 'diagnostics:snapshot-updated'

export interface IDiagnosticsAPI {
  getSnapshot(): Promise<ViewModel<DiagnosticSnapshot>>
  runChecks(): Promise<ViewModel<DiagnosticSnapshot>>
  generateReport(): Promise<ViewModel<SanitizedDiagnosticReport>>
  openDataDirectory(): Promise<ViewModel<void>>
}
