'use client'

import type { ColumnDef, Row } from '@tanstack/react-table'
import {
  ArrowUpDown,
  BookmarkX,
  BoxIcon,
  CalendarIcon,
  CircleDashed,
  Clock,
  Ellipsis,
  Text,
  User,
} from 'lucide-react'
import * as React from 'react'

import type { DataTableRowAction } from '@/@types/data-table'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/format'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

interface StatusOption {
  id: string
  name: string
}

interface PriorityOption {
  id: string
  name: string
}

interface GetTasksTableColumnsProps {
  allstatus: StatusOption[]
  allPriorities: PriorityOption[]
  statusCounts: Record<string, number>
  priorityCounts: Record<string, number>
  estimatedHoursRange: { min: number; max: number }
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<SyncTaskRxDBDTO> | null>
  >
}

export function getTasksTableColumns({
  allstatus,
  allPriorities,
  statusCounts,
  priorityCounts,
  estimatedHoursRange,
  setRowAction,
}: GetTasksTableColumnsProps): ColumnDef<SyncTaskRxDBDTO>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todos"
          className="translate-y-0.5"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Selecionar linha"
          className="translate-y-0.5"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'id',
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Tarefa" />
      ),
      cell: ({ row }) => <div className="w-20">{row.getValue('id')}</div>,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Título" />
      ),
      cell: ({ row }) => {
        const projectName = row.original.projectName
        return (
          <div className="flex items-center gap-2">
            {projectName && <Badge variant="outline">{projectName}</Badge>}
            <span className="max-w-125 truncate font-medium">
              {row.getValue('title')}
            </span>
          </div>
        )
      },
      meta: {
        label: 'Título',
        placeholder: 'Buscar títulos...',
        variant: 'text',
        icon: Text,
      },
      enableColumnFilter: true,
    },
    {
      id: 'status',
      accessorFn: (row) => row.status.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Status" />
      ),
      cell: ({ row }) => {
        const status = row.original.status
        if (!status) return null
        const Icon = BoxIcon
        return (
          <Badge variant="outline" className="py-1 [&>svg]:size-3.5">
            <Icon />
            <span className="capitalize">{status.name}</span>
          </Badge>
        )
      },
      meta: {
        label: 'Status',
        variant: 'multiSelect',
        options: allstatus.map((status) => ({
          label: status.name.charAt(0).toUpperCase() + status.name.slice(1),
          value: status.name,
          count: statusCounts[status.name] || 0,
          icon: BoxIcon,
        })),
        icon: CircleDashed,
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: 'priority',
      accessorFn: (row) => row.priority?.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Prioridade" />
      ),
      cell: ({ row }) => {
        const priority = row.original.priority
        if (!priority) return null
        const Icon = BookmarkX
        return (
          <Badge variant="outline" className="py-1 [&>svg]:size-3.5">
            <Icon />
            <span className="capitalize">{priority.name}</span>
          </Badge>
        )
      },
      meta: {
        label: 'Prioridade',
        variant: 'multiSelect',
        options: allPriorities.map((priority) => ({
          label: priority.name.charAt(0).toUpperCase() + priority.name.slice(1),
          value: priority.name,
          count: priorityCounts[priority.name] || 0,
          icon: BookmarkX,
        })),
        icon: ArrowUpDown,
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: 'assignedTo',
      accessorFn: (row) => row.assignedTo?.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Atribuído a" />
      ),
      cell: ({ cell }) => {
        const assignedTo = cell.getValue<string>()
        return (
          <div className="flex items-center gap-2">
            <User className="text-muted-foreground size-3.5" />
            <span className="truncate">{assignedTo || 'N/A'}</span>
          </div>
        )
      },
      meta: {
        label: 'Atribuído a',
        placeholder: 'Buscar por pessoa...',
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: 'estimatedHours',
      accessorFn: (row) =>
        row.estimatedTimes?.reduce((acc, curr) => acc + curr.hours, 0) || 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Horas estimadas" />
      ),
      cell: ({ cell }) => {
        const estimatedHours = cell.getValue<number>()
        return (
          <div className="w-20 text-right">{estimatedHours.toFixed(2)}</div>
        )
      },
      meta: {
        label: 'Horas estimadas',
        variant: 'range',
        range: [estimatedHoursRange.min, estimatedHoursRange.max],
        unit: 'h',
        icon: Clock,
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: 'spentHours',
      accessorKey: 'spentHours',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Horas gastas" />
      ),
      cell: ({ cell }) => {
        const spentHours = cell.getValue<number>() || 0
        return <div className="w-20 text-right">{spentHours.toFixed(2)}</div>
      },
      meta: {
        label: 'Horas gastas',
        variant: 'range',
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Criada em" />
      ),
      cell: ({ cell }) => formatDate(cell.getValue<string>()),
      meta: {
        label: 'Criada em',
        variant: 'dateRange',
        icon: CalendarIcon,
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: 'actions',
      cell: function Cell({ row }: { row: Row<SyncTaskRxDBDTO> }) {
        const [isUpdatePending, startUpdateTransition] = React.useTransition()
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Abrir menu"
                variant="ghost"
                className="data-[state=open]:bg-muted flex size-8 p-0"
              >
                <Ellipsis className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: 'update' })}
              >
                Editar
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Alterar status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={row.original.status.id}
                    onValueChange={(value) => {
                      const newStatus = allstatus.find((s) => s.id === value)
                      if (!newStatus) return
                      startUpdateTransition(() => {
                        // updateTask(...)
                      })
                    }}
                  >
                    {allstatus.map((status) => (
                      <DropdownMenuRadioItem
                        key={status.id}
                        value={status.id}
                        className="capitalize"
                        disabled={isUpdatePending}
                      >
                        {status.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: 'delete' })}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      size: 40,
    },
  ]
}
