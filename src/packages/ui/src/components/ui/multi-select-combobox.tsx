'use client'

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface MultiSelectComboboxOption {
  value: string
  label: string
}

export interface MultiSelectComboboxProps {
  options: MultiSelectComboboxOption[]
  selectedValues: string[]
  onSelectedValuesChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  allowCustomValues?: boolean
  maxBadges?: number
  disabled?: boolean
  className?: string
  triggerClassName?: string
}

export function MultiSelectCombobox({
  options,
  selectedValues,
  onSelectedValuesChange,
  placeholder = 'Todos os registros (sem filtro)',
  searchPlaceholder = 'Buscar opções...',
  emptyText = 'Nenhuma opção encontrada.',
  allowCustomValues = true,
  maxBadges = 2,
  disabled = false,
  className,
  triggerClassName,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState('')

  const trimmedSearch = searchValue.trim()

  const optionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const opt of options) {
      map.set(opt.value, opt.label)
    }
    return map
  }, [options])

  const resolveOptionLabel = React.useCallback(
    (val: string): string => {
      const found = optionMap.get(val)
      if (found) return found

      return val
    },
    [optionMap],
  )

  const filteredOptions = React.useMemo(() => {
    if (!trimmedSearch) return options

    const query = trimmedSearch.toLowerCase()
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(query)
      const matchValue = opt.value.toLowerCase().includes(query)
      return matchLabel || matchValue
    })
  }, [options, trimmedSearch])

  const isExactMatch = React.useMemo(() => {
    if (!trimmedSearch) return true

    const query = trimmedSearch.toLowerCase()
    const inOptions = options.some(
      (opt) =>
        opt.value.toLowerCase() === query || opt.label.toLowerCase() === query,
    )
    if (inOptions) return true

    return selectedValues.includes(trimmedSearch)
  }, [options, selectedValues, trimmedSearch])

  const customSelectedValues = React.useMemo(() => {
    return selectedValues.filter((val) => !optionMap.has(val))
  }, [selectedValues, optionMap])

  const handleToggleValue = (valToToggle: string) => {
    if (selectedValues.includes(valToToggle)) {
      onSelectedValuesChange(selectedValues.filter((v) => v !== valToToggle))
      return
    }

    onSelectedValuesChange([...selectedValues, valToToggle])
  }

  const handleRemoveSingleValue = (
    event: React.SyntheticEvent | undefined,
    valToRemove: string,
  ) => {
    event?.stopPropagation()
    onSelectedValuesChange(selectedValues.filter((v) => v !== valToRemove))
  }

  const handleClearAll = (event?: React.SyntheticEvent) => {
    event?.stopPropagation()
    onSelectedValuesChange([])
  }

  const handleSelectAll = (event: React.SyntheticEvent) => {
    event.stopPropagation()
    const allOptionValues = options.map((opt) => opt.value)
    const merged = Array.from(new Set([...selectedValues, ...allOptionValues]))
    onSelectedValuesChange(merged)
  }

  const handleAddCustomValue = () => {
    if (!trimmedSearch) return

    if (selectedValues.includes(trimmedSearch)) {
      setSearchValue('')
      return
    }

    onSelectedValuesChange([...selectedValues, trimmedSearch])
    setSearchValue('')
  }

  const visibleBadges = selectedValues.slice(0, maxBadges)
  const remainingCount = selectedValues.length - maxBadges

  return (
    <div className={cn('relative w-full', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'border-border/60 bg-background/50 hover:bg-muted/40 h-auto min-h-[36px] w-full justify-between gap-2 px-3 py-1.5 text-left text-xs font-normal',
              triggerClassName,
            )}
          >
            <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
              {selectedValues.length === 0 && (
                <span className="text-muted-foreground italic">
                  {placeholder}
                </span>
              )}

              {visibleBadges.map((val) => (
                <Badge
                  key={val}
                  variant="secondary"
                  className="gap-1 px-1.5 py-0.5 text-[11px] font-normal"
                >
                  <span className="max-w-[140px] truncate">
                    {resolveOptionLabel(val)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleRemoveSingleValue(e, val)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleRemoveSingleValue(e, val)
                      }
                    }}
                    className="hover:text-destructive text-muted-foreground ml-0.5 inline-flex cursor-pointer items-center justify-center"
                    aria-label={`Remover ${resolveOptionLabel(val)}`}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))}

              {remainingCount > 0 && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0.5 font-mono text-[10px]"
                >
                  +{remainingCount} mais
                </Badge>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {selectedValues.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClearAll}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleClearAll()
                    }
                  }}
                  className="hover:text-destructive text-muted-foreground inline-flex cursor-pointer items-center justify-center p-0.5"
                  aria-label="Limpar todas as seleções"
                >
                  <X className="size-3.5" />
                </span>
              )}

              <ChevronsUpDown className="text-muted-foreground size-3.5 opacity-60" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="border-border/80 bg-popover z-[60] w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 shadow-lg"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchValue}
              onValueChange={setSearchValue}
              className="text-xs"
            />

            <div className="border-border/50 bg-muted/20 flex items-center justify-between border-b px-2.5 py-1.5 text-[11px]">
              <span className="text-muted-foreground font-mono">
                {selectedValues.length} selecionado
                {selectedValues.length === 1 ? '' : 's'}
              </span>

              <div className="flex items-center gap-2">
                {options.length > 0 &&
                  selectedValues.length < options.length && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-primary text-[11px] font-medium hover:underline"
                    >
                      Selecionar todos
                    </button>
                  )}

                {selectedValues.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-destructive text-[11px] font-medium hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <CommandList className="max-h-[240px] overflow-y-auto">
              {filteredOptions.length === 0 &&
                (!allowCustomValues || !trimmedSearch) && (
                  <CommandEmpty className="text-muted-foreground py-4 text-center text-xs">
                    {emptyText}
                  </CommandEmpty>
                )}

              {allowCustomValues && !isExactMatch && trimmedSearch && (
                <CommandGroup heading="Personalizado">
                  <CommandItem
                    value={trimmedSearch}
                    onSelect={handleAddCustomValue}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleAddCustomValue}
                    className="text-primary flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs font-medium"
                  >
                    <Plus className="size-3.5" />
                    <span>Adicionar &quot;{trimmedSearch}&quot;</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {customSelectedValues.length > 0 && (
                <CommandGroup heading="Selecionados manuais">
                  {customSelectedValues.map((val) => (
                    <CommandItem
                      key={val}
                      value={val}
                      onSelect={() => handleToggleValue(val)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleToggleValue(val)}
                      className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs"
                    >
                      <Checkbox
                        checked={true}
                        className="pointer-events-none"
                      />
                      <span className="flex-1 font-mono text-xs">{val}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveSingleValue(e, val)}
                        className="hover:text-destructive text-muted-foreground p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredOptions.length > 0 && (
                <CommandGroup heading="Opções disponíveis">
                  {filteredOptions.map((opt) => {
                    const isSelected = selectedValues.includes(opt.value)

                    return (
                      <CommandItem
                        key={opt.value}
                        value={`${opt.label} ${opt.value}`}
                        onSelect={() => handleToggleValue(opt.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => handleToggleValue(opt.value)}
                        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs"
                      >
                        <Checkbox
                          checked={isSelected}
                          className="pointer-events-none"
                        />
                        <span className="flex-1 truncate">{opt.label}</span>
                        {opt.value !== opt.label && (
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {opt.value}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="text-primary size-3.5" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
