import type { DiagnosticScope } from './DiagnosticScope'

export type DiagnosticCheckSource =
  'main' | 'metadata' | 'executor' | 'sync' | 'ui'

interface DiagnosticCheckBase {
  id: string
  name: string
  capability: string
  source: DiagnosticCheckSource
  scope: DiagnosticScope
  startedAt: string
  finishedAt: string
  durationMs: number
}

export type DiagnosticCheckResult =
  | (DiagnosticCheckBase & {
      status: 'pass'
      provenOperation: string
    })
  | (DiagnosticCheckBase & {
      status: 'fail' | 'unavailable' | 'not-run' | 'not-supported'
      reason: string
    })
