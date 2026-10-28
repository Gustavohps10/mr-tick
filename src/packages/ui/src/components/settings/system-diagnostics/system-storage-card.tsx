import type {
  DiagnosticStorageAvailability,
  DiagnosticStorageCoverage,
  DiagnosticStorageItem,
  DiagnosticStorageRole,
} from '@mr-tick/application'
import { Database, HardDrive } from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'

interface SystemStorageCardProps {
  storages: DiagnosticStorageItem[]
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

export function SystemStorageCard({ storages }: SystemStorageCardProps) {
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
              className="flex flex-wrap items-center justify-between gap-3 p-3"
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

              <div className="shrink-0">
                {renderMeasurement(item.measurement)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
