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
import {
  TimeEntries,
  TimeEntriesCalendarView,
  TimeEntriesTimesheetView,
} from '@/pages/time-entries'

export interface TimerOverviewProps {
  isMini?: boolean
  isVertical?: boolean
}

type OverviewViewMode = 'list' | 'weekly' | 'monthly'

function renderOverviewContent(view: OverviewViewMode) {
  switch (view) {
    case 'weekly':
      return <TimeEntriesTimesheetView compact className="gap-2 p-0" />
    case 'monthly':
      return <TimeEntriesCalendarView compact className="gap-2 p-0" />
    case 'list':
    default:
      return <TimeEntries compact className="gap-2 p-0" />
  }
}

export const TimerOverview = memo(function TimerOverview({
  isMini,
  isVertical: propIsVertical,
}: TimerOverviewProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<OverviewViewMode>('list')
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
        className="border-border/80 bg-card text-card-foreground flex h-[550px] max-h-[85vh] w-[95vw] max-w-[780px] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-2xl sm:w-[780px]"
      >
        <div className="border-border/60 bg-muted/20 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 select-none">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6.5 items-center justify-center rounded-md">
              <CalendarDays className="size-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-foreground text-xs leading-none font-bold">
                Apontamentos de Horas
              </span>
              <span className="text-muted-foreground hidden text-[10px] leading-none sm:inline">
                Lista, semanal e mensal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="border-border/60 bg-muted/40 flex items-center rounded-md border p-0.5">
              <button
                type="button"
                data-testid="overview-tab-list"
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  view === 'list'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <ListTodo className="size-3" />
                <span>Lista</span>
              </button>

              <button
                type="button"
                data-testid="overview-tab-weekly"
                onClick={() => setView('weekly')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  view === 'weekly'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <CalendarRange className="size-3" />
                <span>Semanal</span>
              </button>

              <button
                type="button"
                data-testid="overview-tab-monthly"
                onClick={() => setView('monthly')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  view === 'monthly'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <CalendarDays className="size-3" />
                <span>Mensal</span>
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-6.5 rounded-md"
              onClick={() => setOpen(false)}
              title="Fechar"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3.5">
          {renderOverviewContent(view)}
        </div>
      </PopoverContent>
    </Popover>
  )
})
