export interface TaskDTO {
  id: string
  title: string
  description?: string
  url?: string
  projectName?: string
  status: {
    id: string
    name: string
  }
  priority?: {
    id: string
    name: string
  }
  assignedTo?: {
    id?: string
    name: string
  }
  author?: {
    id?: string
    name: string
  }
  tracker?: {
    id: string
    name?: string
  }
  createdAt: Date
  updatedAt: Date
  startDate?: Date
  dueDate?: Date
  doneRatio?: number
  estimatedTimes?: EstimatedTime[]
  spentHours?: number
  statusChanges?: StatusChangeDTO[]
  participants?: Participants[]
}

export interface Participants {
  id: string
  name: string
  role: {
    id: string
  }
}

export interface EstimatedTime {
  id: string
  name: string
  activities: {
    id: string
    name: string
  }[]
  hours: number
}

export interface StatusChangeDTO {
  fromStatus: string
  toStatus: string
  description?: string
  changedBy: {
    id: string
    name: string
  }
  changedAt: Date
}
