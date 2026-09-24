'use client'

import { ColumnDef } from '@tanstack/react-table'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

export type Row = SyncTimeEntryRxDBDTO & {
  subRows?: SyncTimeEntryRxDBDTO[]
}

export const columns: ColumnDef<Row>[] = [
  {
    id: 'expand',
    header: '',
    size: 30,
    minSize: 30,
    maxSize: 30,
    cell: ({ row }) => {
      if (row.depth > 0) return null
      const count = row.original.subRows?.length ?? 0
      const hasSubRows = count > 1

      return (
        <div className="flex w-[30px] items-center">
          <button
            onClick={hasSubRows ? row.getToggleExpandedHandler() : undefined}
            className="w-[30px] transition-opacity"
            style={{
              cursor: hasSubRows ? 'pointer' : 'default',
              opacity: hasSubRows ? 1 : 0.3,
            }}
          >
            {hasSubRows ? (
              row.getIsExpanded() ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <div style={{ width: 14 }} />
            )}

            <Badge
              variant="outline"
              className="bg-muted/30 border-border/50 flex h-4 min-w-[18px] items-center px-1 font-mono text-[10px]"
            >
              {count || 1}
            </Badge>
          </button>
        </div>
      )
    },
  },
  {
    id: 'issue_id',
    accessorKey: 'task.id',
    header: () => (
      <div className="text-center text-[10px] font-bold uppercase opacity-70">
        Ticket
      </div>
    ),
    size: 90,
    minSize: 80,
    cell: ({ row }) => {
      const taskId = row.original.task?.id
      const taskSubject = row.original.taskData?.title
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="cursor-help font-mono text-[11px] font-bold"
            >
              #{taskId}
            </Badge>
          </TooltipTrigger>
          {taskSubject && (
            <TooltipContent side="right" className="max-w-[300px]">
              <p className="text-xs font-medium">{taskSubject}</p>
            </TooltipContent>
          )}
        </Tooltip>
      )
    },
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Criado em',
    size: 90,
    cell: ({ row }) => {
      const date = row.original.createdAt
      return (
        <span className="text-muted-foreground font-mono tracking-tight">
          <span className="text-[11px]">{format(parseISO(date), 'dd/MM')}</span>
          <span className="ml-[4px] text-[10px] opacity-80">
            {format(parseISO(date), 'HH:mm')}
          </span>
        </span>
      )
    },
  },
  {
    id: 'activity',
    accessorKey: 'activity.id',
    header: 'Atividade',
    size: 140,
    minSize: 100,
  },
  {
    id: 'comments',
    accessorKey: 'comments',
    header: 'Comentário',
    size: 200,
    minSize: 120,
  },
  {
    id: 'hours',
    accessorKey: 'timeSpent',
    header: 'Tempo',
    size: 160, // era 260
    minSize: 120,
  },
]
