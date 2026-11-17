import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { DrillDownSelection } from '../lib/analytics-types'

export interface DrillDownDialogProps {
  drillDown: DrillDownSelection | null
  onClose: () => void
}

export function DrillDownDialog({ drillDown, onClose }: DrillDownDialogProps) {
  return (
    <Dialog
      open={drillDown !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-4xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-8">
          <DialogTitle>{drillDown?.title}</DialogTitle>
          <DialogDescription>
            {drillDown?.subtitle} · {drillDown?.data.totalRows} registros;
            prévia limitada a 100 linhas.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                {drillDown?.data.columns.map((column) => (
                  <TableHead key={column.name}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {drillDown?.data.rows.map((row, index) => (
                <TableRow key={index}>
                  {drillDown.data.columns.map((column) => (
                    <TableCell key={column.name}>
                      {String(row[column.name])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter className="bg-muted/20 shrink-0 border-t px-6 py-3">
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
