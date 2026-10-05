'use client'

import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  OnChangeFn,
  useReactTable,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  expanded?: ExpandedState
  onExpandedChange?: OnChangeFn<ExpandedState>
  getRowClassName?: (row: TData, depth: number) => string
  onRowDoubleClick?: (row: TData) => void
  compact?: boolean
}

export function DataTable<TData extends { subRows?: TData[]; id: string }>({
  columns,
  data,
  expanded = {},
  onExpandedChange,
  getRowClassName,
  onRowDoubleClick,
  compact = false,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
    },
    onExpandedChange,
    autoResetExpanded: false,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowId: (row) => row.id,
  })

  return (
    <div
      className={cn(
        'bg-background w-full rounded-md border shadow-sm',
        compact ? 'overflow-x-hidden' : 'overflow-x-auto',
      )}
    >
      <Table
        className={cn(
          'w-full table-fixed',
          compact ? 'w-full' : 'min-w-[820px]',
        )}
      >
        <TableHeader className="bg-muted/30">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const isHiddenOnCompact = compact && header.id === 'createdAt'

                return (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={cn(
                      'text-muted-foreground font-bold tracking-wider uppercase',
                      compact
                        ? 'px-1.5 py-1 text-[10px]'
                        : 'px-2 py-3 text-[10px]',
                      isHiddenOnCompact && 'hidden',
                      !compact &&
                        header.id === 'createdAt' &&
                        'hidden md:table-cell',
                      !compact &&
                        header.id === 'syncStatus' &&
                        'hidden sm:table-cell',
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-testid="time-entry-row"
                data-state={row.getIsExpanded() ? 'expanded' : 'collapsed'}
                onDoubleClick={() => {
                  const isGroupMaster =
                    (row.original.subRows?.length ?? 0) > 1 &&
                    !row.getParentRow()
                  if (!isGroupMaster) {
                    onRowDoubleClick?.(row.original)
                  }
                }}
                className={cn(
                  'group transition-colors select-none',
                  row.getIsExpanded() && 'bg-muted/10',
                  row.depth > 0 && 'italic',
                  getRowClassName?.(row.original, row.depth),
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const isHiddenOnCompact =
                    compact && cell.column.id === 'createdAt'

                  return (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={cn(
                        'border-border/40 border-b',
                        compact ? 'py-1 text-[11px]' : 'py-2 text-sm',
                        cell.column.id === 'actions' ? 'px-0 pr-1' : 'px-1.5',
                        cell.column.id === 'syncStatus' && compact && 'px-0.5',
                        isHiddenOnCompact && 'hidden',
                        !compact &&
                          cell.column.id === 'createdAt' &&
                          'hidden md:table-cell',
                        !compact &&
                          cell.column.id === 'syncStatus' &&
                          'hidden sm:table-cell',
                        cell.column.id === 'comments' &&
                          'min-w-0 overflow-hidden',
                        cell.column.id === 'hours' &&
                          'shrink-0 whitespace-nowrap',
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center text-sm"
              >
                Nenhum registro para exibir.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
