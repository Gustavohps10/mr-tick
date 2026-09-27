'use client'

import type {
  ConfiguredFieldMapping,
  MappingFieldDefinition,
} from '@mr-tick/sdk'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRightCircle,
  Bookmark,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock,
  Code,
  Copy,
  Download,
  Eye,
  FileText,
  Flame,
  HelpCircle,
  Inbox,
  Layers,
  type LucideIcon,
  MinusCircle,
  PauseCircle,
  PlayCircle,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

export const AVAILABLE_ICONS: Record<string, LucideIcon> = {
  PlayCircle,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Inbox,
  Eye,
  Flame,
  Bookmark,
  Tag,
  HelpCircle,
  Zap,
  Calendar,
  Code,
  FileText,
  Check,
  MinusCircle,
  PauseCircle,
  Layers,
  Activity,
  CheckSquare,
  XCircle,
  AlertTriangle,
  Circle,
  RotateCw,
  ArrowRightCircle,
  Sparkles,
}

export const AVAILABLE_COLORS: { label: string; value: string }[] = [
  { label: 'Slate', value: '#64748b' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Índigo', value: '#6366f1' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Ciano', value: '#06b6d4' },
]

export function DynamicIcon({
  name,
  className,
  color,
}: {
  name: string
  className?: string
  color?: string
}) {
  const IconComponent = AVAILABLE_ICONS[name]
  if (IconComponent) {
    return <IconComponent className={className} style={{ color }} />
  }
  return <Circle className={className} style={{ color }} />
}

export function parseMappingValue(
  value: string | Record<string, ConfiguredFieldMapping> | null | undefined,
): Record<string, ConfiguredFieldMapping> {
  if (!value) return {}
  if (typeof value === 'object') {
    const recordResult: Record<string, ConfiguredFieldMapping> = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item.icon === 'string' && typeof item.color === 'string') {
        recordResult[key] = {
          icon: item.icon,
          color: item.color,
          customValue:
            typeof item.customValue === 'string' ? item.customValue : undefined,
        }
      }
    }
    return recordResult
  }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const target =
      'mapping' in parsed &&
      parsed.mapping &&
      typeof parsed.mapping === 'object' &&
      !Array.isArray(parsed.mapping)
        ? parsed.mapping
        : parsed

    const result: Record<string, ConfiguredFieldMapping> = {}
    for (const [key, item] of Object.entries(target)) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const icon =
          'icon' in item && typeof item.icon === 'string' ? item.icon : ''
        const color =
          'color' in item && typeof item.color === 'string' ? item.color : ''
        const customValue =
          'customValue' in item && typeof item.customValue === 'string'
            ? item.customValue
            : undefined
        if (icon && color) {
          result[key] = { icon, color, customValue }
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

export interface MappingConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addonId: string
  workspaceId?: string
  connectionInstanceId?: string
  fields?: MappingFieldDefinition[]
  value?: string | Record<string, ConfiguredFieldMapping> | null
  onSave: (value: Record<string, ConfiguredFieldMapping>) => void
}

export function MappingConfigModal({
  open,
  onOpenChange,
  addonId,
  workspaceId,
  connectionInstanceId,
  fields: propFields,
  value,
  onSave,
}: MappingConfigModalProps) {
  const bridge = useHostBridge()
  const [mappings, setMappings] = useState<
    Record<string, ConfiguredFieldMapping>
  >({})
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [importJsonText, setImportJsonText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const { data: fetchedFields = [], isLoading } = useQuery({
    queryKey: [
      'addon-mapping-fields',
      addonId,
      workspaceId,
      connectionInstanceId,
    ],
    queryFn: async (): Promise<MappingFieldDefinition[]> => {
      if (!addonId) return []
      if (!bridge?.addons?.getMappingFields) return []
      const response = await bridge.addons.getMappingFields({
        body: { addonId, workspaceId, connectionInstanceId },
      })
      if (!response.isSuccess) return []
      if (!response.data) return []
      return response.data
    },
    enabled:
      open && Boolean(addonId) && (!propFields || propFields.length === 0),
    staleTime: 1000 * 60 * 5,
  })

  let fields: MappingFieldDefinition[] = []
  if (fetchedFields) fields = fetchedFields
  if (propFields && propFields.length > 0) fields = propFields

  const isQueryLoading = isLoading && (!propFields || propFields.length === 0)

  useEffect(() => {
    if (!open) return
    const initialMappings = parseMappingValue(value)
    setMappings(initialMappings)
  }, [open, value])

  const groupedFields = useMemo(() => {
    const groupMap = new Map<
      string,
      { label: string; fields: MappingFieldDefinition[] }
    >()

    for (const field of fields) {
      const categoryKey = field.category || 'outros'
      const existing = groupMap.get(categoryKey)
      if (existing) {
        existing.fields.push(field)
        if (!existing.label && field.categoryLabel) {
          existing.label = field.categoryLabel
        }
      } else {
        const initialLabel = field.categoryLabel || categoryKey
        groupMap.set(categoryKey, {
          label: initialLabel,
          fields: [field],
        })
      }
    }

    const groups: {
      category: string
      label: string
      fields: MappingFieldDefinition[]
    }[] = []

    for (const [categoryKey, data] of groupMap.entries()) {
      groups.push({
        category: categoryKey,
        label: data.label,
        fields: data.fields,
      })
    }

    return groups
  }, [fields])

  const getResolvedFieldMapping = (
    field: MappingFieldDefinition,
  ): ConfiguredFieldMapping => {
    const existing = mappings[field.id]
    if (existing) return existing

    let icon = 'Circle'
    if (field.defaultIcon) icon = field.defaultIcon

    let color = '#64748b'
    if (field.defaultColor) color = field.defaultColor

    return { icon, color }
  }

  const handleUpdateIcon = (fieldId: string, iconName: string) => {
    setMappings((prev) => {
      const current = prev[fieldId]
      const currentColor = current?.color
        ? current.color
        : (fields.find((f) => f.id === fieldId)?.defaultColor ?? '#64748b')
      return {
        ...prev,
        [fieldId]: {
          icon: iconName,
          color: currentColor,
          customValue: current?.customValue,
        },
      }
    })
  }

  const handleUpdateColor = (fieldId: string, colorHex: string) => {
    setMappings((prev) => {
      const current = prev[fieldId]
      const currentIcon = current?.icon
        ? current.icon
        : (fields.find((f) => f.id === fieldId)?.defaultIcon ?? 'Circle')
      return {
        ...prev,
        [fieldId]: {
          icon: currentIcon,
          color: colorHex,
          customValue: current?.customValue,
        },
      }
    })
  }

  const handleApplyPreset = () => {
    if (!importJsonText.trim()) {
      setImportError('Informe o JSON do preset de mapeamento.')
      return
    }

    const parsed = parseMappingValue(importJsonText)
    if (Object.keys(parsed).length === 0) {
      setImportError('JSON inválido ou nenhum mapeamento reconhecido.')
      return
    }

    setMappings((prev) => ({
      ...prev,
      ...parsed,
    }))
    setImportError(null)
    setImportJsonText('')
    setIsImportOpen(false)
  }

  const handleExportJson = () => {
    const finalMappings: Record<string, ConfiguredFieldMapping> = {}
    for (const field of fields) {
      finalMappings[field.id] = getResolvedFieldMapping(field)
    }
    const jsonOutput = JSON.stringify({ mapping: finalMappings }, null, 2)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(jsonOutput).catch(() => {})
      setIsCopied(true)
    }
    setIsExportOpen(true)
  }

  const handleSave = () => {
    const finalMappings: Record<string, ConfiguredFieldMapping> = {}
    for (const field of fields) {
      finalMappings[field.id] = getResolvedFieldMapping(field)
    }
    onSave(finalMappings)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[85vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          data-testid="mapping-config-dialog"
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <div className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="text-primary h-5 w-5" />
                <DialogTitle>Configurar Mapeamento</DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="modal-import-preset-btn"
                  onClick={() => {
                    setImportError(null)
                    setImportJsonText('')
                    setIsImportOpen(true)
                  }}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Importar Preset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  data-testid="modal-export-preset-btn"
                  onClick={handleExportJson}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Exportar Preset
                </Button>
              </div>
            </div>
            <DialogDescription>
              Selecione o ícone e a cor correspondente para cada status e campo
              remoto do addon.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {isQueryLoading ? (
              <div
                className="space-y-6"
                data-testid="mapping-config-loading-skeleton"
              >
                {[1, 2].map((groupIndex) => (
                  <div key={groupIndex} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-4 w-5 rounded-full" />
                    </div>
                    <div className="space-y-1.5">
                      {[1, 2, 3].map((itemIndex) => (
                        <div
                          key={itemIndex}
                          className="bg-card/40 flex items-center justify-between gap-3 rounded-md border px-3 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-3.5 w-32 rounded" />
                            <Skeleton className="h-3 w-40 rounded opacity-60" />
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <Skeleton className="h-7 w-28 rounded-md" />
                            <div className="flex items-center gap-1">
                              {[...Array(10)].map((_, i) => (
                                <Skeleton
                                  key={i}
                                  className="h-4 w-4 rounded-full"
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : fields.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  Nenhum campo requer mapeamento para este addon.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedFields.map((group) => (
                  <div key={group.category} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                        {group.label}
                      </span>
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[10px] font-normal"
                      >
                        {group.fields.length}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      {group.fields.map((field) => {
                        const currentMapping = getResolvedFieldMapping(field)

                        return (
                          <div
                            key={field.id}
                            data-testid={`mapping-field-item-${field.id}`}
                            className="bg-card/40 hover:bg-card/70 flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 transition-colors"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="text-foreground truncate text-xs font-medium">
                                {field.name}
                              </span>
                              {field.description && (
                                <span className="text-muted-foreground/70 hidden truncate text-[11px] sm:inline">
                                  — {field.description}
                                </span>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                              {/* Seletor Visual de Ícones */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    data-testid={`mapping-icon-picker-${field.id}`}
                                    className="h-7 gap-1.5 px-2 text-xs"
                                  >
                                    <DynamicIcon
                                      name={currentMapping.icon}
                                      className="h-3.5 w-3.5"
                                      color={currentMapping.color}
                                    />
                                    <span className="text-muted-foreground font-mono text-[10px]">
                                      {currentMapping.icon}
                                    </span>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-64 p-2"
                                  data-testid={`mapping-icon-popover-${field.id}`}
                                >
                                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                                    Selecione um ícone:
                                  </p>
                                  <div className="grid grid-cols-6 gap-1">
                                    {Object.keys(AVAILABLE_ICONS).map(
                                      (iconName) => (
                                        <Button
                                          key={iconName}
                                          type="button"
                                          variant={
                                            currentMapping.icon === iconName
                                              ? 'secondary'
                                              : 'ghost'
                                          }
                                          size="icon"
                                          className="h-8 w-8"
                                          data-testid={`icon-option-${field.id}-${iconName}`}
                                          onClick={() =>
                                            handleUpdateIcon(field.id, iconName)
                                          }
                                        >
                                          <DynamicIcon
                                            name={iconName}
                                            className="h-4 w-4"
                                            color={currentMapping.color}
                                          />
                                        </Button>
                                      ),
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>

                              {/* Paleta Visual de Cores */}
                              <div
                                className="flex items-center gap-1"
                                data-testid={`mapping-color-palette-${field.id}`}
                              >
                                {AVAILABLE_COLORS.map((c) => {
                                  const isSelected =
                                    currentMapping.color === c.value
                                  return (
                                    <button
                                      key={c.value}
                                      type="button"
                                      title={c.label}
                                      data-testid={`color-btn-${field.id}-${c.value}`}
                                      onClick={() =>
                                        handleUpdateColor(field.id, c.value)
                                      }
                                      className={cn(
                                        'flex h-4 w-4 items-center justify-center rounded-full transition-transform hover:scale-125',
                                        isSelected &&
                                          'ring-primary ring-1.5 ring-offset-1',
                                      )}
                                      style={{ backgroundColor: c.value }}
                                    >
                                      {isSelected && (
                                        <Check className="h-2.5 w-2.5 text-white drop-shadow" />
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="modal-cancel-mapping-btn"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="modal-save-mapping-btn"
              onClick={handleSave}
            >
              Salvar Mapeamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Interno de Importar Preset */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent
          className="sm:max-w-md"
          data-testid="modal-import-preset-dialog"
        >
          <DialogHeader>
            <DialogTitle>Importar Preset de Mapeamento</DialogTitle>
            <DialogDescription>
              Cole o JSON compartilhado pelo Tech Lead para carregar as cores e
              ícones de uma só vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              data-testid="modal-import-preset-textarea"
              placeholder={
                '{\n  "mapping": {\n    "in_progress": {\n      "icon": "PlayCircle",\n      "color": "#3b82f6"\n    }\n  }\n}'
              }
              rows={8}
              className="font-mono text-xs"
              value={importJsonText}
              onChange={(e) => {
                setImportJsonText(e.target.value)
                if (importError) setImportError(null)
              }}
            />
            {importError && (
              <p
                data-testid="modal-import-preset-error"
                className="text-destructive text-xs"
              >
                {importError}
              </p>
            )}
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsImportOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="modal-apply-preset-btn"
              onClick={handleApplyPreset}
            >
              Aplicar Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Interno de Exportar Preset */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent
          className="sm:max-w-md"
          data-testid="modal-export-preset-dialog"
        >
          <DialogHeader>
            <DialogTitle>Exportar Preset de Mapeamento</DialogTitle>
            <DialogDescription>
              Copie o JSON abaixo para compartilhar com a equipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              readOnly
              data-testid="modal-export-preset-textarea"
              rows={8}
              className="font-mono text-xs"
              value={(() => {
                const finalMappings: Record<string, ConfiguredFieldMapping> = {}
                for (const field of fields) {
                  finalMappings[field.id] = getResolvedFieldMapping(field)
                }
                return JSON.stringify({ mapping: finalMappings }, null, 2)
              })()}
            />
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="modal-copy-preset-btn"
              onClick={() => {
                const finalMappings: Record<string, ConfiguredFieldMapping> = {}
                for (const field of fields) {
                  finalMappings[field.id] = getResolvedFieldMapping(field)
                }
                const jsonOutput = JSON.stringify(
                  { mapping: finalMappings },
                  null,
                  2,
                )
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(jsonOutput).catch(() => {})
                  setIsCopied(true)
                }
              }}
            >
              {isCopied ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isCopied ? 'Copiado!' : 'Copiar JSON'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsExportOpen(false)}
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
