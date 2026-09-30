'use client'

import { CalendarDays, CalendarRange, ListTodo, X } from 'lucide-react'
import React, { memo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTimerSettings } from '@/hooks/use-timer-settings'
import { cn } from '@/lib/utils'
import { TimeEntriesTimesheetView } from '@/pages/time-entries/components/timesheet-view/time-entries-timesheet-view'
import { TimeEntries } from '@/pages/time-entries/time-entries-page'

export interface TimerOverviewProps {
  isMini?: boolean
  isVertical?: boolean
}

export const TimerOverview = memo(function TimerOverview({
  isMini,
  isVertical: propIsVertical,
}: TimerOverviewProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'timesheet'>('list')
  const { widgetPosition } = useTimerSettings()

  const isVertical =
    propIsVertical ?? (widgetPosition === 'left' || widgetPosition === 'right')
  const isBottom = widgetPosition === 'bottom'
  const isRight = widgetPosition === 'right'

  let side: 'top' | 'bottom' | 'left' | 'right' = 'bottom'
  if (isVertical) {
    side = isRight ? 'left' : 'right'
  }
  if (!isVertical) {
    side = isBottom ? 'top' : 'bottom'
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="timerbar-overview-button"
          title="Apontamentos e Visão de Tempo"
          className={cn(
            'text-muted-foreground hover:text-foreground transition-colors',
            isMini ? 'h-6 w-6 rounded-md' : 'h-7 w-7 rounded-md',
          )}
        >
          <CalendarDays className={cn(isMini ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        side={side}
        sideOffset={8}
        className="border-border/80 bg-card text-card-foreground flex max-h-[82vh] w-[94vw] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-2xl"
      >
        <div className="border-border/60 bg-muted/20 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 select-none">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
              <CalendarDays className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-foreground text-sm leading-tight font-semibold">
                Apontamentos de Horas
              </span>
              <span className="text-muted-foreground hidden text-xs sm:inline">
                Visão em lista diária e matriz semanal consolidada
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="border-border/60 bg-muted/40 flex items-center rounded-lg border p-0.5">
              <button
                type="button"
                data-testid="overview-tab-list"
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'list'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <ListTodo className="size-3.5" />
                <span>Lista</span>
              </button>

              <button
                type="button"
                data-testid="overview-tab-timesheet"
                onClick={() => setView('timesheet')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'timesheet'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <CalendarRange className="size-3.5" />
                <span>Timesheet</span>
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-8 rounded-md"
              onClick={() => setOpen(false)}
              title="Fechar"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
          {view === 'list' ? (
            <TimeEntries className="gap-4 px-1 py-1 sm:px-2" />
          ) : (
            <TimeEntriesTimesheetView className="gap-4 px-1 py-1 sm:px-2" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
