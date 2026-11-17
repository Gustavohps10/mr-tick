import type { Table } from '@tanstack/react-table'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface PaginationBarProps extends React.ComponentProps<'div'> {
  pageIndex: number
  pageCount: number
  pageSize: number
  pageSizeOptions?: number[]
  canPreviousPage: boolean
  canNextPage: boolean
  disabled?: boolean
  summary?: React.ReactNode
  onPageIndexChange: (pageIndex: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

export function PaginationBar({
  pageIndex,
  pageCount,
  pageSize,
  pageSizeOptions = [10, 20, 30, 40, 50],
  canPreviousPage,
  canNextPage,
  disabled = false,
  summary,
  onPageIndexChange,
  onPageSizeChange,
  className,
  ...props
}: PaginationBarProps) {
  const disablePrevious = disabled || !canPreviousPage
  const disableNext = disabled || !canNextPage
  const lastPageIndex = Math.max(0, pageCount - 1)

  return (
    <div
      className={cn(
        'flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8',
        className,
      )}
      {...props}
    >
      <div className="text-muted-foreground min-w-0 flex-1 text-sm">
        {summary}
      </div>

      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        {onPageSizeChange !== undefined && (
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium whitespace-nowrap">
              Linhas por página
            </p>
            <Select
              disabled={disabled}
              value={`${pageSize}`}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-18 data-[size]:h-8">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((optionSize) => (
                  <SelectItem key={optionSize} value={`${optionSize}`}>
                    {optionSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-center text-sm font-medium whitespace-nowrap">
          Página {pageIndex + 1} de {pageCount}
        </div>

        <div className="flex items-center space-x-2">
          <Button
            type="button"
            aria-label="Ir para a primeira página"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => onPageIndexChange(0)}
            disabled={disablePrevious}
          >
            <ChevronsLeft />
          </Button>

          <Button
            type="button"
            aria-label="Ir para a página anterior"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageIndexChange(Math.max(0, pageIndex - 1))}
            disabled={disablePrevious}
          >
            <ChevronLeft />
          </Button>

          <Button
            type="button"
            aria-label="Ir para a próxima página"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onPageIndexChange(pageIndex + 1)}
            disabled={disableNext}
          >
            <ChevronRight />
          </Button>

          <Button
            type="button"
            aria-label="Ir para a última página"
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => onPageIndexChange(lastPageIndex)}
            disabled={disableNext}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface DataTablePaginationProps<TData> extends React.ComponentProps<'div'> {
  table: Table<TData>
  pageSizeOptions?: number[]
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
  className,
  ...props
}: DataTablePaginationProps<TData>) {
  return (
    <PaginationBar
      pageIndex={table.getState().pagination.pageIndex}
      pageCount={table.getPageCount()}
      pageSize={table.getState().pagination.pageSize}
      pageSizeOptions={pageSizeOptions}
      canPreviousPage={table.getCanPreviousPage()}
      canNextPage={table.getCanNextPage()}
      onPageIndexChange={(nextIndex) => table.setPageIndex(nextIndex)}
      onPageSizeChange={(nextSize) => table.setPageSize(nextSize)}
      summary={`${table.getFilteredSelectedRowModel().rows.length} de ${table.getFilteredRowModel().rows.length} linha(s) selecionada(s)`}
      className={className}
      {...props}
    />
  )
}
