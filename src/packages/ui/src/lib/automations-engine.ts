import { AutomationRxDBDTO } from '@/local-db/schemas/automations-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

function getTaskValue(task: any, path: string): string {
  return String(
    path.split('.').reduce((acc, part) => acc && acc[part], task) ?? '',
  ).toLowerCase()
}

export async function runAutomations(
  trigger: AutomationRxDBDTO['trigger'],
  task: SyncTaskRxDBDTO,
  currentColumnId: string, // Engine precisa saber em qual coluna a task está/entrou
  automations: AutomationRxDBDTO[],
  handlers: {
    createCard: (params: Record<string, string>) => Promise<void>
    moveToColumn: (taskId: string, columnId: string) => Promise<void>
    startTimer: (taskId: string, activityId: string) => Promise<void>
    stopTimer: (taskId: string) => Promise<void>
  },
) {
  // Filtra apenas automações desta coluna e deste trigger
  const activeAutos = automations.filter(
    (a) =>
      a.enabled &&
      a.columnId === currentColumnId &&
      a.trigger === trigger &&
      !a._deleted,
  )

  for (const auto of activeAutos) {
    const isMatch =
      auto.conditions.length === 0 ||
      auto.conditions.every((c) => {
        const val = getTaskValue(task, c.field)
        const target = c.value.toLowerCase()
        if (c.operator === 'equals') return val === target
        if (c.operator === 'notEquals') return val !== target
        if (c.operator === 'contains') return val.includes(target)
        return false
      })

    if (isMatch) {
      for (const action of auto.actions) {
        const { type, params } = action
        if (type === 'startTimer' && params.activityId)
          await handlers.startTimer(task.id, params.activityId)
        if (type === 'stopTimer') await handlers.stopTimer(task.id)
        if (type === 'moveToColumn' && params.columnId)
          await handlers.moveToColumn(task.id, params.columnId)
        if (type === 'createCard') await handlers.createCard(params)
      }
    }
  }
}
