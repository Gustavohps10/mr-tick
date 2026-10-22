'use client'

import { useQueryStates } from 'nuqs'
import { Suspense, useMemo } from 'react'

import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { Shell } from '@/components/shell'
import { useDataSourceConnections } from '@/hooks'
import { AppDatabase, useSyncStore } from '@/stores/syncStore'

import { TasksTable } from './components/tasks-table'
import {
  getAllPriorities,
  getAllstatus,
  getEstimatedHoursRange,
  getTaskPriorityCounts,
  getTasks,
  getTaskStatusCounts,
} from './lib/queries'
import { getValidFilters, tasksSearchParamsParsers } from './lib/validations'

interface ClientTasksTableWrapperProps {
  db: AppDatabase
  memberIds: string[]
}

function ClientTasksTableWrapper({
  db,
  memberIds,
}: ClientTasksTableWrapperProps) {
  const [search] = useQueryStates(tasksSearchParamsParsers)

  const validFilters = getValidFilters(search.filters)

  const promises = Promise.all([
    getTasks(db, memberIds, search),
    getTaskStatusCounts(db, memberIds),
    getTaskPriorityCounts(db, memberIds),
    getEstimatedHoursRange(db, memberIds),
    getAllstatus(db),
    getAllPriorities(db),
  ])

  return <TasksTable promises={promises} />
}

export function Backlog() {
  const db = useSyncStore((state) => state.db)

  const { dataSourceConnections: connections } = useDataSourceConnections()

  const memberIds = useMemo(() => {
    return Object.values(connections ?? {})
      .map((state) => state.member?.id)
      .filter(
        (id): id is string =>
          id !== null && id !== undefined && typeof id === 'string',
      )
      .map((id) => String(id))
  }, [connections])

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground mt-10">Carregando dados...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Shell>
        <Suspense
          fallback={
            <DataTableSkeleton
              columnCount={7}
              filterCount={2}
              cellWidths={[
                '10rem',
                '30rem',
                '10rem',
                '10rem',
                '6rem',
                '6rem',
                '6rem',
              ]}
              shrinkZero
            />
          }
        >
          <ClientTasksTableWrapper db={db} memberIds={memberIds} />
        </Suspense>
      </Shell>
    </div>
  )
}
