import { format, isValid, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDaysIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const storedDateFormat = 'yyyy-MM-dd'

export interface AddonDateFieldProps {
  fieldId: string
  value: string | undefined
  disabled: boolean
  placeholder: string | undefined
  onChange: (value: string) => void
}

function parseStoredDate(value: string | undefined): Date | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = parse(value, storedDateFormat, new Date())
  if (!isValid(parsed)) return undefined
  return parsed
}

export function AddonDateField({
  fieldId,
  value,
  disabled,
  placeholder,
  onChange,
}: AddonDateFieldProps) {
  const selected = parseStoredDate(value)
  let label = placeholder
  if (label === undefined) label = 'Escolha uma data'
  if (selected !== undefined)
    label = format(selected, 'dd/MM/yyyy', { locale: ptBR })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          data-testid={`addon-field-date-${fieldId}`}
          className={cn(
            'w-full justify-start text-left font-normal',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          <CalendarDaysIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date === undefined) return
            onChange(format(date, storedDateFormat))
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
