import type {
  AddonExecuteOperationalActionRequest,
  AddonOperationalActionDefinition,
  AddonOperationalItem,
  AddonSettingsField,
  AddonSettingsOperationalListField,
  AddonSettingValue,
  AddonVaultScope,
} from '@mr-tick/application'
import { AlertCircle, Clock, Layers, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'

export interface AddonOperationalRecordsCardProps {
  field: AddonSettingsOperationalListField
  addonId: string
  scope: AddonVaultScope
  workspaceId?: string
  disabled?: boolean
  renderField?: (params: {
    field: AddonSettingsField
    value: AddonSettingValue | undefined
    onChange: (fieldId: string, value: AddonSettingValue) => void
    disabled?: boolean
  }) => React.ReactNode
}

function resolveStatusVariant(
  status: AddonOperationalItem['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'resolved') return 'default'
  if (status === 'pending') return 'secondary'
  if (status === 'error') return 'destructive'
  return 'outline'
}

function resolveStatusLabel(status: AddonOperationalItem['status']): string {
  if (status === 'resolved') return 'Resolvido'
  if (status === 'pending') return 'Pendente'
  if (status === 'error') return 'Erro'
  return 'Interrompido'
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const remainingSecs = seconds % 60
  if (mins === 0) return `${remainingSecs}s`
  return `${mins}m ${remainingSecs}s`
}

export function AddonOperationalRecordsCard({
  field,
  addonId,
  scope,
  disabled = false,
  renderField,
}: AddonOperationalRecordsCardProps) {
  const bridge = useHostBridge()

  const [items, setItems] = useState<readonly AddonOperationalItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  const [actionModal, setActionModal] = useState<{
    open: boolean
    item?: AddonOperationalItem
    action?: AddonOperationalActionDefinition
    payload: Record<string, AddonSettingValue>
    isExecuting: boolean
    error?: string
  }>({
    open: false,
    payload: {},
    isExecuting: false,
  })

  const serializedIdentity = useMemo(() => {
    return JSON.stringify({
      addonId,
      scope,
      providerId: field.providerId,
    })
  }, [addonId, scope, field.providerId])

  useEffect(() => {
    setActionModal({
      open: false,
      payload: {},
      isExecuting: false,
    })
  }, [serializedIdentity])

  const schemaActionsMap = useMemo(() => {
    const map = new Map<string, AddonOperationalActionDefinition>()
    if (field.actions) {
      for (const a of field.actions) {
        map.set(a.id, a)
      }
    }
    return map
  }, [field.actions])

  const activeIdentityRef = useRef(serializedIdentity)

  useEffect(() => {
    if (activeIdentityRef.current !== serializedIdentity) {
      activeIdentityRef.current = serializedIdentity
      setItems([])
      setErrorMessage(null)
      setNextCursor(null)
    }
  }, [serializedIdentity])

  useEffect(() => {
    return () => {
      activeIdentityRef.current = ''
    }
  }, [])

  const fetchItems = useCallback(
    async (cursorToLoad?: string) => {
      const isPaging = cursorToLoad !== undefined && cursorToLoad.length > 0
      const capturedIdentity = serializedIdentity

      if (isPaging) {
        setIsLoadingMore(true)
      }
      if (!isPaging) {
        setIsLoading(true)
      }

      setErrorMessage(null)

      const response = await bridge.addons.getOperationalList({
        body: {
          addonId,
          scope: scopeRef.current,
          providerId: field.providerId,
          cursor: cursorToLoad,
          limit: 20,
        },
      })

      if (activeIdentityRef.current !== capturedIdentity) return

      if (!response || !response.isSuccess || !response.data) {
        const failureMsg =
          response && response.error && response.error.length > 0
            ? response.error
            : 'Falha ao consultar registros operacionais'
        setErrorMessage(failureMsg)
        setIsLoading(false)
        setIsLoadingMore(false)
        return
      }

      const data = response.data
      if (data.hasMore) {
        setNextCursor(data.nextCursor)
      }
      if (!data.hasMore) {
        setNextCursor(null)
      }

      if (isPaging) {
        setItems((prev) => {
          const existingIds = new Set(prev.map((it) => it.itemId))
          const unique = data.items.filter((it) => !existingIds.has(it.itemId))
          return [...prev, ...unique]
        })
        setIsLoadingMore(false)
        return
      }

      setItems(data.items)
      setIsLoading(false)
    },
    [addonId, bridge.addons, field.providerId, serializedIdentity],
  )

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleTriggerAction = async (
    item: AddonOperationalItem,
    action: AddonOperationalActionDefinition,
  ) => {
    if (disabled) return

    if (action.fields && action.fields.length > 0) {
      setActionModal({
        open: true,
        item,
        action,
        payload: {},
        isExecuting: false,
      })
      return
    }

    const response = await bridge.addons.executeOperationalAction({
      body: {
        addonId,
        scope,
        providerId: field.providerId,
        itemId: item.itemId,
        actionId: action.id,
      },
    })

    if (!response || !response.isSuccess) {
      setErrorMessage(
        response && response.error && response.error.length > 0
          ? response.error
          : 'Falha ao executar ação',
      )
      return
    }

    fetchItems()
  }

  const handleConfirmModalAction = async () => {
    if (!actionModal.item || !actionModal.action) return

    setActionModal((prev) => ({ ...prev, isExecuting: true, error: undefined }))

    const requestBody: AddonExecuteOperationalActionRequest = {
      scope,
      providerId: field.providerId,
      itemId: actionModal.item.itemId,
      actionId: actionModal.action.id,
      payload: actionModal.payload,
    }

    const response = await bridge.addons.executeOperationalAction({
      body: {
        addonId,
        ...requestBody,
      },
    })

    if (!response || !response.isSuccess) {
      const failureMsg =
        response && response.error && response.error.length > 0
          ? response.error
          : 'Falha ao executar ação'
      setActionModal((prev) => ({
        ...prev,
        isExecuting: false,
        error: failureMsg,
      }))
      return
    }

    setActionModal({ open: false, payload: {}, isExecuting: false })
    fetchItems()
  }

  return (
    <div
      data-testid={`addon-operational-list-${field.id}`}
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
          disabled={disabled || isLoading}
          data-testid={`addon-operational-refresh-${field.id}`}
          onClick={() => fetchItems()}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={isLoading ? 'size-3 animate-spin' : 'size-3'} />
          Atualizar
        </Button>
      </div>

      {isLoading && (
        <div
          data-testid={`addon-operational-loading-${field.id}`}
          className="space-y-2"
        >
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      )}

      {!isLoading && errorMessage && (
        <div
          data-testid={`addon-operational-error-${field.id}`}
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-3 text-xs"
        >
          <AlertCircle className="size-4 shrink-0" />
          <p className="flex-1">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !errorMessage && items.length === 0 && (
        <div
          data-testid={`addon-operational-empty-${field.id}`}
          className="text-muted-foreground border-border/50 bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center text-xs"
        >
          <Layers className="mb-1 size-6 opacity-30" />
          <p>Nenhum registro operacional pendente.</p>
        </div>
      )}

      {!isLoading && !errorMessage && items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((item) => {
            const durationLabel = formatDuration(item.durationSeconds)

            return (
              <Card
                key={item.itemId}
                data-testid={`addon-operational-item-${item.itemId}`}
                className="border-border/60 bg-card/60 shadow-none"
              >
                <CardHeader className="flex flex-row items-start justify-between p-3.5 pb-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground truncate text-xs font-semibold">
                        {item.title}
                      </span>
                      <Badge
                        variant={resolveStatusVariant(item.status)}
                        className="text-[10px]"
                        data-testid={`addon-operational-status-${item.itemId}`}
                      >
                        {resolveStatusLabel(item.status)}
                      </Badge>
                      {durationLabel && (
                        <span className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
                          <Clock className="size-3" />
                          {durationLabel}
                        </span>
                      )}
                    </div>

                    {item.subtitle && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {item.subtitle}
                      </p>
                    )}

                    {item.reason && (
                      <p className="text-destructive mt-0.5 text-[11px]">
                        {item.reason}
                      </p>
                    )}
                  </div>

                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </CardHeader>

                <CardContent className="space-y-2.5 p-3.5 pt-1">
                  {item.data && Object.keys(item.data).length > 0 && (
                    <div className="bg-muted/40 grid grid-cols-2 gap-1.5 rounded p-2 font-mono text-[11px]">
                      {Object.entries(item.data).map(([k, v]) => (
                        <div key={k} className="truncate">
                          <span className="text-muted-foreground">{k}: </span>
                          <span className="text-foreground">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.availableActions &&
                    item.availableActions.length > 0 && (
                      <div className="flex items-center justify-end gap-1.5 border-t pt-1">
                        {item.availableActions.map((act) => {
                          const schemaDef = schemaActionsMap.get(act.id)
                          const effectiveAction: AddonOperationalActionDefinition =
                            {
                              id: act.id,
                              label: act.label || schemaDef?.label || act.id,
                              variant:
                                act.variant || schemaDef?.variant || 'outline',
                              fields: schemaDef?.fields || act.fields || [],
                            }

                          return (
                            <Button
                              key={act.id}
                              type="button"
                              variant={effectiveAction.variant || 'outline'}
                              size="sm"
                              disabled={disabled}
                              data-testid={`addon-operational-action-${item.itemId}-${act.id}`}
                              onClick={() =>
                                handleTriggerAction(item, effectiveAction)
                              }
                              className="h-7 px-2.5 text-xs"
                            >
                              {effectiveAction.label}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                </CardContent>
              </Card>
            )
          })}

          {nextCursor && (
            <div className="pt-2 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoadingMore}
                data-testid={`addon-operational-load-more-${field.id}`}
                onClick={() => fetchItems(nextCursor)}
                className="h-8 gap-1.5 text-xs"
              >
                {isLoadingMore && <Loader2 className="size-3 animate-spin" />}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={actionModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setActionModal({ open: false, payload: {}, isExecuting: false })
          }
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-3xl"
          data-testid="addon-operational-action-modal"
        >
          <DialogHeader className="shrink-0 border-b p-4 pb-3">
            <DialogTitle className="text-base font-semibold">
              {actionModal.action?.label || 'Executar Ação'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-0.5 text-xs">
              {actionModal.item?.title && (
                <span>Registro: {actionModal.item.title}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {actionModal.error && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-2.5 text-xs">
                {actionModal.error}
              </div>
            )}

            {actionModal.action?.fields &&
            actionModal.action.fields.length > 0 &&
            renderField ? (
              actionModal.action.fields.map((f) => (
                <div key={f.id}>
                  {renderField({
                    field: f,
                    value: actionModal.payload[f.id],
                    onChange: (fid, fval) =>
                      setActionModal((prev) => ({
                        ...prev,
                        payload: {
                          ...prev.payload,
                          [fid]: fval,
                        },
                      })),
                    disabled: actionModal.isExecuting,
                  })}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">
                Confirma a execução desta ação?
              </p>
            )}
          </div>

          <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t p-3">
            <Button
              type="button"
              variant="outline"
              disabled={actionModal.isExecuting}
              onClick={() =>
                setActionModal({ open: false, payload: {}, isExecuting: false })
              }
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={actionModal.isExecuting}
              data-testid="addon-operational-modal-confirm"
              onClick={handleConfirmModalAction}
            >
              {actionModal.isExecuting && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
