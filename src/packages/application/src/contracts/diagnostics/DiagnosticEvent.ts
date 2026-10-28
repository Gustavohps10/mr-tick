import type { DiagnosticScope } from './DiagnosticScope'

export type DiagnosticEventLevel = 'info' | 'warn' | 'error'

export type DiagnosticEventOrigin =
  'boot' | 'main' | 'dispatcher' | 'executor' | 'storage' | 'sync'

export interface DiagnosticEvent {
  sequence: number
  sessionId: string
  generation?: string
  origin: DiagnosticEventOrigin
  level: DiagnosticEventLevel
  stage: string
  scope?: DiagnosticScope
  correlationId?: string
  code?: string
  message: string
  timestamp: string
}
