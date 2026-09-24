export interface TimeEntriesFilterDTO {
  date?: Date
  taskId?: string
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
}
