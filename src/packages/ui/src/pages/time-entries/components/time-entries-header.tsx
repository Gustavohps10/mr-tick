import { DateRange } from 'react-day-picker'

import { DatePickerWithRange } from '@/components'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TimeEntriesSyncIndicator } from '@/pages/time-entries/components/time-entries-sync-indicator'

interface TimeEntriesHeaderProps {
  range: { from: Date; to: Date }
  onRangeChange: (range: DateRange | undefined) => void
  isSyncing?: boolean
  isPulling?: boolean
  isPushing?: boolean
  syncResult?: 'success' | 'error' | null
  syncErrorMessage?: string | null
  isGrouped?: boolean
  onToggleGrouped?: (grouped: boolean) => void
}

export function TimeEntriesHeader({
  range,
  onRangeChange,
  isSyncing = false,
  isPulling = false,
  isPushing = false,
  syncResult = null,
  syncErrorMessage = null,
  isGrouped = true,
  onToggleGrouped,
}: TimeEntriesHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
      {onToggleGrouped && (
        <div className="border-border/60 bg-background/50 flex h-8 items-center gap-2 rounded-md border px-2.5 shadow-2xs">
          <Switch
            id="group-by-task-switch"
            checked={isGrouped}
            onCheckedChange={onToggleGrouped}
            className="scale-75"
          />
          <Label
            htmlFor="group-by-task-switch"
            className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium select-none"
          >
            Agrupar por tarefa
          </Label>
        </div>
      )}

      <TimeEntriesSyncIndicator
        isSyncing={isSyncing}
        isPulling={isPulling}
        isPushing={isPushing}
        syncResult={syncResult}
        syncErrorMessage={syncErrorMessage}
      />

      <DatePickerWithRange
        date={{ from: range.from, to: range.to }}
        setDate={onRangeChange}
      />
    </div>
  )
}
