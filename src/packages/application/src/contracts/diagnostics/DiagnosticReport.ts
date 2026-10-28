import type { DiagnosticEvent } from './DiagnosticEvent'
import type { DiagnosticSnapshot } from './DiagnosticSnapshot'

export interface SanitizedDiagnosticReport {
  formatVersion: '1.0'
  generatedAt: string
  sessionId: string
  appVersion: string
  platform: string
  snapshot: DiagnosticSnapshot
  bootJournal: DiagnosticEvent[]
  previousBootJournal?: DiagnosticEvent[]
}
