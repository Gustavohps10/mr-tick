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
import React, { useEffect, useState } from 'react'

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
import { ScrollArea } from '@/components/ui/scroll-area'
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
  fields?: MappingFieldDefinition[]
  value?: string | Record<string, ConfiguredFieldMapping> | null
  onSave: (value: Record<string, ConfiguredFieldMapping>) => void
}

export function MappingConfigModal({
  open,
  onOpenChange,
  addonId,
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

  const { data: fetchedFields = [] } = useQuery({
    queryKey: ['addon-mapping-fields', addonId],
    queryFn: async (): Promise<MappingFieldDefinition[]> => {
      if (!addonId) return []
      if (!bridge?.addons?.getMappingFields) return []
      const response = await bridge.addons.getMappingFields({
        body: { addonId },
      })
      if (!response.isSuccess) return []
      if (!response.data) return []
      return response.data
    },
    enabled:
      open && Boolean(addonId) && (!propFields || propFields.length === 0),
  })

  let fields: MappingFieldDefinition[] = []
  if (fetchedFields) fields = fetchedFields
  if (propFields && propFields.length > 0) fields = propFields

  useEffect(() => {
    if (!open) return
    const initialMappings = parseMappingValue(value)
    setMappings(initialMappings)
  }, [open, value])

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
          className="max-h-[90vh] sm:max-w-2xl"
          data-testid="mapping-config-dialog"
        >
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
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

          <ScrollArea className="max-h-[60vh] pr-3">
            {fields.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Nenhum campo requer mapeamento para este addon.
                </p>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {fields.map((field) => {
                  const currentMapping = getResolvedFieldMapping(field)

                  return (
                    <div
                      key={field.id}
                      data-testid={`mapping-field-item-${field.id}`}
                      className="bg-card/50 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {field.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-normal uppercase"
                          >
                            {field.category}
                          </Badge>
                        </div>
                        {field.description && (
                          <p className="text-muted-foreground text-xs">
                            {field.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Seletor Visual de Ícones */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              data-testid={`mapping-icon-picker-${field.id}`}
                              className="h-8 gap-2 px-2.5 text-xs"
                            >
                              <DynamicIcon
                                name={currentMapping.icon}
                                className="h-4 w-4"
                                color={currentMapping.color}
                              />
                              <span className="font-mono text-[11px]">
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
                              {Object.keys(AVAILABLE_ICONS).map((iconName) => (
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
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Paleta Visual de Cores */}
                        <div
                          className="flex items-center gap-1.5"
                          data-testid={`mapping-color-palette-${field.id}`}
                        >
                          {AVAILABLE_COLORS.map((c) => {
                            const isSelected = currentMapping.color === c.value
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
                                  'flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110',
                                  isSelected &&
                                    'ring-primary ring-2 ring-offset-2',
                                )}
                                style={{ backgroundColor: c.value }}
                              >
                                {isSelected && (
                                  <Check className="h-3 w-3 text-white drop-shadow" />
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
            )}
          </ScrollArea>

          <DialogFooter className="flex justify-end gap-2 pt-2">
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
