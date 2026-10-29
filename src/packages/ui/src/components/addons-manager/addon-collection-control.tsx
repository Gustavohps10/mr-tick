import type {
  AddonFieldAddress,
  AddonSettingsCollectionField,
  AddonSettingsField,
  AddonSettingsValues,
  AddonSettingValue,
  AddonVaultScope,
} from '@mr-tick/application'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import {
  type AddonCollectionItemEnvelope,
  createCollectionItemEnvelope,
  duplicateCollectionItemEnvelope,
  removeCollectionItemEnvelope,
  reorderCollectionItemEnvelope,
  updateCollectionItemFieldValue,
} from './collection-helpers'

export interface AddonCollectionControlProps {
  field: AddonSettingsCollectionField
  addonId: string
  scope: AddonVaultScope
  parentAddress: AddonFieldAddress
  value: readonly AddonCollectionItemEnvelope[] | null | undefined
  onChange: (items: readonly AddonCollectionItemEnvelope[]) => void
  disabled?: boolean
  draftValues: AddonSettingsValues
  renderField: (params: {
    field: AddonSettingsField
    itemAddress: AddonFieldAddress
    value: AddonSettingValue | undefined
    onChange: (fieldId: string, value: AddonSettingValue) => void
    disabled?: boolean
  }) => React.ReactNode
}

function resolveItemInitialValues(
  fields: readonly AddonSettingsField[],
): AddonSettingsValues {
  const initial: AddonSettingsValues = {}
  for (const f of fields) {
    if ('defaultValue' in f && f.defaultValue !== undefined) {
      const val = f.defaultValue
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        initial[f.id] = val
        continue
      }
      if (Array.isArray(val)) {
        initial[f.id] = val
        continue
      }
      if (val !== null && typeof val === 'object') {
        initial[f.id] = val
        continue
      }
    }
  }
  return initial
}

function resolveItemDisplayName(
  item: AddonCollectionItemEnvelope,
  index: number,
  subFields: readonly AddonSettingsField[],
  itemLabel?: string,
): string {
  let labelPrefix = 'Item'
  if (itemLabel && itemLabel.length > 0) {
    labelPrefix = itemLabel
  }

  for (const subField of subFields) {
    if (subField.type !== 'text') continue
    const candidate = item.values[subField.id]
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return `${labelPrefix}: ${candidate.trim()}`
    }
  }

  return `${labelPrefix} #${index + 1}`
}

export function AddonCollectionControl({
  field,
  parentAddress,
  value,
  onChange,
  disabled = false,
  renderField,
}: AddonCollectionControlProps) {
  const items: readonly AddonCollectionItemEnvelope[] = Array.isArray(value)
    ? value
    : []

  const [collapsedItemIds, setCollapsedItemIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )

  const toggleExpand = (itemId: string) => {
    setCollapsedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
        return next
      }
      next.add(itemId)
      return next
    })
  }

  const handleAddItem = () => {
    const newItemId = crypto.randomUUID()
    const initialValues = resolveItemInitialValues(field.fields)
    const newEnvelope = createCollectionItemEnvelope(initialValues, newItemId)
    const nextItems = [...items, newEnvelope]
    onChange(nextItems)
  }

  const handleDuplicateItem = (item: AddonCollectionItemEnvelope) => {
    const newItemId = crypto.randomUUID()
    const duplicated = duplicateCollectionItemEnvelope(item, newItemId)
    const nextItems = [...items, duplicated]
    onChange(nextItems)
  }

  const handleRemoveItem = (itemId: string) => {
    const nextItems = removeCollectionItemEnvelope(items, itemId)
    onChange(nextItems)
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const nextItems = reorderCollectionItemEnvelope(items, index, index - 1)
    onChange(nextItems)
  }

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return
    const nextItems = reorderCollectionItemEnvelope(items, index, index + 1)
    onChange(nextItems)
  }

  const handleItemFieldChange = (
    targetItemId: string,
    fieldId: string,
    fieldVal: AddonSettingValue,
  ) => {
    const nextItems = items.map((it) => {
      if (it.itemId !== targetItemId) return it
      return updateCollectionItemFieldValue(it, fieldId, fieldVal)
    })
    onChange(nextItems)
  }

  const handleToggleEnable = (
    item: AddonCollectionItemEnvelope,
    checked: boolean,
  ) => {
    if (!field.enabledFieldId) return
    handleItemFieldChange(item.itemId, field.enabledFieldId, checked)
  }

  const allowReorder = field.allowReorder !== false
  const allowDuplicate = field.allowDuplicate !== false

  return (
    <div
      data-testid={`addon-collection-${field.id}`}
      className="flex flex-col gap-3 py-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold">{field.label}</label>
          {field.description && (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid={`addon-collection-add-${field.id}`}
          onClick={handleAddItem}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          Adicionar {field.itemLabel || 'Item'}
        </Button>
      </div>

      {items.length === 0 && (
        <div
          data-testid={`addon-collection-empty-${field.id}`}
          className="text-muted-foreground border-border/50 bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed py-6 text-center text-xs"
        >
          Nenhum item configurado. Clique em &quot;Adicionar&quot; para começar.
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((item, index) => {
            const isExpanded = !collapsedItemIds.has(item.itemId)
            const itemDisplayName = resolveItemDisplayName(
              item,
              index,
              field.fields,
              field.itemLabel,
            )

            let isEnabled = true
            if (field.enabledFieldId) {
              const declaredVal = item.values[field.enabledFieldId]
              if (declaredVal !== undefined && declaredVal !== null) {
                isEnabled = Boolean(declaredVal)
              }
            }

            const itemAddress: AddonFieldAddress = {
              path: [
                ...parentAddress.path,
                { kind: 'item', itemId: item.itemId },
              ],
            }

            return (
              <Card
                key={item.itemId}
                data-testid={`addon-collection-item-${item.itemId}`}
                className="border-border/60 bg-card/60 shadow-none"
              >
                <CardHeader className="flex flex-row items-center justify-between p-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.itemId)}
                      data-testid={`addon-collection-item-toggle-expand-${item.itemId}`}
                      className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs font-medium"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      <span className="truncate">{itemDisplayName}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {field.enabledFieldId && (
                      <div className="mr-2 flex items-center gap-1.5">
                        <span className="text-muted-foreground text-[11px]">
                          {isEnabled ? 'Ativo' : 'Inativo'}
                        </span>
                        <Switch
                          disabled={disabled}
                          checked={isEnabled}
                          data-testid={`addon-collection-item-toggle-enable-${item.itemId}`}
                          onCheckedChange={(checked) =>
                            handleToggleEnable(item, checked)
                          }
                          className="scale-75"
                        />
                      </div>
                    )}

                    {allowReorder && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={disabled || index === 0}
                          data-testid={`addon-collection-item-up-${item.itemId}`}
                          onClick={() => handleMoveUp(index)}
                          className="size-7"
                          title="Mover para cima"
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={disabled || index === items.length - 1}
                          data-testid={`addon-collection-item-down-${item.itemId}`}
                          onClick={() => handleMoveDown(index)}
                          className="size-7"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </>
                    )}

                    {allowDuplicate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        data-testid={`addon-collection-item-duplicate-${item.itemId}`}
                        onClick={() => handleDuplicateItem(item)}
                        className="size-7"
                        title="Duplicar"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      data-testid={`addon-collection-item-remove-${item.itemId}`}
                      onClick={() => handleRemoveItem(item.itemId)}
                      className="text-destructive hover:text-destructive size-7"
                      title="Excluir"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-3 border-t p-3 pt-3">
                    {field.fields.map((nestedField) => {
                      const nestedAddress: AddonFieldAddress = {
                        path: [
                          ...itemAddress.path,
                          { kind: 'field', fieldId: nestedField.id },
                        ],
                      }

                      return (
                        <div key={nestedField.id}>
                          {renderField({
                            field: nestedField,
                            itemAddress: nestedAddress,
                            value: item.values[nestedField.id],
                            onChange: (nestedId, nestedVal) =>
                              handleItemFieldChange(
                                item.itemId,
                                nestedId,
                                nestedVal,
                              ),
                            disabled: disabled || !isEnabled,
                          })}
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
