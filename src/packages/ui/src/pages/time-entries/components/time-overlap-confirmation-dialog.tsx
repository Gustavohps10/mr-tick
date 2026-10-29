import type { ConflictingTimeEntry, TimeInterval } from '@mr-tick/application'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface TimeOverlapConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: readonly ConflictingTimeEntry[]
  conflictToken: string
  targetInterval?: TimeInterval
  onConfirm: (conflictToken: string) => void
  onCancel: () => void
  isSubmitting?: boolean
}

function resolveStatusVariant(
  status: ConflictingTimeEntry['timeStatus'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'running') return 'default'
  if (status === 'paused') return 'secondary'
  return 'outline'
}

function resolveStatusLabel(
  status: ConflictingTimeEntry['timeStatus'],
): string {
  if (status === 'running') return 'Timer Ativo'
  if (status === 'paused') return 'Pausado'
  return 'Finalizado'
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return isoString
  const datePart = d.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${datePart} ${timePart}`
}

function formatInterval(start: string, end: string): string {
  return `${formatDateTime(start)} - ${formatDateTime(end)}`
}

export function TimeOverlapConfirmationDialog({
  open,
  onOpenChange,
  conflicts,
  conflictToken,
  targetInterval,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: TimeOverlapConfirmationDialogProps) {
  const hasValidToken =
    typeof conflictToken === 'string' && conflictToken.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="time-overlap-confirmation-dialog"
        className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b p-5 pb-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="size-5 shrink-0" />
            <DialogTitle className="text-foreground text-base font-bold">
              Sobreposição de Horários Detectada
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground mt-1 text-xs">
            Esta sugestão coincide com o período de outro(s) registro(s) de
            tempo no workspace. Revise os intervalos abaixo antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 py-3">
          {targetInterval && (
            <div
              data-testid="time-overlap-target-interval"
              className="border-primary/30 bg-primary/5 rounded-md p-3 text-xs"
            >
              <span className="text-primary mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Intervalo Alvo da Sugestão:
              </span>
              <div className="text-foreground flex items-center gap-1.5 font-mono font-medium">
                <Clock className="text-primary size-3.5 shrink-0" />
                <span>
                  {formatInterval(targetInterval.start, targetInterval.end)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-muted-foreground block text-xs font-semibold">
              Registros conflitantes ({conflicts.length}):
            </span>

            <div className="bg-muted/10 space-y-2 rounded-md border p-2">
              {conflicts.map((c) => {
                let entryTitle = `Registro #${c.id.slice(0, 8)}`
                if (c.title && c.title.length > 0) {
                  entryTitle = c.title
                }
                const hasEffectiveIntervals =
                  c.effectiveIntervals !== undefined &&
                  c.effectiveIntervals.length > 0
                let fallbackEndDate = c.startDate
                if (c.endDate) {
                  fallbackEndDate = c.endDate
                }

                return (
                  <div
                    key={c.id}
                    data-testid={`time-overlap-conflict-item-${c.id}`}
                    className="border-border/60 bg-background flex flex-col gap-1.5 rounded-md border p-3 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate text-xs font-semibold">
                        {entryTitle}
                      </span>
                      <Badge
                        variant={resolveStatusVariant(c.timeStatus)}
                        className="shrink-0 px-1.5 py-0 text-[9px]"
                      >
                        {resolveStatusLabel(c.timeStatus)}
                      </Badge>
                    </div>

                    <div className="text-muted-foreground flex flex-col gap-1 font-mono text-[11px]">
                      {hasEffectiveIntervals &&
                        c.effectiveIntervals.map((interval, idx) => (
                          <div
                            key={idx}
                            data-testid={`conflict-interval-${c.id}-${idx}`}
                            className="flex items-center gap-1.5"
                          >
                            <Clock className="size-3 shrink-0 text-amber-500" />
                            <span>
                              {formatInterval(interval.start, interval.end)}
                            </span>
                          </div>
                        ))}
                      {!hasEffectiveIntervals && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3 shrink-0 text-amber-500" />
                          <span>
                            {formatInterval(c.startDate, fallbackEndDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t p-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => {
              onCancel()
              onOpenChange(false)
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={isSubmitting || !hasValidToken}
            data-testid="time-overlap-confirm-btn"
            onClick={() => {
              if (hasValidToken) {
                onConfirm(conflictToken)
                onOpenChange(false)
              }
            }}
          >
            {isSubmitting && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            )}
            Confirmar Mesmo Assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
