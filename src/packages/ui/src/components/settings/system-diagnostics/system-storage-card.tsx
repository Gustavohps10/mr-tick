import type {
  DiagnosticStorageAvailability,
  DiagnosticStorageCoverage,
  DiagnosticStorageItem,
  DiagnosticStorageRole,
} from '@mr-tick/application'
import { Database, HardDrive } from 'lucide-react'
import React from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'

interface SystemStorageCardProps {
  storages: DiagnosticStorageItem[]
  resettingWorkspaceId: string | null
  removingOrphanHash?: string | null
  onResetStorage: (workspaceId: string) => void
  onRemoveOrphanStorage?: (hash: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatRole(role: DiagnosticStorageRole): string {
  switch (role) {
    case 'metadata':
      return 'Metadados Globais'
    case 'operational':
      return 'Dados Operacionais'
    case 'analytics':
      return 'Analytics'
    case 'browser':
      return 'Origem / Navegador'
    default:
      return role
  }
}

function formatCoverage(coverage: DiagnosticStorageCoverage): string {
  switch (coverage) {
    case 'file':
      return 'Arquivo Físico'
    case 'origin':
      return 'Origem Web / Sandbox'
    case 'workspace':
      return 'Workspace Específico'
    default:
      return coverage
  }
}

function renderMeasurement(measurement: DiagnosticStorageAvailability) {
  if (measurement.status === 'available') {
    const isEstimated = measurement.precision === 'estimated'

    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span
            data-testid="storage-bytes-value"
            className="text-foreground font-mono text-xs font-semibold"
          >
            {formatBytes(measurement.bytes)}
          </span>
          <Badge
            variant={isEstimated ? 'outline' : 'secondary'}
            className="text-[10px]"
          >
            {isEstimated ? 'Estimado' : 'Exato'}
          </Badge>
        </div>

        <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <span>{formatCoverage(measurement.coverage)}</span>
          <span>·</span>
          <span>{new Date(measurement.collectedAt).toLocaleTimeString()}</span>
        </div>

        {measurement.overlappingTargets &&
          measurement.overlappingTargets.length > 0 && (
            <span
              className="text-muted-foreground/80 text-[10px] italic"
              title={measurement.overlappingTargets.join(', ')}
            >
              (Possui sobreposição de origem)
            </span>
          )}
      </div>
    )
  }

  if (measurement.status === 'error') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge
          data-testid="storage-error-badge"
          variant="destructive"
          className="text-[10px]"
        >
          Erro
        </Badge>
        <span
          data-testid="storage-error-reason"
          className="text-destructive text-right text-[10px] font-medium"
        >
          {measurement.reason}
        </span>
        {measurement.details !== undefined && (
          <div
            data-testid="storage-error-details"
            className="text-muted-foreground max-w-xs space-y-0.5 text-right font-mono text-[10px] break-all"
          >
            {Object.entries(measurement.details).map(([field, messages]) => (
              <div key={field}>
                <span className="font-medium">{field}:</span>{' '}
                <span>{messages.join(', ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Badge
        data-testid="storage-unavailable-badge"
        variant="outline"
        className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
      >
        {measurement.status === 'not-supported'
          ? 'Não Suportado'
          : 'Medição Indisponível'}
      </Badge>
      <span
        data-testid="storage-unavailable-reason"
        className="text-muted-foreground text-[10px]"
      >
        {measurement.reason}
      </span>
    </div>
  )
}

function ConfirmDestructiveStorageAction({
  itemId,
  triggerLabel,
  busyLabel,
  dialogTitle,
  dialogDescription,
  confirmLabel,
  isBusy,
  onConfirm,
}: {
  itemId: string
  triggerLabel: string
  busyLabel: string
  dialogTitle: string
  dialogDescription: string
  confirmLabel: string
  isBusy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          data-testid={`reset-storage-${itemId}`}
          disabled={isBusy}
          className="h-7 px-2.5 text-[11px]"
        >
          {isBusy && busyLabel}
          {!isBusy && triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={`reset-storage-dialog-${itemId}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid={`cancel-reset-storage-${itemId}`}
            disabled={isBusy}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid={`confirm-reset-storage-${itemId}`}
            className={buttonVariants({ variant: 'destructive' })}
            disabled={isBusy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SystemStorageCard({
  storages,
  resettingWorkspaceId,
  removingOrphanHash = null,
  onResetStorage,
  onRemoveOrphanStorage,
}: SystemStorageCardProps) {
  return (
    <div
      data-testid="system-storage-card"
      className="border-border/60 bg-card rounded-lg border p-4 shadow-xs"
    >
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="text-primary size-4" />
          <h3 className="text-foreground text-sm font-semibold">
            Armazenamento por Capacidade Funcional
          </h3>
        </div>
        <span className="text-muted-foreground text-[11px]">
          {storages.length} capacidades registradas
        </span>
      </div>

      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        As tecnologias de persistência são metadados dos adaptadores reais. A
        medição de ocupação respeita a precisão física e limites de isolamento
        da origem.
      </p>

      <div className="border-border/50 divide-border/40 mt-3 divide-y rounded-md border text-xs">
        {storages.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center">
            Nenhum armazenamento registrado no snapshot.
          </div>
        ) : (
          storages.map((item) => (
            <div
              key={item.id}
              data-testid={`storage-item-${item.id}`}
              className="flex flex-wrap items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Database className="text-muted-foreground size-3.5" />
                  <span className="text-foreground font-semibold">
                    {item.name}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {item.technology.toUpperCase()}
                  </Badge>
                </div>

                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-relaxed">
                  <span>Função: {formatRole(item.role)}</span>
                  {item.location && (
                    <>
                      <span>·</span>
                      <span
                        className="max-w-[280px] truncate font-mono text-[10px]"
                        title={item.location}
                      >
                        {item.location}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {renderMeasurement(item.measurement)}
                {item.canReset === true && item.workspaceId !== undefined && (
                  <ConfirmDestructiveStorageAction
                    itemId={item.id}
                    triggerLabel="Resetar dados"
                    busyLabel="Resetando..."
                    dialogTitle="Resetar dados do Analytics?"
                    dialogDescription={`Esta ação removerá permanentemente o arquivo local do Analytics (${item.name}) neste dispositivo, incluindo espaços salvos e caches de consulta deste workspace. Seus dados na fonte remota não serão alterados.`}
                    confirmLabel="Confirmar reset"
                    isBusy={resettingWorkspaceId === item.workspaceId}
                    onConfirm={() => {
                      if (item.workspaceId !== undefined)
                        onResetStorage(item.workspaceId)
                    }}
                  />
                )}
                {item.canReset === true &&
                  item.orphanHash !== undefined &&
                  onRemoveOrphanStorage !== undefined && (
                    <ConfirmDestructiveStorageAction
                      itemId={item.id}
                      triggerLabel="Limpar órfão"
                      busyLabel="Removendo..."
                      dialogTitle="Remover arquivo órfão do Analytics?"
                      dialogDescription={`O arquivo (${item.name}) não pertence a nenhum workspace ativo neste dispositivo. Removê-lo libera espaço em disco e elimina o erro local sem afetar seus workspaces ativos.`}
                      confirmLabel="Remover arquivo"
                      isBusy={removingOrphanHash === item.orphanHash}
                      onConfirm={() => {
                        if (item.orphanHash !== undefined)
                          onRemoveOrphanStorage(item.orphanHash)
                      }}
                    />
                  )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
