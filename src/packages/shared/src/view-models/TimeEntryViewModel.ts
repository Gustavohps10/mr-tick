export interface TimeEntryViewModel {
  id?: string
  correlationId?: string
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
}
