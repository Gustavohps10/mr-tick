'use client'

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { MangoQuerySelector } from 'rxdb'
import { toast } from 'sonner'

import { AutomationRxDBDTO } from '@/local-db/schemas/automations-schema'
import { TaskKanbanColumnRxDBDTO } from '@/local-db/schemas/kanban-task-columns-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

const OP_MAP: Record<string, string> = {
  equals: '$eq',
  notEquals: '$ne',
  contains: '$regex',
}

export function useAutomations(workspaceId: string) {
  const db = useSyncStore((state) => state.db)
  const queryClient = useQueryClient()
  const queryKey = ['automations', workspaceId]

  const { data: automations } = useSuspenseQuery({
    queryKey,
    queryFn: async (): Promise<AutomationRxDBDTO[]> => {
      if (!db || !workspaceId) return []
      const docs = await db.automations
        .find({
          selector: {
            workspaceId: { $eq: workspaceId },
            _deleted: { $ne: true },
          },
        })
        .exec()
      return docs.map((doc: any) => doc.toJSON())
    },
  })

  // --- HANDLERS DE AÇÕES ESPECÍFICAS ---

  const handleCreateCard = async (automation: AutomationRxDBDTO) => {
    if (!db) return 0

    const existingInThisColumn = await db.kanbanTaskColumns
      .find({
        selector: {
          columnId: { $eq: automation.columnId },
          _deleted: { $ne: true },
        },
      })
      .exec()

    const taskIdsAlreadyInCol = existingInThisColumn.map((r) => r.taskId)

    const selector: MangoQuerySelector<SyncTaskRxDBDTO> = {
      id: { $nin: taskIdsAlreadyInCol },
    }

    automation.conditions.forEach((cond) => {
      if (!cond.value) return
      const operator = OP_MAP[cond.operator] || '$eq'
      const filterValue =
        operator === '$regex'
          ? { $regex: cond.value, $options: 'i' }
          : { [operator]: cond.value }
      ;(selector as any)[cond.field] = filterValue
    })

    const tasksDocs = await db.tasks.find({ selector }).exec()
    if (tasksDocs.length > 0) {
      const newCards: TaskKanbanColumnRxDBDTO[] = tasksDocs.map(
        (doc, index) => ({
          _id: crypto.randomUUID(),
          _deleted: false,
          taskId: doc.toJSON().id,
          columnId: automation.columnId,
          inWorkspace: true,
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _attachments: {},
        }),
      )
      await db.kanbanTaskColumns.bulkInsert(newCards)
      return newCards.length
    }
    return 0
  }

  const handleTimerAction = async (
    type: 'startTimer' | 'stopTimer',
    params: Record<string, string>,
  ) => {
    // Exemplo de implementação futura:
    // console.log(`Executando ${type} com params:`, params)
    // Aqui você bateria na sua collection de 'timeEntries' ou similar
    return 1
  }

  // --- EXECUTOR PRINCIPAL ---

  const runAutomation = async (automation: AutomationRxDBDTO) => {
    if (!db || !automation.enabled) return

    let totalProcessed = 0

    for (const action of automation.actions) {
      switch (action.type) {
        case 'createCard':
          totalProcessed += await handleCreateCard(automation)
          break
        case 'startTimer':
        case 'stopTimer':
          totalProcessed += await handleTimerAction(action.type, action.params)
          break
        case 'moveToColumn':
          // Lógica de update em kanbanTaskColumns mudando o columnId
          break
      }
    }

    if (totalProcessed > 0) {
      await queryClient.invalidateQueries({ queryKey: ['kanbanRelations'] })
      toast.success(`Automação "${automation.name}" executada com sucesso.`)
    }
  }

  // --- MUTAÇÕES ---

  const createAutomation = useMutation({
    mutationFn: async (params: Partial<AutomationRxDBDTO>) => {
      if (!db || !workspaceId) return
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const payload: AutomationRxDBDTO = {
        _id: id,
        id,
        workspaceId,
        name: params.name ?? 'Nova Automação',
        trigger: params.trigger ?? 'onTaskCreated',
        conditions: params.conditions ?? [],
        columnId: params.columnId ?? '',
        actions: params.actions ?? [],
        enabled: params.enabled ?? true,
        _deleted: false,
        createdAt: now,
        updatedAt: now,
      }
      await db.automations.insert(payload)
      return payload
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const updateAutomation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<AutomationRxDBDTO>
    }) => {
      if (!db) return
      const doc = await db.automations.findOne(id).exec()
      if (doc)
        return await doc.patch({
          ...patch,
          updatedAt: new Date().toISOString(),
        })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteAutomation = useMutation({
    mutationFn: async (id: string) => {
      if (!db) return
      const doc = await db.automations.findOne(id).exec()
      if (doc)
        await doc.patch({ _deleted: true, updatedAt: new Date().toISOString() })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    automations,
    createAutomation: createAutomation.mutateAsync,
    updateAutomation: updateAutomation.mutateAsync,
    deleteAutomation: deleteAutomation.mutateAsync,
    runAutomation,
  }
}
