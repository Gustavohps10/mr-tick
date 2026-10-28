'use client'

import type { Table } from '@tanstack/react-table'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { exportTableToCSV } from '@/lib/export'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

interface TasksTableToolbarActionsProps {
  table: Table<SyncTaskRxDBDTO>
}

export function TasksTableToolbarActions({
  table,
}: TasksTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        // <DeleteTasksDialog
        //   tasks={table
        //     .getFilteredSelectedRowModel()
        //     .rows.map((row) => row.original)}
        //   onSuccess={() => table.toggleAllRowsSelected(false)}
        // />
        <></>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          exportTableToCSV(table, {
            filename: 'tasks',
            excludeColumns: ['select', 'actions'],
          })
        }
      >
        <Download />
        Export
      </Button>
      {/**
       * Other actions can be added here.
       * For example, import, view, etc.
       */}
    </div>
  )
}
