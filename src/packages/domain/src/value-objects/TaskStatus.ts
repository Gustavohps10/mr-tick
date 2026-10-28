export enum TaskStatus {
  NEW = 'NEW',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  IN_TEST = 'IN_TEST',
  REJECTED_TEST = 'REJECTED_TEST',
  DONE = 'DONE',
  VALIDATED = 'VALIDATED',
}

export type TaskStatusType = keyof typeof TaskStatus
