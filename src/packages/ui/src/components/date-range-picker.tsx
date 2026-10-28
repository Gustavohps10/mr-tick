'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDaysIcon } from 'lucide-react'
import * as React from 'react'
import { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
  className,
  date,
  setDate,
}: DatePickerWithRangeProps) {
  function formatDateDisplay(date: Date) {
    const weekday = format(date, 'EEE', { locale: ptBR })
    const day = format(date, 'dd/MM/yyyy', { locale: ptBR })
    return (
      <span className="flex items-center gap-1">
        <span className="text-muted-foreground italic">
          {weekday.replace('.', '').slice(0, 3)}.
        </span>
        <span className="font-mono">{day}</span>
      </span>
    )
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              'w-fit justify-start text-left font-sans tracking-tighter',
              !date && 'text-muted-foreground',
            )}
          >
            <CalendarDaysIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <div className="flex items-center gap-1">
                  {formatDateDisplay(date.from)}
                  <span>-</span>
                  {formatDateDisplay(date.to)}
                </div>
              ) : (
                formatDateDisplay(date.from)
              )
            ) : (
              <span>Escolha um período</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            autoFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
