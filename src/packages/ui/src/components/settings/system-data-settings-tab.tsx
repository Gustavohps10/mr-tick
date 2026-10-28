import { AlertTriangle, Copy, FolderOpen, RefreshCw, X } from 'lucide-react'
import React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemDiagnostics } from '@/hooks/use-system-diagnostics'

import { SystemEventsCard } from './system-diagnostics/system-events-card'
import { SystemLifecycleCard } from './system-diagnostics/system-lifecycle-card'
import { SystemStorageCard } from './system-diagnostics/system-storage-card'
import { SystemWorkspaceStatusCard } from './system-diagnostics/system-workspace-status-card'

export function SystemDataSettingsTab() {
  const {
    snapshot,
    isLoading,
    isChecking,
    isExporting,
    errorMessage,
    actionError,
    clearActionError,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    runManualChecks,
    copySanitizedReport,
    openDataDirectory,
  } = useSystemDiagnostics()

  const handleCopyReport = async () => {
    const result = await copySanitizedReport()
    if (result.success) {
      toast.success(
        'Relatório de diagnóstico sanitizado copiado para a área de transferência.',
      )
      return
    }

    toast.error(result.error)
  }

  const handleOpenFolder = async () => {
    const result = await openDataDirectory()
    if (result.success) {
      toast.info('Diretório de dados aberto no gerenciador de arquivos.')
      return
    }

    toast.error(result.error)
  }

  const handleRunChecks = async () => {
    const result = await runManualChecks()
    if (!result.success) {
      toast.error(result.error)
    }
  }

  if (isLoading) {
    return (
      <div
        data-testid="system-data-loading-skeleton"
        className="flex flex-col gap-6"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (errorMessage && !snapshot) {
    return (
      <div
        data-testid="system-data-error-state"
        className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-6 text-center"
      >
        <h4 className="text-sm font-semibold">
          Falha ao Carregar Dados de Diagnóstico
        </h4>
        <p className="mt-1 text-xs">{errorMessage}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunChecks}
          className="mt-4 text-xs"
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Tentar Novamente
        </Button>
      </div>
    )
  }

  if (!snapshot) return null

  return (
    <div
      data-testid="system-data-settings-tab"
      className="flex flex-col gap-6 pb-6"
    >
      {/* Barra de Ações Superior */}
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">
              Saúde do Sistema e Diagnóstico
            </h3>
            <Badge variant="outline" className="font-mono text-[10px]">
              Revisão #{snapshot.revision}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Última coleta realizada às{' '}
            {new Date(snapshot.emittedAt).toLocaleTimeString()} · Versão do
            esquema {snapshot.formatVersion}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="diagnostics-check-now-btn"
            variant="outline"
            size="sm"
            disabled={isChecking}
            onClick={handleRunChecks}
            className="h-8 cursor-pointer text-xs"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${isChecking ? 'animate-spin' : ''}`}
            />
            {isChecking ? 'Verificando...' : 'Verificar agora'}
          </Button>

          <Button
            data-testid="diagnostics-copy-report-btn"
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={handleCopyReport}
            className="h-8 cursor-pointer text-xs"
          >
            <Copy className="mr-1.5 size-3.5" />
            Copiar diagnóstico
          </Button>

          <Button
            data-testid="diagnostics-open-folder-btn"
            variant="outline"
            size="sm"
            onClick={handleOpenFolder}
            className="h-8 cursor-pointer text-xs"
          >
            <FolderOpen className="mr-1.5 size-3.5" />
            Abrir pasta de dados
          </Button>
        </div>
      </div>

      {/* Alerta de Falha de Ação (Verificar agora / Copiar / Abrir pasta) */}
      {actionError && (
        <div
          data-testid="system-data-action-error"
          className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between rounded-lg border p-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearActionError}
            className="h-6 px-2 text-xs"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* 1. Ciclo de Vida e Provas Reais */}
      <SystemLifecycleCard
        dispatcher={snapshot.dispatcher}
        sessionId={snapshot.sessionId}
        observedGeneration={snapshot.observedGeneration}
        checks={snapshot.checks}
      />

      {/* 2. Armazenamentos por Capacidade Funcional */}
      <SystemStorageCard storages={snapshot.storages} />

      {/* 3. Armazenamento Operacional por Workspace */}
      <SystemWorkspaceStatusCard
        workspaces={snapshot.workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspaceId={setSelectedWorkspaceId}
      />

      {/* 4. Eventos e Buffer */}
      <SystemEventsCard
        events={snapshot.recentEvents}
        discardedEventsCount={snapshot.discardedEventsCount}
      />
    </div>
  )
}
