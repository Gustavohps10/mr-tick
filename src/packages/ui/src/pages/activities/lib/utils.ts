// import {
//   ArrowDownIcon,
//   ArrowRightIcon,
//   ArrowUpIcon,
//   CheckCircle2,
//   CircleHelp,
//   CircleIcon,
//   CircleX,
//   Timer,
// } from 'lucide-react'

// import { SyncTaskRxDBDTO } from '@/db/schemas/tasks-sync-schema'

// export function getStatusIcon(status: SyncTaskRxDBDTO['status']) {
//   const statusIcons = {
//     canceled: CircleX,
//     done: CheckCircle2,
//     'in-progress': Timer,
//     todo: CircleHelp,
//   }

//   return statusIcons[status] || CircleIcon
// }

// export function getPriorityIcon(priority: SyncTaskRxDBDTO['priority']) {
//   const priorityIcons = {
//     high: ArrowUpIcon,
//     low: ArrowDownIcon,
//     medium: ArrowRightIcon,
//   }

//   return priorityIcons[priority?.id] || CircleIcon
// }
