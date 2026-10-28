import type {
  DiagnosticCountAvailability,
  DiagnosticOperationalWorkspaceStatus,
  DiagnosticReplicationAvailability,
  DiagnosticWorkspaceOperationalStatus,
} from '@mr-tick/application'
import { FolderKanban } from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SystemWorkspaceStatusCardProps {
  workspaces: DiagnosticOperationalWorkspaceStatus[]
  selectedWorkspaceId: string | null
  onSelectWorkspaceId: (id: string | null) => void
}

function getStatusBadge(status: DiagnosticWorkspaceOperationalStatus) {
  switch (status) {
    case 'ready':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
          Pronto
        </Badge>
      )
    case 'opening':
      return (
        <Badge
          variant="secondary"
          className="text-[10px] text-blue-600 dark:text-blue-400"
        >
          Abrindo...
        </Badge>
      )
    case 'maintenance':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
        >
          Manutenção
        </Badge>
      )
    case 'unavailable':
      return (
        <Badge variant="destructive" className="text-[10px]">
          Indisponível
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="text-[10px]">
          Fechado
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px]">
          {status}
        </Badge>
      )
  }
}

function formatCountAvailability(
  availability?: DiagnosticCountAvailability,
): string {
  if (availability === undefined) {
    return 'Não coletado'
  }

  if (availability.status === 'available') {
    return String(availability.count)
  }

  if (availability.status === 'not-supported') {
    return 'Não suportado'
  }

  if (availability.status === 'unavailable') {
    return 'Indisponível'
  }

  return 'Erro na contagem'
}

function formatReplicationSummary(
  replication?: DiagnosticReplicationAvailability,
): string {
  if (replication === undefined) {
    return 'Não coletado'
  }

  if (replication.status === 'available') {
    if (replication.items.length === 0) {
      return 'Nenhum canal ativo'
    }
    return `${replication.items.length} canal(is) ativo(s)`
  }

  if (replication.status === 'disabled') {
    return 'Desativado'
  }

  if (replication.status === 'not-supported') {
    return 'Não suportado'
  }

  if (replication.status === 'unavailable') {
    return 'Indisponível'
  }

  return 'Erro na replicação'
}

export function SystemWorkspaceStatusCard({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspaceId,
}: SystemWorkspaceStatusCardProps) {
  const filteredWorkspaces = selectedWorkspaceId
    ? workspaces.filter((w) => w.workspaceId === selectedWorkspaceId)
    : workspaces

  return (
    <div
      data-testid="system-workspace-status-card"
      className="border-border/60 bg-card rounded-lg border p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="text-primary size-4" />
          <h3 className="text-foreground text-sm font-semibold">
            Armazenamento Operacional por Workspace
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Escopo:</span>
          <Select
            value={selectedWorkspaceId ?? 'all'}
            onValueChange={(val) =>
              onSelectWorkspaceId(val === 'all' ? null : val)
            }
          >
            <SelectTrigger
              data-testid="workspace-scope-select"
              className="h-7 w-[200px] text-xs"
            >
              <SelectValue placeholder="Todos os Workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Workspaces</SelectItem>
              {workspaces.map((w) => (
                <SelectItem key={w.workspaceId} value={w.workspaceId}>
                  Workspace {w.workspaceId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        Status de execução operacional do banco de dados local isolado por
        workspace, separado do canal de replicação remota.
      </p>

      <div className="border-border/50 divide-border/40 mt-3 divide-y rounded-md border text-xs">
        {filteredWorkspaces.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center">
            {selectedWorkspaceId
              ? 'Workspace selecionado não encontrado no snapshot.'
              : 'Nenhum workspace operacional registrado.'}
          </div>
        ) : (
          filteredWorkspaces.map((ws) => (
            <div
              key={ws.workspaceId}
              data-testid={`workspace-status-item-${ws.workspaceId}`}
              className="space-y-2 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-semibold">
                    Workspace: {ws.workspaceId}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {ws.hasDb ? 'Base Local Presente' : 'Base Ausente'}
                  </Badge>
                </div>
                {getStatusBadge(ws.status)}
              </div>

              {/* Fila Local vs Replicação Remota */}
              <div className="bg-muted/20 border-border/40 grid grid-cols-2 gap-2 rounded-md border p-2.5 sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground mb-1 block text-[10px] leading-tight">
                    Escritas Pendentes
                  </span>
                  <span
                    data-testid="ws-pending-writes"
                    className="text-foreground font-mono text-xs leading-normal font-semibold"
                  >
                    {formatCountAvailability(ws.pendingWrites)}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground mb-1 block text-[10px] leading-tight">
                    Comprovantes (Receipts)
                  </span>
                  <span
                    data-testid="ws-receipts-count"
                    className="text-foreground font-mono text-xs leading-normal font-semibold"
                  >
                    {formatCountAvailability(ws.receipts)}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground mb-1 block text-[10px] leading-tight">
                    Tombstones
                  </span>
                  <span
                    data-testid="ws-tombstones-count"
                    className="text-foreground font-mono text-xs leading-normal font-semibold"
                  >
                    {formatCountAvailability(ws.tombstones)}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground mb-1 block text-[10px] leading-tight">
                    Replicação Remota
                  </span>
                  <span
                    data-testid="ws-replication-status"
                    className="text-foreground font-mono text-xs leading-normal"
                  >
                    {formatReplicationSummary(ws.replication)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
