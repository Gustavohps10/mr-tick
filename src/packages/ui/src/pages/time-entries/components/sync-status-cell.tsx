'use client'

import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CloudAlert,
  CloudOff,
  Lightbulb,
  Pause,
  XCircle,
} from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'

export interface SyncStatusCellProps {
  original: SuggestionRow
  isGroupMaster: boolean
  onResolveConflict?: (
    rowId: string,
    resolution: 'local' | 'remote',
  ) => Promise<void> | void
  onOpenConflict?: (row: SuggestionRow) => void
}

function formatSyncTimestamp(isoString?: string | null): string {
  if (!isoString) {
    return 'Nunca'
  }
  const parsed = parseISO(isoString)
  if (Number.isNaN(parsed.getTime())) {
    return 'Data inválida'
  }
  return format(parsed, 'dd/MM/yyyy HH:mm:ss')
}

export function SyncStatusCell({
  original,
  isGroupMaster,
  onOpenConflict,
}: SyncStatusCellProps) {
  const openConflictModal = useConflictModalStore(
    (state) => state.openConflictModal,
  )

  if (isGroupMaster) {
    return (
      <div className="text-muted-foreground/40 flex justify-center font-mono text-xs select-none">
        —
      </div>
    )
  }

  const hasTaskAndConn = Boolean(
    original.connectionInstanceId &&
    original.connectionInstanceId.trim() !== '' &&
    original.task?.id &&
    original.task.id.trim() !== '',
  )
  const isMissingActivity =
    !original.activity?.id || original.activity.id.trim() === ''

  if (original.timeStatus === 'running') {
    return (
      <div className="flex items-center justify-center gap-1">
        <Badge
          variant="outline"
          className="border-primary/50 bg-primary/15 text-primary gap-1 px-1.5 py-0.5 text-[10px] font-bold shadow-xs"
        >
          <span className="relative flex h-2 w-2">
            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
          </span>
          <span>AO VIVO</span>
        </Badge>
        {hasTaskAndConn && isMissingActivity && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex cursor-help items-center text-amber-500 transition-colors">
                <CloudAlert className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                Atividade Não Selecionada
              </p>
              <p className="text-muted-foreground text-[10px]">
                Selecione uma atividade para que o apontamento possa ser enviado
                ao servidor ao finalizar.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  if (original.timeStatus === 'paused') {
    return (
      <div className="flex justify-center">
        <Badge
          variant="outline"
          className="gap-1 border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
        >
          <Pause className="h-2.5 w-2.5 fill-current" />
          <span>PAUSADO</span>
        </Badge>
      </div>
    )
  }

  if (original.isSuggestion || original.timeStatus === 'suggestion') {
    return (
      <div className="flex justify-center">
        <Badge
          variant="outline"
          className="gap-1 border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
        >
          <Lightbulb className="h-3 w-3 fill-current text-amber-500" />
          <span>SUGESTÃO</span>
        </Badge>
      </div>
    )
  }

  if (original.syncStatus === 'conflict') {
    return (
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            if (onOpenConflict) {
              onOpenConflict(original)
              return
            }
            openConflictModal(original.id)
          }}
          className="h-6 gap-1 border-amber-500/60 bg-amber-500/15 px-2 text-[10px] font-bold text-amber-600 shadow-2xs hover:bg-amber-500/25 dark:text-amber-400"
          title="Clique para comparar e resolver conflito"
        >
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span>Conflito</span>
        </Button>
      </div>
    )
  }

  if (hasTaskAndConn && isMissingActivity) {
    return (
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex cursor-help items-center gap-1 text-amber-500 transition-colors">
              <CloudAlert className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Atividade Pendente
            </p>
            <p className="text-muted-foreground text-[10px]">
              Selecione uma atividade para sincronizar este apontamento com o
              servidor remoto.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  // Se for estritamente local (não enviado e sem vínculo)
  const isLocalOnly =
    original.syncStatus === 'local_only' &&
    !original.lastPulledAt &&
    !original.lastPushedAt

  if (isLocalOnly) {
    return (
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground/50 hover:text-muted-foreground flex cursor-help items-center gap-1 transition-colors">
              <CloudOff className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="text-[11px] font-semibold">
              Apontamento Apenas Local
            </p>
            <p className="text-muted-foreground text-[10px]">
              Este registro não possui tarefa remota vinculada e não será
              enviado ao servidor.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  // Painel bidirecional de sincronização (Pull ↓ e Push ↑)
  const hasPulled = Boolean(original.lastPulledAt)
  const isPendingPush = original.syncStatus === 'pending_push'
  const isSyncError = original.syncStatus === 'error'
  const hasPushed =
    Boolean(original.lastPushedAt) && original.syncStatus === 'synced'

  const pullTooltipTitle = hasPulled
    ? 'Recebido do Servidor (Pull)'
    : 'Pull Servidor'
  const pullTooltipDetail = hasPulled
    ? `Recebido em ${formatSyncTimestamp(original.lastPulledAt)}`
    : 'Criado localmente (nunca recebido via pull)'

  const pushInfo = (() => {
    if (isSyncError) {
      let detail =
        'Ocorreu um erro ao tentar enviar este apontamento ao servidor remoto.'
      if (original.syncError) detail = original.syncError
      return {
        title: 'Falha na Sincronização (Push)',
        detail,
        color: 'text-destructive',
      }
    }
    if (isPendingPush) {
      return {
        title: 'Preparado para Envio (Push)',
        detail:
          'Apontamento vinculado à tarefa remota. Alterações locais aguardando envio.',
        color: 'animate-pulse text-amber-500',
      }
    }
    if (hasPushed) {
      return {
        title: 'Enviado ao Servidor (Push)',
        detail: `Enviado com sucesso em ${formatSyncTimestamp(original.lastPushedAt)}`,
        color: 'text-emerald-500/90 hover:text-emerald-500',
      }
    }
    return {
      title: 'Envio ao Servidor (Push)',
      detail: 'Nunca enviado ao servidor',
      color: 'text-muted-foreground/30',
    }
  })()

  const pushTestId = isSyncError
    ? 'sync-status-error'
    : isPendingPush
      ? 'sync-status-pending-push'
      : hasPushed
        ? 'sync-status-synced'
        : 'sync-status-unpushed'

  return (
    <div className="flex items-center justify-center gap-1.5">
      {/* Indicador Pull (↓) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex cursor-help items-center justify-center transition-colors',
              hasPulled
                ? 'text-emerald-500/90 hover:text-emerald-500'
                : 'text-muted-foreground/30',
            )}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="text-[11px] font-semibold">{pullTooltipTitle}</p>
          <p className="text-muted-foreground font-mono text-[10px]">
            {pullTooltipDetail}
          </p>
        </TooltipContent>
      </Tooltip>

      <span className="text-muted-foreground/30 text-[8px] select-none">•</span>

      {/* Indicador Push (↑) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={pushTestId}
            className={cn(
              'inline-flex cursor-help items-center justify-center transition-colors',
              pushInfo.color,
            )}
          >
            {isSyncError ? (
              <XCircle className="text-destructive h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p
            className={cn(
              'text-[11px] font-semibold',
              isSyncError && 'text-destructive',
            )}
          >
            {pushInfo.title}
          </p>
          <p
            className={cn(
              'mt-0.5 text-[10px] break-words',
              isSyncError
                ? 'text-destructive font-medium'
                : 'text-muted-foreground font-mono',
            )}
          >
            {pushInfo.detail}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
