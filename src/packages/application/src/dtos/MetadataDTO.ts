export interface MetadataDTO {
  taskStatuses: MetadataItem[]
  taskPriorities: MetadataItem[]
  activities: MetadataItem[]
  trackStatuses: MetadataItem[]
  participantRoles: MetadataItem[]
  estimationTypes: MetadataItem[]
}

export interface MetadataItem {
  id: string
  name: string
  icon: string
  colors: {
    badge: string
    background: string
    text: string
    border?: string
  }
}
