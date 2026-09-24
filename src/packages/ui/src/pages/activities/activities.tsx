'use client'

import { WorkspaceViewModel } from '@mr-tick/shared/view-models'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  CableIcon,
  CalendarIcon,
  CopyIcon,
  CopyPlusIcon,
  MoveRightIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
} from 'lucide-react'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { DeepReadonly, RxDocument } from 'rxdb'
import { toast } from 'sonner'

import { Loader } from '@/components'
import AutomationModal from '@/components/automation-modal'
import { Board } from '@/components/dnd/board'
import { TBoard, TCard, TColumn } from '@/components/dnd/data'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { KanbanColumnRxDBDTO } from '@/local-db/schemas/kanban-column-schema'
import { TaskKanbanColumnRxDBDTO } from '@/local-db/schemas/kanban-task-columns-schema'
import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { AppDatabase, useSyncStore } from '@/stores/syncStore'

type TaskWithTimeEntries = SyncTaskRxDBDTO & { timeEntries: any[] }

const getRandomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function KanbanSkeleton() {
  const skeletonData = useMemo(() => {
    const numCols = getRandomInt(3, 5)
    return Array.from({ length: numCols }).map((_, i) => ({
      id: i,
      numCards: getRandomInt(1, 4),
    }))
  }, [])

  return (
    <div className="grid h-full w-full auto-cols-[300px] grid-flow-col gap-4 p-4">
      {skeletonData.map((col) => (
        <Card key={col.id} className="flex flex-col rounded-md border-0">
          <CardHeader>
            <Skeleton className="h-6 w-3/4 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: col.numCards }).map((_, j) => (
              <Skeleton key={j} className="h-20 w-full rounded-md" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

type ColumnMutationContext = {
  previousColumns?: DeepReadonly<KanbanColumnRxDBDTO[]>
}

function useInsertColumnMutation(db: AppDatabase) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, KanbanColumnRxDBDTO, ColumnMutationContext>({
    mutationFn: async (newColumn) => {
      await db.kanbanColumns.insert(newColumn)
    },
    onMutate: async (newColumn) => {
      let previousColumns: DeepReadonly<KanbanColumnRxDBDTO[]> = []
      queryClient.setQueryData(
        ['kanbanColumns'],
        (prev: DeepReadonly<KanbanColumnRxDBDTO[]> | undefined) => {
          previousColumns = prev ?? []
          return [...previousColumns, newColumn]
        },
      )
      return { previousColumns }
    },
    onError: (err, _newColumn, ctx) => {
      toast.error('Falha ao adicionar nova coluna.')
      if (ctx?.previousColumns) {
        queryClient.setQueryData(['kanbanColumns'], ctx.previousColumns)
      }
    },
    onSuccess: () => {
      toast.success('Coluna adicionada com sucesso!')
    },
  })
}

function useDeleteColumnMutation(db: AppDatabase) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string, ColumnMutationContext>({
    mutationFn: async (columnId) => {
      const doc = await db.kanbanColumns.findOne(columnId).exec()
      if (!doc) return
      await doc.patch({
        _deleted: true,
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
    },
    onMutate: async (columnId) => {
      let previousColumns: DeepReadonly<KanbanColumnRxDBDTO[]> = []
      queryClient.setQueryData(
        ['kanbanColumns'],
        (prev: DeepReadonly<KanbanColumnRxDBDTO[]> | undefined) => {
          previousColumns = prev ?? []
          return previousColumns.filter((c) => c.id !== columnId)
        },
      )
      return { previousColumns }
    },
    onError: (_err, _columnId, ctx) => {
      toast.error('Falha ao remover coluna.')
      if (ctx?.previousColumns) {
        queryClient.setQueryData(['kanbanColumns'], ctx.previousColumns)
      }
    },
    onSuccess: () => {
      toast.success('Coluna removida!')
    },
  })
}

function useReorderColumnsMutation(db: AppDatabase) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updatedColumns: TColumn[]) => {
      const promises = updatedColumns.map(async (col, index) => {
        const doc = await db.kanbanColumns.findOne(col.id).exec()
        if (doc && doc.order !== index) {
          return doc.patch({
            order: index,
            updatedAt: new Date().toISOString(),
          })
        }
      })
      await Promise.all(promises)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanColumns'] })
      toast.success('Ordem das colunas sincronizada!')
    },
    onError: () => {
      toast.error('Falha ao sincronizar ordem das colunas.')
    },
  })
}

function useOptimizedBoard({
  kanbanColumns,
  kanbanRelations,
  tasks,
  metadata,
}: {
  kanbanColumns: DeepReadonly<KanbanColumnRxDBDTO[]>
  kanbanRelations: DeepReadonly<TaskKanbanColumnRxDBDTO[]>
  tasks: TaskWithTimeEntries[]
  metadata: DeepReadonly<SyncMetadataRxDBDTO> | null
}): TBoard {
  return useMemo(() => {
    const tasksMap = new Map<string, TaskWithTimeEntries>()
    tasks.forEach((t) => tasksMap.set(t.id, t))

    const relationsMap = new Map<
      string,
      DeepReadonly<TaskKanbanColumnRxDBDTO>
    >()
    kanbanRelations.forEach((r) => relationsMap.set(r.taskId, r))

    const columnTasksMap = new Map<string, TCard[]>()
    kanbanColumns.forEach((col) => columnTasksMap.set(col.id, []))

    kanbanRelations.forEach((rel) => {
      const task = tasksMap.get(rel.taskId)
      if (!task) return
      const list = columnTasksMap.get(rel.columnId)
      if (!list) return

      list.push({
        task: task as SyncTaskRxDBDTO,
        metadata: (metadata ?? {}) as SyncMetadataRxDBDTO,
      })
    })

    const columns: TColumn[] = kanbanColumns.map((col) => {
      const cards = columnTasksMap.get(col.id) ?? []
      cards.sort((a, b) => {
        const pa = relationsMap.get(a.task.id)?.position ?? 0
        const pb = relationsMap.get(b.task.id)?.position ?? 0
        return pa - pb
      })

      return {
        id: col.id,
        title: col.name,
        position: col.order,
        cards,
        isLoading: false,
      }
    })

    return { columns }
  }, [kanbanColumns, kanbanRelations, tasks, metadata])
}

function KanbanBoard({
  db,
  workspace,
}: {
  db: AppDatabase
  workspace: WorkspaceViewModel
}) {
  const queryClient = useQueryClient()
  const { mutate: addColumn } = useInsertColumnMutation(db)
  const deleteColumnMutation = useDeleteColumnMutation(db)
  const reorderColumnsMutation = useReorderColumnsMutation(db)

  // Estados para gerenciar o Modal de Automação por Coluna
  const [automationModalOpen, setAutomationModalOpen] = useState(false)
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)

  const handleOpenAutomations = useCallback((columnId: string) => {
    setSelectedColumnId(columnId)
    setAutomationModalOpen(true)
  }, [])

  const { data: kanbanColumns } = useSuspenseQuery({
    queryKey: ['kanbanColumns'],
    queryFn: async () => {
      const col = db.collections?.kanbanColumns ?? db.kanbanColumns
      if (!col || db.closed) return []
      const docs = await col
        .find({
          selector: { _deleted: { $ne: true }, isActive: { $eq: true } },
          sort: [{ order: 'asc' }],
        })
        .exec()
      return docs.map((d) => d.toJSON() as KanbanColumnRxDBDTO)
    },
  })

  const { data: kanbanRelations } = useSuspenseQuery({
    queryKey: ['kanbanRelations'],
    queryFn: async () => {
      const col = db.collections?.kanbanTaskColumns ?? db.kanbanTaskColumns
      if (!col || db.closed) return []
      const docs = await col
        .find({
          selector: { _deleted: { $ne: true }, inWorkspace: { $eq: true } },
        })
        .exec()
      return docs.map((d) => d.toJSON() as TaskKanbanColumnRxDBDTO)
    },
  })

  const { data: tasks } = useSuspenseQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<TaskWithTimeEntries[]> => {
      const tasksCol = db.collections?.tasks ?? db.tasks
      if (!tasksCol || db.closed) return []
      const taskDocs = await tasksCol.find().exec()
      const timeEntriesCol = db.collections?.timeEntries ?? db.timeEntries
      const tasksWithTimeEntries = await Promise.all(
        taskDocs.map(async (t: RxDocument<SyncTaskRxDBDTO>) => {
          const obj = t.toJSON()
          const timeDocs = timeEntriesCol
            ? await timeEntriesCol
                .find({
                  selector: {
                    _deleted: { $ne: true },
                    'task.id': { $eq: obj.id },
                  },
                })
                .exec()
            : []
          return {
            ...obj,
            timeEntries: timeDocs.map((d) => d.toJSON()),
          }
        }),
      )
      return JSON.parse(JSON.stringify(tasksWithTimeEntries))
    },
  })

  const { data: metadata } = useSuspenseQuery({
    queryKey: ['metadata'],
    queryFn: async () => {
      const metadataCol = db.collections?.metadata ?? db.metadata
      if (!metadataCol || db.closed) return null
      const doc = await metadataCol.findOne().exec()
      return doc ? (doc.toJSON() as SyncMetadataRxDBDTO) : null
    },
  })

  const [columnForDeletion, setColumnForDeletion] = useState<TColumn | null>(
    null,
  )
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [loadingColumnId, setLoadingColumnId] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)

  const handleAddColumn = useCallback(
    (name: string) => {
      const currentColumns =
        queryClient.getQueryData<DeepReadonly<KanbanColumnRxDBDTO[]>>([
          'kanbanColumns',
        ]) ?? []
      const maxOrder =
        currentColumns.length > 0
          ? currentColumns[currentColumns.length - 1].order
          : -1
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      addColumn({
        _id: id,
        _deleted: false,
        id,
        name,
        order: maxOrder + 1,
        workspaceId: workspace.id,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
    },
    [addColumn, workspace.id, queryClient],
  )

  const handleReorderColumns = useCallback(
    async (oldCols: TColumn[], newCols: TColumn[]) => {
      setIsReordering(true)
      try {
        await reorderColumnsMutation.mutateAsync(newCols)
      } finally {
        setIsReordering(false)
      }
    },
    [reorderColumnsMutation],
  )

  const confirmDeleteColumn = useCallback(async () => {
    if (!columnForDeletion) return
    try {
      setIsDeleting(true)
      setLoadingColumnId(columnForDeletion.id)
      await deleteColumnMutation.mutateAsync(columnForDeletion.id)
      setIsDeleteAlertOpen(false)
    } catch (err) {
      toast.error('Erro ao deletar coluna.')
    } finally {
      setIsDeleting(false)
      setLoadingColumnId(null)
    }
  }, [columnForDeletion, deleteColumnMutation])

  const board = useOptimizedBoard({
    kanbanColumns,
    kanbanRelations,
    tasks,
    metadata,
  })

  const boardWithActions: TBoard = useMemo(() => {
    return {
      onReorder: handleReorderColumns,
      columns: board.columns.map((col) => ({
        ...col,
        isLoading: col.id === loadingColumnId || isReordering,
        actions: [
          {
            title: 'Gerenciar Coluna',
            items: [
              {
                label: 'Renomear',
                icon: <PencilIcon className="h-3.5 w-3.5" />,
                onClick: () => {},
              },
              {
                label: 'Duplicar',
                icon: <CopyIcon className="h-3.5 w-3.5" />,
                onClick: () => {},
              },
              {
                label: 'Excluir Coluna',
                icon: <TrashIcon className="h-3.5 w-3.5" />,
                onClick: (column: TColumn) => {
                  setColumnForDeletion(column)
                  setIsDeleteAlertOpen(true)
                },
              },
            ],
          },
          {
            title: 'Cards',
            items: [
              {
                label: 'Novo Card',
                icon: <CopyPlusIcon className="h-3.5 w-3.5" />,
                onClick: () => {},
              },
              {
                label: 'Mover Todos os Cards',
                icon: <MoveRightIcon className="h-3.5 w-3.5" />,
                onClick: () => {},
              },
            ],
          },
          {
            title: 'Avançado',
            items: [
              {
                label: 'Automação',
                icon: <CableIcon className="h-3.5 w-3.5" />,
                onClick: (column: TColumn) => handleOpenAutomations(column.id),
              },
            ],
          },
        ],
        onChange: async (changedColumn: TColumn) => {
          const { id, title } = changedColumn
          if (title === col.title) return

          try {
            setLoadingColumnId(id)
            const doc = await db.kanbanColumns.findOne(id).exec()
            if (doc) {
              await doc.patch({
                name: title,
                updatedAt: new Date().toISOString(),
              })
            }
            await queryClient.invalidateQueries({ queryKey: ['kanbanColumns'] })
            toast.success('Nome da coluna atualizado!')
          } catch (err) {
            toast.error('Falha ao atualizar nome.')
          } finally {
            setLoadingColumnId(null)
          }
        },
      })),
    }
  }, [
    board,
    db,
    queryClient,
    loadingColumnId,
    isReordering,
    handleReorderColumns,
    handleOpenAutomations,
  ])

  return (
    <>
      {/* Modal de Automação injetado globalmente na página, mas controlado pelo clique na coluna */}
      <Suspense fallback={null}>
        {selectedColumnId && (
          <AutomationModal
            workspaceId={workspace.id}
            columnId={selectedColumnId}
            allColumns={kanbanColumns}
            open={automationModalOpen}
            onOpenChange={setAutomationModalOpen}
          />
        )}
      </Suspense>

      <Board
        board={boardWithActions}
        enableAddColumns
        onAddColumn={handleAddColumn}
      />

      <AlertDialog
        open={isDeleteAlertOpen}
        onOpenChange={(open) => !isDeleting && setIsDeleteAlertOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir coluna "{columnForDeletion?.title}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não poderá ser desfeita. Todos os cartões dentro desta
              coluna continuarão existindo, porém sem coluna atribuída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => !isDeleting && void confirmDeleteColumn()}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader /> : 'Excluir'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function KanbanBoardContent() {
  const db = useSyncStore((s) => s.db)
  const { workspace } = useWorkspace()
  if (!db || !workspace) return null
  return <KanbanBoard db={db} workspace={workspace} />
}

function KanbanToolbar() {
  return (
    <div className="mb-4 flex shrink-0 items-center gap-3">
      <Input
        type="search"
        placeholder="Buscar tarefas..."
        className="h-9 w-64"
      />
      <Button variant="outline" size="sm" className="h-9">
        <UserIcon className="mr-2 h-4 w-4" /> Pessoa
      </Button>
      <Button variant="outline" size="sm" className="h-9">
        <CalendarIcon className="mr-2 h-4 w-4" /> Data
      </Button>
      <Button variant="outline" size="sm" className="h-9">
        Filtro
      </Button>
      <div className="ml-4 flex items-center -space-x-2">
        <Avatar className="border-background h-8 w-8 border-2">
          <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
        <Avatar className="border-background h-8 w-8 border-2">
          <AvatarFallback>U2</AvatarFallback>
        </Avatar>
        <Avatar className="border-background h-8 w-8 border-2">
          <AvatarFallback>U3</AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}

export function Activities() {
  return (
    <>
      <KanbanToolbar />
      <Suspense fallback={<KanbanSkeleton />}>
        <div className="w-[calc(100vw-300px-72px-2rem)] cursor-grab overflow-auto rounded-md select-none active:cursor-grabbing">
          <KanbanBoardContent />
        </div>
      </Suspense>
    </>
  )
}
