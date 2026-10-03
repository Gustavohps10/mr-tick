export interface TimeEntryDTO {
  id?: string
  /**
   * Identidade imutável do apontamento na origem local (o UUID do rascunho).
   * Permite que o provider remoto reconheça um apontamento que ele mesmo já
   * criou (idempotência) e que o pull devolva o vínculo exato com o registro
   * local. Ausente em registros criados fora desta aplicação.
   */
  correlationId?: string
  /** Empty task.id represents an existing remote entry without a task; new remote creations require a selected task. */
  task: {
    id: string
  }
  activity: {
    id: string
    name?: string
  }
  user: {
    id: string
    name?: string
  }
  startDate?: Date
  endDate?: Date
  timeSpent: number
  comments?: string
  createdAt: Date
  updatedAt: Date
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
  addonSource?: { id: string; name: string; imageUrl?: string }
}
