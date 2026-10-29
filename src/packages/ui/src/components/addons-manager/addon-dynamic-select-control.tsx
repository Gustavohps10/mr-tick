import type {
  AddonFieldAddress,
  AddonResolveOptionsResponse,
  AddonSettingsMultiSelectField,
  AddonSettingsOption,
  AddonSettingsSelectField,
  AddonSettingsValues,
  AddonVaultScope,
} from '@mr-tick/application'
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

import {
  extractResolvedDependencies,
  serializeFieldAddress,
} from './address-helpers'

export interface AddonDynamicSelectControlProps {
  field: AddonSettingsSelectField | AddonSettingsMultiSelectField
  addonId: string
  scope: AddonVaultScope
  fieldAddress: AddonFieldAddress
  value:
    string | number | boolean | readonly (string | number)[] | null | undefined
  onChange: (
    value: string | number | boolean | readonly (string | number)[] | null,
  ) => void
  disabled?: boolean
  draftValues: AddonSettingsValues
}

type SelectAvailabilityState =
  'available' | 'empty' | 'no-permission' | 'disconnected' | 'error'

function isSameOptionValue(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
): boolean {
  if (a === undefined || a === null) return false
  if (b === undefined || b === null) return false
  return a === b
}

function formatOptionKey(val: string | number | boolean): string {
  return `${typeof val}:${String(val)}`
}

export function AddonDynamicSelectControl({
  field,
  addonId,
  scope,
  fieldAddress,
  value,
  onChange,
  disabled = false,
  draftValues,
}: AddonDynamicSelectControlProps) {
  const bridge = useHostBridge()
  const isMulti = field.type === 'multiselect'

  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [options, setOptions] = useState<readonly AddonSettingsOption[]>([])
  const [availability, setAvailability] =
    useState<SelectAvailabilityState>('available')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const knownLabelsMap = useRef<Map<string | number | boolean, string>>(
    new Map(),
  )

  const source = field.source

  const resolvedDependencies = useMemo(() => {
    if (source.kind !== 'dynamic') return []
    return extractResolvedDependencies(
      draftValues,
      fieldAddress,
      source.dependsOn,
    )
  }, [source, draftValues, fieldAddress])

  const serializedIdentity = useMemo(() => {
    return JSON.stringify({
      addonId,
      scope,
      source,
      fieldAddress: serializeFieldAddress(fieldAddress),
      deps: resolvedDependencies,
    })
  }, [addonId, scope, source, fieldAddress, resolvedDependencies])

  const requestContextRef = useRef({
    scope,
    fieldAddress,
    draftValues,
    resolvedDependencies,
    source,
  })
  requestContextRef.current = {
    scope,
    fieldAddress,
    draftValues,
    resolvedDependencies,
    source,
  }

  const activeIdentityRef = useRef(serializedIdentity)

  useEffect(() => {
    if (activeIdentityRef.current !== serializedIdentity) {
      activeIdentityRef.current = serializedIdentity
      setOptions([])
      setNextCursor(null)
      setAvailability('available')
      setStatusMessage('')
    }
  }, [serializedIdentity])

  useEffect(() => {
    return () => {
      activeIdentityRef.current = ''
    }
  }, [])

  useEffect(() => {
    if (source.kind === 'static') {
      for (const opt of source.options) {
        knownLabelsMap.current.set(opt.value, opt.label)
      }
    }
  }, [source])

  const fetchDynamicOptions = useCallback(
    async (searchQuery: string, cursorToLoad?: string) => {
      const requestContext = requestContextRef.current
      if (requestContext.source.kind !== 'dynamic') return

      const isPaging = cursorToLoad !== undefined && cursorToLoad.length > 0
      const capturedIdentity = serializedIdentity

      if (isPaging) {
        setIsLoadingMore(true)
      }
      if (!isPaging) {
        setIsLoading(true)
      }

      try {
        const response = await bridge.addons.resolveSettingsOptions({
          body: {
            addonId,
            scope: requestContext.scope,
            providerId: requestContext.source.providerId,
            fieldAddress: requestContext.fieldAddress,
            dependencies: requestContext.resolvedDependencies,
            draftValues: requestContext.draftValues,
            search:
              searchQuery.trim().length > 0 ? searchQuery.trim() : undefined,
            cursor: cursorToLoad,
            limit: 25,
          },
        })

        if (activeIdentityRef.current !== capturedIdentity) {
          return
        }

        if (!response.isSuccess || !response.data) {
          setAvailability('error')
          const failureMsg =
            response.error && response.error.length > 0
              ? response.error
              : 'Falha ao carregar opções'
          setStatusMessage(failureMsg)
          setIsLoading(false)
          setIsLoadingMore(false)
          return
        }

        const data: AddonResolveOptionsResponse = response.data
        setAvailability(data.availability)

        if (data.reason) {
          setStatusMessage(data.reason)
        }
        if (!data.reason && data.error) {
          setStatusMessage(data.error.messageKey)
        }
        if (!data.reason && !data.error) {
          setStatusMessage('')
        }

        if (data.hasMore) {
          setNextCursor(data.nextCursor)
        }
        if (!data.hasMore) {
          setNextCursor(null)
        }

        for (const opt of data.options) {
          knownLabelsMap.current.set(opt.value, opt.label)
        }

        if (isPaging) {
          setOptions((previous) => {
            const existingKeys = new Set(
              previous.map((opt) => formatOptionKey(opt.value)),
            )
            const uniqueNew = data.options.filter(
              (opt) => !existingKeys.has(formatOptionKey(opt.value)),
            )
            return [...previous, ...uniqueNew]
          })
          setIsLoadingMore(false)
          return
        }

        setOptions(data.options)
        setIsLoading(false)
      } catch (err) {
        if (activeIdentityRef.current !== capturedIdentity) return
        setAvailability('error')
        const message =
          err instanceof Error && err.message.length > 0
            ? err.message
            : 'Erro de transporte ao carregar opções'
        setStatusMessage(message)
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [addonId, bridge?.addons, serializedIdentity],
  )

  useEffect(() => {
    const currentSource = requestContextRef.current.source
    if (currentSource.kind === 'static') {
      setOptions(currentSource.options)
      if (currentSource.options.length === 0) {
        setAvailability('empty')
        setStatusMessage('Nenhuma opção disponível')
        return
      }
      setAvailability('available')
      setStatusMessage('')
      return
    }

    if (!open) return

    fetchDynamicOptions(searchTerm)
  }, [serializedIdentity, open, searchTerm, fetchDynamicOptions])

  const handleSearchChange = (query: string) => {
    setSearchTerm(query)
  }

  const handleLoadMore = () => {
    if (!nextCursor) return
    fetchDynamicOptions(searchTerm, nextCursor)
  }

  const selectedValuesList: readonly (string | number)[] = useMemo(() => {
    if (isMulti) {
      if (Array.isArray(value)) return value
      return []
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return [value]
    }
    return []
  }, [isMulti, value])

  const isOptionChecked = (optValue: string | number | boolean): boolean => {
    if (isMulti) {
      return selectedValuesList.some((v) => isSameOptionValue(v, optValue))
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return false
    }
    return isSameOptionValue(value, optValue)
  }

  const handleSelectOption = (opt: AddonSettingsOption) => {
    if (disabled || opt.disabled) return

    knownLabelsMap.current.set(opt.value, opt.label)

    if (isMulti) {
      const alreadySelected = selectedValuesList.some((v) =>
        isSameOptionValue(v, opt.value),
      )

      if (alreadySelected) {
        const next = selectedValuesList.filter(
          (v) => !isSameOptionValue(v, opt.value),
        )
        onChange(next)
        return
      }

      if (typeof opt.value === 'string' || typeof opt.value === 'number') {
        const next = [...selectedValuesList, opt.value]
        onChange(next)
        return
      }
      return
    }

    if (
      (typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean') &&
      isSameOptionValue(value, opt.value)
    ) {
      onChange(null)
      setOpen(false)
      return
    }

    onChange(opt.value)
    setOpen(false)
  }

  const renderTriggerLabel = () => {
    if (isMulti) {
      if (selectedValuesList.length === 0) {
        return (
          <span className="text-muted-foreground">
            {field.placeholder || 'Selecione as opções'}
          </span>
        )
      }

      return (
        <div className="flex flex-wrap gap-1">
          {selectedValuesList.map((val) => {
            let label = String(val)
            const mapped = knownLabelsMap.current.get(val)
            if (mapped !== undefined) {
              label = mapped
            }
            return (
              <Badge
                key={formatOptionKey(val)}
                variant="secondary"
                className="text-xs font-normal"
              >
                {label}
              </Badge>
            )
          })}
        </div>
      )
    }

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean')
    ) {
      return (
        <span className="text-muted-foreground">
          {field.placeholder || 'Selecione uma opção'}
        </span>
      )
    }

    let label = String(value)
    const mapped = knownLabelsMap.current.get(value)
    if (mapped !== undefined) {
      label = mapped
    }
    return <span>{label}</span>
  }

  const renderAvailabilityNotice = () => {
    if (availability === 'empty') {
      return (
        <div
          data-testid={`addon-select-state-${field.id}`}
          className="text-muted-foreground flex flex-col items-center justify-center p-4 text-center text-xs"
        >
          <p>
            {statusMessage.length > 0
              ? statusMessage
              : 'Nenhuma opção encontrada.'}
          </p>
        </div>
      )
    }

    if (availability === 'no-permission') {
      return (
        <div
          data-testid={`addon-select-state-${field.id}`}
          className="border-warning/30 bg-warning/10 text-warning-foreground flex flex-col items-center justify-center gap-1.5 rounded-md border p-3 text-center text-xs"
        >
          <AlertCircle className="size-4 text-amber-500" />
          <p className="font-medium">Sem permissão</p>
          <p className="text-muted-foreground text-[11px]">
            {statusMessage.length > 0
              ? statusMessage
              : 'Você não tem permissão para listar opções neste recurso.'}
          </p>
        </div>
      )
    }

    if (availability === 'disconnected') {
      return (
        <div
          data-testid={`addon-select-state-${field.id}`}
          className="border-border/60 bg-muted/20 text-muted-foreground flex flex-col items-center justify-center gap-1.5 rounded-md border p-3 text-center text-xs"
        >
          <AlertCircle className="size-4" />
          <p className="font-medium">Desconectado</p>
          <p className="text-[11px]">
            {statusMessage.length > 0
              ? statusMessage
              : 'A conexão com o provedor está indisponível ou desconectada.'}
          </p>
        </div>
      )
    }

    if (availability === 'error') {
      return (
        <div
          data-testid={`addon-select-state-${field.id}`}
          className="border-destructive/30 bg-destructive/10 text-destructive flex flex-col items-center justify-center gap-1.5 rounded-md border p-3 text-center text-xs"
        >
          <AlertCircle className="size-4" />
          <p className="font-medium">Erro ao carregar opções</p>
          <p className="text-[11px]">{statusMessage}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-6 text-xs"
            onClick={() => fetchDynamicOptions(searchTerm)}
          >
            Tentar novamente
          </Button>
        </div>
      )
    }

    return null
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{field.label}</label>
        {isMulti && selectedValuesList.length > 0 && (
          <span className="text-muted-foreground text-xs font-normal">
            {selectedValuesList.length} selecionado(s)
          </span>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-testid={`addon-dynamic-select-${field.id}`}
            className="h-auto min-h-[38px] w-full justify-between text-left font-normal"
          >
            <div className="flex-1 truncate">{renderTriggerLabel()}</div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[320px] p-2" align="start">
          <div className="relative mb-2">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
            <Input
              type="text"
              placeholder="Pesquisar opções..."
              value={searchTerm}
              data-testid={`addon-dynamic-select-search-${field.id}`}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {isLoading && (
            <div
              className="space-y-1.5 p-2"
              data-testid={`addon-select-loading-${field.id}`}
            >
              <Skeleton className="h-6 w-full rounded" />
              <Skeleton className="h-6 w-full rounded" />
              <Skeleton className="h-6 w-full rounded" />
            </div>
          )}

          {!isLoading &&
            availability !== 'available' &&
            renderAvailabilityNotice()}

          {!isLoading && availability === 'available' && (
            <ScrollArea className="max-h-56">
              <div className="space-y-0.5 p-0.5">
                {options.map((opt) => {
                  const isChecked = isOptionChecked(opt.value)

                  return (
                    <button
                      key={formatOptionKey(opt.value)}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleSelectOption(opt)}
                      data-testid={`addon-select-option-${opt.value}`}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors',
                        isChecked
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted/70 text-foreground',
                        opt.disabled && 'pointer-events-none opacity-40',
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {isMulti && (
                          <Checkbox
                            checked={isChecked}
                            disabled={opt.disabled}
                            className="size-3.5"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{opt.label}</p>
                          {opt.description && (
                            <p className="text-muted-foreground truncate text-[10px]">
                              {opt.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {!isMulti && isChecked && (
                        <Check className="text-primary size-3.5 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>

              {nextCursor && (
                <div className="mt-1 border-t pt-1.5 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isLoadingMore}
                    data-testid={`addon-dynamic-select-load-more-${field.id}`}
                    onClick={handleLoadMore}
                    className="h-7 w-full gap-1.5 text-xs"
                  >
                    {isLoadingMore && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    Carregar mais
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>

      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}
    </div>
  )
}
