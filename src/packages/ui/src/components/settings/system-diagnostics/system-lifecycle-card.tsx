import type {
  DiagnosticCheckResult,
  DiagnosticDispatcherState,
  DiagnosticStartupFailureKind,
} from '@mr-tick/application'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  XCircle,
} from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'

interface SystemLifecycleCardProps {
  dispatcher: DiagnosticDispatcherState
  sessionId: string
  observedGeneration: string
  checks: DiagnosticCheckResult[]
}

function formatFailureKind(kind: DiagnosticStartupFailureKind): string {
  switch (kind) {
    case 'deadline_exceeded':
      return 'Prazo de Inicialização Excedido (Timeout)'
    case 'explicit':
      return 'Falha Explícita de Inicialização'
    case 'process_gone':
      return 'Processo do Executor Encerrado'
    case 'navigation':
      return 'Reinicialização por Navegação'
    default:
      return kind
  }
}

function getLifecycleBadge(state: string) {
  switch (state) {
    case 'ready':
      return (
        <Badge
          data-testid="lifecycle-badge-ready"
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        >
          <CheckCircle2 className="mr-1 size-3" />
          Pronto
        </Badge>
      )
    case 'starting':
      return (
        <Badge
          data-testid="lifecycle-badge-starting"
          variant="secondary"
          className="text-amber-600 dark:text-amber-400"
        >
          <Clock className="mr-1 size-3 animate-spin" />
          Inicializando
        </Badge>
      )
    case 'restarting':
      return (
        <Badge
          data-testid="lifecycle-badge-restarting"
          variant="secondary"
          className="text-blue-600 dark:text-blue-400"
        >
          <Clock className="mr-1 size-3 animate-spin" />
          Reiniciando
        </Badge>
      )
    case 'closed':
      return (
        <Badge data-testid="lifecycle-badge-closed" variant="destructive">
          <XCircle className="mr-1 size-3" />
          Encerrado
        </Badge>
      )
    default:
      return (
        <Badge data-testid="lifecycle-badge-unknown" variant="outline">
          <AlertCircle className="mr-1 size-3" />
          {state}
        </Badge>
      )
  }
}

function getCheckStatusBadge(status: string) {
  switch (status) {
    case 'pass':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
          Sucesso
        </Badge>
      )
    case 'fail':
      return (
        <Badge variant="destructive" className="text-[10px]">
          Falha
        </Badge>
      )
    case 'unavailable':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
        >
          Indisponível
        </Badge>
      )
    case 'not-supported':
      return (
        <Badge variant="outline" className="text-[10px] opacity-70">
          Não Suportado
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px] opacity-70">
          Não Executado
        </Badge>
      )
  }
}

export function SystemLifecycleCard({
  dispatcher,
  sessionId,
  observedGeneration,
  checks,
}: SystemLifecycleCardProps) {
  const failure = dispatcher.lastStartupFailure

  return (
    <div
      data-testid="system-lifecycle-card"
      className="border-border/60 bg-card rounded-lg border p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <Activity className="text-primary size-4" />
          <h3 className="text-foreground text-sm font-semibold">
            Motor Local e Ciclo de Vida
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {getLifecycleBadge(dispatcher.state)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-border/40 bg-muted/20 flex flex-col justify-start rounded-md border p-3">
          <span className="text-muted-foreground mb-1.5 block text-[11px] leading-tight font-medium">
            Geração Observada
          </span>
          <span
            data-testid="lifecycle-generation"
            className="text-foreground font-mono text-xs leading-relaxed font-semibold break-all"
          >
            {observedGeneration}
          </span>
        </div>

        <div className="border-border/40 bg-muted/20 flex flex-col justify-start rounded-md border p-3">
          <span className="text-muted-foreground mb-1.5 block text-[11px] leading-tight font-medium">
            Sessão ID
          </span>
          <span
            data-testid="lifecycle-session-id"
            className="text-foreground font-mono text-xs leading-relaxed break-all select-all"
            title={sessionId}
          >
            {sessionId}
          </span>
        </div>

        <div className="border-border/40 bg-muted/20 flex flex-col justify-start rounded-md border p-3">
          <span className="text-muted-foreground mb-1.5 block text-[11px] leading-tight font-medium">
            Estágio de Inicialização
          </span>
          <span
            data-testid="lifecycle-startup-stage"
            className="text-foreground text-xs leading-relaxed font-medium"
          >
            {dispatcher.startupStage}
          </span>
        </div>
      </div>

      {failure && (
        <div
          data-testid="lifecycle-startup-failure-banner"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-3 rounded-md border p-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="text-xs font-semibold">
              {formatFailureKind(failure.kind)}
            </span>
          </div>

          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Estágio: <span className="font-mono">{failure.stage}</span> · Erro:{' '}
            <span className="font-mono">{failure.messageKey}</span>
            {failure.statusCode !== undefined && (
              <span> (HTTP {failure.statusCode})</span>
            )}
          </p>

          <span className="mt-1 block text-[10px] leading-normal opacity-75">
            Horário do registro: {new Date(failure.timestamp).toLocaleString()}
          </span>
        </div>
      )}

      {checks.length > 0 && (
        <div className="mt-4">
          <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
            <Layers className="size-3.5" />
            Provas de Leitura e Comunicação Realizadas
          </h4>

          <div className="border-border/50 divide-border/40 mt-2 divide-y rounded-md border text-xs">
            {checks.map((check) => (
              <div
                key={check.id}
                data-testid={`diagnostic-check-${check.id}`}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground leading-normal font-medium">
                      {check.name}
                    </span>
                    <span className="text-muted-foreground/80 font-mono text-[10px]">
                      ({check.source})
                    </span>
                  </div>
                  {check.status === 'pass' && (
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Comprova: {check.provenOperation}
                    </p>
                  )}
                  {check.status !== 'pass' && (
                    <p className="text-destructive text-[11px] leading-relaxed">
                      {check.reason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {check.durationMs !== undefined && (
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {check.durationMs}ms
                    </span>
                  )}
                  {getCheckStatusBadge(check.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
