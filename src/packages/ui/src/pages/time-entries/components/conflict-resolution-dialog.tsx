'use client'

import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  FileText,
  FolderKanban,
  Laptop,
  Loader2,
  Tag,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHostBridge } from '@/hooks'
import { useWorkspaceConflicts } from '@/hooks/queries/use-workspace-conflicts'
import { cn } from '@/lib/utils'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import {
  decimalToHMS,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'

export type ConflictResolutionSide = 'local' | 'remote'

export interface ConflictFieldSelection {
  periodAndDuration: ConflictResolutionSide
  comments: ConflictResolutionSide
  task: ConflictResolutionSide
  activity: ConflictResolutionSide
}

const DEFAULT_SELECTION: ConflictFieldSelection = {
  periodAndDuration: 'local',
  comments: 'local',
  task: 'local',
  activity: 'local',
}

function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return '—'
  const parsed = parseISO(isoString)
  if (Number.isNaN(parsed.getTime())) return '—'
  return format(parsed, 'dd/MM/yyyy HH:mm:ss')
}

function formatDuration(decimalHours?: number): string {
  if (decimalHours === undefined || Number.isNaN(decimalHours))
    return '00:00:00'
  return decimalToHMS(decimalHours)
}

function formatPeriod(startDate?: string, endDate?: string | null): string {
  if (!startDate) return '—'
  const startParsed = parseISO(startDate)
  if (Number.isNaN(startParsed.getTime())) return '—'
  const formattedStart = format(startParsed, 'HH:mm')
  if (!endDate) return `${formattedStart} (em andamento)`
  const endParsed = parseISO(endDate)
  if (Number.isNaN(endParsed.getTime())) return formattedStart
  return `${formattedStart} - ${format(endParsed, 'HH:mm')}`
}

export function GlobalConflictResolutionDialog() {
  const { isOpen, activeConflictId, closeConflictModal } =
    useConflictModalStore()
  const { conflictedEntries } = useWorkspaceConflicts()
  const connections = useConnectionsWithSync()

  const db = useSyncStore((state) => state.db)
  const forceSync = useSyncStore((state) => state.forceSync)
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selection, setSelection] =
    useState<ConflictFieldSelection>(DEFAULT_SELECTION)
  const [isResolving, setIsResolving] = useState(false)

  // Sincroniza o índice quando a modal abre ou quando activeConflictId muda
  useEffect(() => {
    if (!isOpen) return
    if (conflictedEntries.length === 0) return

    if (!activeConflictId) {
      setCurrentIndex(0)
      return
    }

    const foundIndex = conflictedEntries.findIndex(
      (entry) => entry.id === activeConflictId,
    )
    if (foundIndex >= 0) {
      setCurrentIndex(foundIndex)
      return
    }
    setCurrentIndex(0)
  }, [isOpen, activeConflictId, conflictedEntries])

  // Reseta seleção para padrão quando o item em exibição muda
  useEffect(() => {
    setSelection(DEFAULT_SELECTION)
  }, [currentIndex, activeConflictId])

  if (!isOpen) return null
  if (conflictedEntries.length === 0) return null

  const safeIndex = Math.min(
    Math.max(0, currentIndex),
    conflictedEntries.length - 1,
  )
  const currentEntry = conflictedEntries[safeIndex]
  if (!currentEntry) return null

  const serverSnapshot = currentEntry.conflictData?.server

  // Dados do Conector Remoto associado à conexão
  const connection = connections.find(
    (conn) => conn.connectionId === currentEntry.connectionInstanceId,
  )

  const localDuration = currentEntry.timeSpent
  const serverDuration =
    serverSnapshot?.timeSpent !== undefined ? serverSnapshot.timeSpent : 0

  const localComments = currentEntry.comments ? currentEntry.comments : ''
  const serverComments =
    serverSnapshot?.comments !== undefined ? serverSnapshot.comments : ''

  const localStartDate = currentEntry.startDate
  const localEndDate = currentEntry.endDate

  const serverStartDate =
    serverSnapshot?.startDate !== undefined
      ? serverSnapshot.startDate
      : undefined
  const serverEndDate =
    serverSnapshot?.endDate !== undefined ? serverSnapshot.endDate : null

  const localTaskId = currentEntry.task?.id ? currentEntry.task.id : ''
  const serverTaskId =
    serverSnapshot?.task?.id !== undefined ? serverSnapshot.task.id : ''

  const localActivityId = currentEntry.activity?.id
    ? currentEntry.activity.id
    : ''
  const serverActivityId =
    serverSnapshot?.activity?.id !== undefined ? serverSnapshot.activity.id : ''

  const localActivityName = currentEntry.activity?.name
    ? currentEntry.activity.name
    : ''
  const serverActivityName =
    serverSnapshot?.activity?.name !== undefined
      ? serverSnapshot.activity.name
      : ''

  const localUpdatedAt = currentEntry.updatedAt
  const serverUpdatedAt =
    serverSnapshot?.updatedAt !== undefined
      ? serverSnapshot.updatedAt
      : undefined

  const isDurationDiff = localDuration !== serverDuration
  const isCommentsDiff = localComments !== serverComments
  const isPeriodDiff =
    localStartDate !== serverStartDate || localEndDate !== serverEndDate
  const isTaskDiff = localTaskId !== serverTaskId
  const isActivityDiff =
    localActivityId !== '' && serverActivityId !== ''
      ? localActivityId !== serverActivityId
      : localActivityName !== serverActivityName

  const handleSelectAll = (side: ConflictResolutionSide) => {
    setSelection({
      periodAndDuration: side,
      comments: side,
      task: side,
      activity: side,
    })
  }

  const handleSelectField = (
    field: keyof ConflictFieldSelection,
    side: ConflictResolutionSide,
  ) => {
    setSelection((prev) => ({
      ...prev,
      [field]: side,
    }))
  }

  const handleNavigate = (nextIndex: number) => {
    if (nextIndex < 0) return
    if (nextIndex >= conflictedEntries.length) return
    setCurrentIndex(nextIndex)
  }

  const handleAcceptMerge = async () => {
    if (!db) return
    setIsResolving(true)
    try {
      const doc = await db.timeEntries.findOne(currentEntry.id).exec()
      if (!doc) {
        toast.error('Apontamento não encontrado para resolução de conflito')
        return
      }

      const docData = doc.toMutableJSON()

      const chosenDuration =
        selection.periodAndDuration === 'local' ? localDuration : serverDuration
      const chosenComments =
        selection.comments === 'local' ? localComments : serverComments
      const chosenStartDate =
        selection.periodAndDuration === 'local'
          ? localStartDate
          : serverStartDate
      const chosenEndDate =
        selection.periodAndDuration === 'local' ? localEndDate : serverEndDate
      const chosenTaskId =
        selection.task === 'local' ? localTaskId : serverTaskId
      const chosenActivityId =
        selection.activity === 'local' ? localActivityId : serverActivityId
      const chosenActivityName =
        selection.activity === 'local' ? localActivityName : serverActivityName

      const hasAnyLocalSelection =
        selection.periodAndDuration === 'local' ||
        selection.comments === 'local' ||
        selection.task === 'local' ||
        selection.activity === 'local'

      const updatedDoc = await doc.incrementalModify((draft) => {
        draft.timeSpent = chosenDuration
        draft.comments = chosenComments

        if (chosenStartDate !== undefined) {
          draft.startDate = chosenStartDate
        }
        draft.endDate = chosenEndDate

        if (chosenTaskId) {
          draft.task = { id: chosenTaskId }
        }
        if (chosenActivityId) {
          draft.activity = {
            id: chosenActivityId,
            ...(chosenActivityName ? { name: chosenActivityName } : {}),
          }
        }

        if (hasAnyLocalSelection) {
          draft.syncStatus = 'pending_push'
        } else {
          draft.syncStatus = 'synced'
          draft.conflictData = undefined
        }
        draft.updatedAt = new Date().toISOString()
        return draft
      })

      const updatedJson = updatedDoc.toMutableJSON()
      toast.success('Conflito mesclado com sucesso!')

      queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
        { queryKey: ['time-entries-range'] },
        (previous) => {
          if (!previous) return previous
          const exists = previous.some(
            (item) => item.id === updatedJson.id || item.id === currentEntry.id,
          )
          if (exists) {
            return previous.map((item) => {
              if (item.id === updatedJson.id || item.id === currentEntry.id) {
                return updatedJson
              }
              return item
            })
          }
          return [updatedJson, ...previous]
        },
      )

      bridge.events.emit('time-entry:sync', updatedJson)
      bridge.events.emit('time-entry:conflict-resolved', updatedJson)

      if (hasAnyLocalSelection && forceSync) {
        await forceSync(docData.connectionInstanceId, 'push')
      }

      await queryClient.refetchQueries({
        queryKey: ['time-entries-range'],
        type: 'active',
      })

      if (conflictedEntries.length <= 1) {
        closeConflictModal()
        return
      }

      if (safeIndex >= conflictedEntries.length - 1) {
        setCurrentIndex(Math.max(0, conflictedEntries.length - 2))
        return
      }
    } catch (err) {
      console.error('Erro ao resolver conflito:', err)
      toast.error('Erro ao resolver conflito de sincronização')
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isResolving) closeConflictModal()
      }}
    >
      <DialogContent className="border-border/60 bg-background/95 flex max-h-[92vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-0 shadow-2xl backdrop-blur-xl sm:max-w-4xl">
        <DialogHeader className="border-border/40 shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Conflito de Sincronização
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  Escolha individualmente quais campos deseja manter ou aplique
                  uma das versões completas.
                </DialogDescription>
              </div>
            </div>

            {/* Paginação de Múltiplos Conflitos (1 / N) */}
            {conflictedEntries.length > 1 && (
              <div className="border-border/50 bg-muted/30 flex items-center gap-1.5 rounded-md border px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-xs"
                  disabled={safeIndex <= 0 || isResolving}
                  onClick={() => handleNavigate(safeIndex - 1)}
                  title="Conflito anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-1 font-mono text-xs font-semibold select-none">
                  {safeIndex + 1} / {conflictedEntries.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-xs"
                  disabled={
                    safeIndex >= conflictedEntries.length - 1 || isResolving
                  }
                  onClick={() => handleNavigate(safeIndex + 1)}
                  title="Próximo conflito"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-6">
          {/* Coluna Versão Local */}
          <div className="border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4">
            <div className="border-border/40 flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Laptop className="text-primary h-4 w-4" />
                <span className="text-sm font-semibold">Versão Local</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-primary/10 text-primary text-[10px]"
                >
                  Este Dispositivo
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground text-[11px]">
                Dados salvos localmente
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold"
                disabled={isResolving}
                onClick={() => handleSelectAll('local')}
              >
                Selecionar Tudo Local
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Período e Duração */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('periodAndDuration', 'local')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.periodAndDuration === 'local'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Período e Duração</span>
                    {(isPeriodDiff || isDurationDiff) && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.periodAndDuration === 'local' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs">
                    {formatPeriod(localStartDate, localEndDate)}
                  </span>
                  <span className="font-mono text-sm font-bold">
                    {formatDuration(localDuration)}
                  </span>
                </div>
              </div>

              {/* Descrição / Comentários */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('comments', 'local')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.comments === 'local'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Descrição / Comentários</span>
                    {isCommentsDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.comments === 'local' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 line-clamp-3 text-xs">
                  {localComments ? (
                    localComments
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Sem comentário
                    </span>
                  )}
                </div>
              </div>

              {/* Tarefa */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('task', 'local')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.task === 'local'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span>Tarefa</span>
                    {isTaskDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.task === 'local' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs font-semibold">
                  {localTaskId ? (
                    localTaskId
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Sem tarefa
                    </span>
                  )}
                </div>
              </div>

              {/* Atividade */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('activity', 'local')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.activity === 'local'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Atividade</span>
                    {isActivityDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.activity === 'local' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs">
                  {localActivityName ? (
                    localActivityName
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Padrão
                    </span>
                  )}
                </div>
              </div>

              <div className="text-muted-foreground pt-1 text-[11px]">
                <span>Modificado: </span>
                <span className="font-mono">
                  {formatTimestamp(localUpdatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Coluna Versão Remota (Servidor / Conector) */}
          <div className="border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4">
            <div className="border-border/40 flex items-center justify-between border-b pb-2">
              <div className="flex min-w-0 items-center gap-2">
                {connection?.addon?.logo ? (
                  <img
                    src={connection.addon.logo}
                    alt={connection.addon.name}
                    className="h-4 w-4 shrink-0 rounded-xs object-contain"
                  />
                ) : (
                  <Cloud className="h-4 w-4 shrink-0 text-blue-500" />
                )}
                <span className="truncate text-sm font-semibold">
                  {connection?.addon?.name
                    ? connection.addon.name
                    : 'Servidor Remoto'}
                </span>
                {connection?.member?.name && (
                  <span className="text-muted-foreground truncate text-[11px]">
                    ({connection.member.name})
                  </span>
                )}
              </div>
              <Badge
                variant="outline"
                className="border-blue-500/40 bg-blue-500/10 text-[10px] text-blue-500"
              >
                Servidor
              </Badge>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground text-[11px]">
                Dados recebidos do conector
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold"
                disabled={isResolving}
                onClick={() => handleSelectAll('remote')}
              >
                Selecionar Tudo Remoto
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Período e Duração */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('periodAndDuration', 'remote')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.periodAndDuration === 'remote'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Período e Duração</span>
                    {(isPeriodDiff || isDurationDiff) && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.periodAndDuration === 'remote' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs">
                    {formatPeriod(serverStartDate, serverEndDate)}
                  </span>
                  <span className="font-mono text-sm font-bold">
                    {formatDuration(serverDuration)}
                  </span>
                </div>
              </div>

              {/* Descrição / Comentários */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('comments', 'remote')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.comments === 'remote'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Descrição / Comentários</span>
                    {isCommentsDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.comments === 'remote' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 line-clamp-3 text-xs">
                  {serverComments ? (
                    serverComments
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Sem comentário
                    </span>
                  )}
                </div>
              </div>

              {/* Tarefa */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('task', 'remote')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.task === 'remote'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span>Tarefa</span>
                    {isTaskDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.task === 'remote' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs font-semibold">
                  {serverTaskId ? (
                    serverTaskId
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Sem tarefa
                    </span>
                  )}
                </div>
              </div>

              {/* Atividade */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectField('activity', 'remote')}
                className={cn(
                  'cursor-pointer rounded-md border p-2.5 transition-all select-none',
                  selection.activity === 'remote'
                    ? 'border-amber-500/70 bg-amber-500/15 shadow-xs ring-1 ring-amber-500/40'
                    : 'border-border/40 bg-background/40 hover:bg-background/80 opacity-70 hover:opacity-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Atividade</span>
                    {isActivityDiff && (
                      <span className="py-0.2 rounded-xs bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Divergente
                      </span>
                    )}
                  </div>
                  {selection.activity === 'remote' && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <Check className="h-3 w-3" /> Selecionado
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs">
                  {serverActivityName ? (
                    serverActivityName
                  ) : (
                    <span className="text-muted-foreground/60 italic">
                      Padrão
                    </span>
                  )}
                </div>
              </div>

              <div className="text-muted-foreground pt-1 text-[11px]">
                <span>Modificado: </span>
                <span className="font-mono">
                  {formatTimestamp(serverUpdatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-border/40 bg-muted/10 flex shrink-0 flex-row items-center justify-between gap-3 border-t px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isResolving}
            onClick={closeConflictModal}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isResolving}
            onClick={handleAcceptMerge}
            className="gap-1.5 bg-amber-500 font-semibold text-white hover:bg-amber-600 dark:text-black"
          >
            {isResolving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>Aceitar Mesclagem</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface ConflictResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: SuggestionRow | null
  onResolve: (
    rowId: string,
    resolution: 'local' | 'remote',
  ) => Promise<void> | void
}

/**
 * @deprecated Use GlobalConflictResolutionDialog directly via useConflictModalStore.
 * Mantido para compatibilidade reversa com chamadas pontuais antigas se houverem.
 */
export function ConflictResolutionDialog({
  open,
  row,
}: ConflictResolutionDialogProps) {
  const openConflictModal = useConflictModalStore(
    (state) => state.openConflictModal,
  )

  useEffect(() => {
    if (!open) return
    if (!row) return
    openConflictModal(row.id)
  }, [open, row, openConflictModal])

  return null
}
