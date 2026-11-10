import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
} from '@mr-tick/application'
import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useRef } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface VirtualizedNodeTableProps {
  columns: AnalyticsColumnSchema[]
  rows: AnalyticsDatasetRow[]
}

export const VirtualizedNodeTable = memo(function VirtualizedNodeTable({
  columns,
  rows,
}: VirtualizedNodeTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  let paddingTop = 0
  let paddingBottom = 0

  if (virtualItems.length > 0) {
    const [firstItem] = virtualItems
    const lastItem = virtualItems[virtualItems.length - 1]

    if (firstItem) paddingTop = firstItem.start

    if (lastItem) paddingBottom = Math.max(0, totalSize - lastItem.end)
  }

  return (
    <div
      ref={parentRef}
      className="border-border/70 h-[360px] overflow-auto rounded-lg border"
    >
      <Table>
        <TableHeader className="bg-muted/85 sticky top-0 z-10 backdrop-blur-xs">
          <TableRow>
            <TableHead className="w-12 text-center font-mono text-[10px]">
              #
            </TableHead>
            {columns.map((col) => (
              <TableHead key={col.name} className="text-xs font-semibold">
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length + 1}
                style={{ height: `${paddingTop}px`, padding: 0 }}
              />
            </TableRow>
          )}
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null

            return (
              <TableRow key={virtualRow.key} className="h-9">
                <TableCell className="text-muted-foreground text-center font-mono text-[10px]">
                  {virtualRow.index + 1}
                </TableCell>
                {columns.map((col) => {
                  const rawVal = row[col.name]
                  let displayVal = '-'

                  if (typeof rawVal === 'boolean') {
                    displayVal = 'Não'
                    if (rawVal) displayVal = 'Sim'
                  }

                  if (typeof rawVal === 'number') {
                    displayVal = String(rawVal)

                    if (col.unit === 'hours')
                      displayVal = `${rawVal.toFixed(1)}h`

                    if (col.unit === 'percent') displayVal = `${rawVal}%`
                  }

                  if (typeof rawVal === 'string' && rawVal.length > 0)
                    displayVal = rawVal

                  return (
                    <TableCell
                      key={col.name}
                      className="max-w-[240px] truncate text-xs"
                    >
                      {displayVal}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
          {paddingBottom > 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length + 1}
                style={{ height: `${paddingBottom}px`, padding: 0 }}
              />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
})
