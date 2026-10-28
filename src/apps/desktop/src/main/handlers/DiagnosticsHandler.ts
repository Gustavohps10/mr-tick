import type {
  DiagnosticSnapshot,
  SanitizedDiagnosticReport,
} from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import type { ViewModel } from '@mr-tick/shared/view-models'

import type { DiagnosticsService } from '../services/diagnostics/DiagnosticsService'
import type { HandlerBase } from './HandlerBase'

export class DiagnosticsHandler implements HandlerBase<DiagnosticsHandler> {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  async getSnapshot(): Promise<ViewModel<DiagnosticSnapshot>> {
    const result = await this.diagnosticsService.getSnapshot()
    return createResponseViewModel(result)
  }

  async runChecks(): Promise<ViewModel<DiagnosticSnapshot>> {
    const result = await this.diagnosticsService.runChecks()
    return createResponseViewModel(result)
  }

  async generateReport(): Promise<ViewModel<SanitizedDiagnosticReport>> {
    const result = await this.diagnosticsService.generateReport()
    return createResponseViewModel(result)
  }

  async openDataDirectory(): Promise<ViewModel<void>> {
    const result = await this.diagnosticsService.openDataDirectory()
    return createResponseViewModel(result)
  }
}
