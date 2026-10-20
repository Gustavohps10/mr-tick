import {
  AddonSettingsField,
  AddonSettingsSchema,
  AddonSettingsValues,
  AddonSettingsView,
  AddonVaultScope,
  rebaseAddonSettings,
} from '@mr-tick/application'
import type {
  AddonManifestViewModel,
  AddonSettingsTab,
  ConnectionProfileDescriptor,
  WorkspaceViewModel,
} from '@mr-tick/sdk'
import { isString } from '@mr-tick/shared/helpers'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  FolderKanban,
  Loader2,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { MappingConfigModal } from '@/components/mapping-config-modal'
import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { WorkspaceContext } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

import { AddonFieldRenderer } from './addon-field-renderer'
import { AddonThemeSettingsPanel } from './addon-theme-settings-panel'
import { addonMatchesCategory } from './addons-manager-view'
import {
  AddonConnection,
  ConnectionCard,
  ConnectionStatus,
} from './connection-card'
import { WorkspaceGroupedDataSourceManager } from './workspace-grouped-datasource-manager'

const emptySettings: AddonSettingsView = {
  schemaVersion: 1,
  revision: 0,
  values: {},
  credentialStates: {},
}

export interface AddonSettingsRendererProps {
  addonId: string
  activeCapability?: string
  activeCapabilityLabel?: string
  activeCapabilityDescription?: string
  addon?: AddonManifestViewModel | null
  hideHeader?: boolean
  scope?: AddonVaultScope
}

function firstWorkspace(
  items: WorkspaceViewModel[],
): WorkspaceViewModel | null {
  for (const item of items) return item
  return null
}

function resolveConnectionName(
  config: Record<string, unknown> | undefined,
  fallbackId: string,
): string {
  if (config && isString(config.name) && config.name.trim().length > 0) {
    return config.name
  }
  return fallbackId
}

function resolveConnectionUrl(
  config: Record<string, unknown> | undefined,
): string | undefined {
  if (!config) return undefined
  if (isString(config.url) && config.url.trim().length > 0) {
    return config.url
  }
  if (isString(config.baseUrl) && config.baseUrl.trim().length > 0) {
    return config.baseUrl
  }
  if (isString(config.apiUrl) && config.apiUrl.trim().length > 0) {
    return config.apiUrl
  }
  return undefined
}

function resolveConnectionStatus(status?: string): ConnectionStatus {
  if (status === 'connected') return 'connected'
  return 'disconnected'
}

function resolveProfileSelectionValue(
  profiles: ConnectionProfileDescriptor[],
  selectedProfileId: string | null,
): string {
  if (selectedProfileId !== null) return selectedProfileId
  const defaultProfile = profiles.find((profile) => profile.default)
  if (!defaultProfile) return ''
  return defaultProfile.connectionProfileId
}

export function AddonSettingsRenderer({
  addonId,
  activeCapability,
  activeCapabilityLabel,
  activeCapabilityDescription,
  addon,
  hideHeader = false,
  scope,
}: AddonSettingsRendererProps) {
  if (activeCapability === 'theme') {
    return <AddonThemeSettingsPanel addonId={addonId} addon={addon} />
  }

  if (scope) {
    return (
      <ScopedAddonSettingsRenderer
        key={JSON.stringify({ addonId, scope, activeCapability })}
        addonId={addonId}
        activeCapability={activeCapability}
        addon={addon}
        scope={scope}
        hideHeader={hideHeader}
      />
    )
  }

  return (
    <WorkspaceSubSidebarSettingsManager
      addonId={addonId}
      activeCapability={activeCapability}
      activeCapabilityLabel={activeCapabilityLabel}
      activeCapabilityDescription={activeCapabilityDescription}
      addon={addon}
      hideHeader={hideHeader}
    />
  )
}

function WorkspaceSubSidebarSettingsManager({
  addonId,
  activeCapability,
  activeCapabilityLabel,
  activeCapabilityDescription,
  addon,
  hideHeader,
}: {
  addonId: string
  activeCapability?: string
  activeCapabilityLabel?: string
  activeCapabilityDescription?: string
  addon?: AddonManifestViewModel | null
  hideHeader?: boolean
}) {
  const bridge = useHostBridge()
  const workspaceContext = useContext(WorkspaceContext)
  const activeRouteWorkspaceId = workspaceContext?.workspace?.id
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')

  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useQuery<
    WorkspaceViewModel[]
  >({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await bridge.workspaces.listAll()
      if (!res.isSuccess) throw new Error(res.error)
      if (!res.data) return []
      return res.data
    },
  })

  const { data: installedList = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess) throw new Error(res.error)
      if (!res.data) return []
      return res.data
    },
  })

  const resolvedAddon = useMemo(() => {
    if (addon) return addon
    return installedList.find((a) => a.id === addonId) ?? null
  }, [addon, installedList, addonId])

  const isDataSource = useMemo(() => {
    if (!resolvedAddon) return false
    return addonMatchesCategory(resolvedAddon, 'dataSource')
  }, [resolvedAddon])

  const activeWorkspace = useMemo(() => {
    if (selectedWorkspaceId) {
      const match = workspaces.find((ws) => ws.id === selectedWorkspaceId)
      if (match) return match
    }
    if (activeRouteWorkspaceId) {
      const currentMatch = workspaces.find(
        (ws) => ws.id === activeRouteWorkspaceId,
      )
      if (currentMatch) return currentMatch
    }
    return firstWorkspace(workspaces)
  }, [workspaces, selectedWorkspaceId, activeRouteWorkspaceId])

  if (isLoadingWorkspaces) {
    return (
      <div
        className="flex flex-1 flex-row overflow-hidden"
        aria-label="Carregando workspaces"
      >
        <div className="border-border/50 w-52 shrink-0 space-y-2 border-r p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (workspaces.length === 0 || !activeWorkspace) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <FolderKanban className="text-muted-foreground/40 mb-3 size-10" />
        <h3 className="text-foreground text-sm font-semibold">
          Nenhum workspace encontrado
        </h3>
        <p className="text-muted-foreground mt-1 max-w-sm text-xs">
          As conexÃµes e capacidades pertencem aos Workspaces. Crie ou abra um
          workspace para configurar esta extensÃ£o.
        </p>
      </div>
    )
  }

  const renderWorkspaceCapabilityContent = (ws: WorkspaceViewModel) => {
    if (activeCapability === 'dataSource') {
      return (
        <WorkspaceGroupedDataSourceManager
          key={`ds-cap-${addonId}-${ws.id}`}
          addonId={addonId}
          workspaceId={ws.id}
          mode="dataSource"
        />
      )
    }

    if (activeCapability === 'auth' && isDataSource) {
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
          <WorkspaceGroupedDataSourceManager
            key={`ds-auth-${addonId}-${ws.id}`}
            addonId={addonId}
            workspaceId={ws.id}
            mode="auth"
          />
          <ScopedAddonSettingsRenderer
            key={`scoped-auth-${addonId}-${ws.id}`}
            addonId={addonId}
            activeCapability="auth"
            addon={resolvedAddon}
            scope={{ kind: 'workspace', workspaceId: ws.id }}
            hideHeader={true}
            hideWhenEmpty={true}
          />
        </div>
      )
    }

    if (!activeCapability && isDataSource) {
      return (
        <WorkspaceGroupedDataSourceManager
          key={`ds-default-${addonId}-${ws.id}`}
          addonId={addonId}
          workspaceId={ws.id}
          mode="auth"
        />
      )
    }

    return (
      <ScopedAddonSettingsRenderer
        key={JSON.stringify({
          addonId,
          workspaceId: ws.id,
          activeCapability,
        })}
        addonId={addonId}
        activeCapability={activeCapability}
        addon={resolvedAddon}
        scope={{ kind: 'workspace', workspaceId: ws.id }}
        hideHeader={hideHeader}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      {/* Coluna 2: Sub-sidebar de Workspaces */}
      <aside
        data-testid="addon-workspaces-sidebar"
        className="border-border/50 bg-muted/10 flex min-h-0 w-64 shrink-0 flex-col border-r select-none"
      >
        <div className="border-border/40 flex items-center justify-between border-b px-3.5 py-2.5">
          <span className="text-muted-foreground/80 text-[11px] font-bold tracking-wider uppercase">
            Workspaces
          </span>
          <Badge
            variant="outline"
            className="px-1.5 py-0 font-mono text-[10px]"
          >
            {workspaces.length}
          </Badge>
        </div>

        <ScrollArea className="flex-1 p-2">
          <div className="space-y-1">
            {workspaces.map((ws) => {
              const isSelected = ws.id === activeWorkspace.id

              return (
                <button
                  key={ws.id}
                  type="button"
                  title={ws.name}
                  data-testid={`addon-workspace-tab-${ws.id}`}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                    isSelected
                      ? 'bg-primary/10 text-primary border-primary/20 border font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Avatar className="border-border/40 size-6 shrink-0 rounded-md border">
                    <AvatarImage
                      src={ws.avatarUrl}
                      alt={ws.name}
                      className="size-full object-cover"
                    />
                    <AvatarFallback className="bg-primary/10 text-primary rounded-md text-[10px] font-semibold">
                      {ws.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </aside>

      {/* Coluna 3: Outlet da Capacidade no Workspace Selecionado */}
      <div
        data-testid={`workspace-addon-group-${activeWorkspace.id}`}
        className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {activeCapabilityLabel && (
          <div className="border-border/40 bg-muted/5 flex shrink-0 items-center justify-between border-b px-6 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-foreground text-sm font-semibold">
                  {activeCapabilityLabel}
                </h3>
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {activeWorkspace.name}
                </Badge>
              </div>
              {activeCapabilityDescription && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {activeCapabilityDescription}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {renderWorkspaceCapabilityContent(activeWorkspace)}
        </div>
      </div>
    </div>
  )
}

function ScopedAddonSettingsRenderer({
  addonId,
  activeCapability,
  addon,
  scope,
  hideHeader,
  hideWhenEmpty = false,
}: {
  addonId: string
  activeCapability?: string
  addon?: AddonManifestViewModel | null
  scope: AddonVaultScope
  hideHeader?: boolean
  hideWhenEmpty?: boolean
}) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const workspaceId = scope.kind === 'workspace' ? scope.workspaceId : undefined
  const settingsQueryKey = ['addon-settings', addonId, scope]
  const pendingRebasePatch = useRef<AddonSettingsValues | null>(null)

  const loadSettings = async () => {
    const res = await bridge.addons.getSettings({ body: { addonId, scope } })
    if (!res.isSuccess) throw new Error(res.error)
    if (res.data === undefined) return emptySettings
    return res.data
  }

  const { data: schema, isLoading: isLoadingSchema } = useQuery({
    queryKey: ['addon-schema', addonId, scope],
    queryFn: async () => {
      const res = await bridge.addons.getSchema({
        body: { addonId, scope },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res.data
    },
  })

  const { data: savedSettings = emptySettings, isLoading: isLoadingSettings } =
    useQuery({
      queryKey: ['addon-settings', addonId, scope],
      queryFn: loadSettings,
    })

  const currentScopeStr = JSON.stringify(scope)
  const lastScopeStr = useRef(currentScopeStr)
  const draftsByScope = useRef<
    Record<
      string,
      {
        formValues: Record<string, string | number | boolean | null>
        credentialValues: Record<string, string>
      }
    >
  >({})
  const [formValues, setFormValues] = useState<
    Record<string, string | number | boolean | null>
  >({})
  const [credentialValues, setCredentialValues] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    if (lastScopeStr.current !== currentScopeStr) {
      draftsByScope.current[lastScopeStr.current] = {
        formValues,
        credentialValues,
      }
      lastScopeStr.current = currentScopeStr
      pendingRebasePatch.current = null
      const existingDraft = draftsByScope.current[currentScopeStr]
      if (existingDraft !== undefined) {
        setFormValues({ ...existingDraft.formValues })
        setCredentialValues({ ...existingDraft.credentialValues })
        return
      }
      setFormValues(savedSettings ? { ...savedSettings.values } : {})
      setCredentialValues({})
      return
    }
    if (savedSettings) {
      const existingDraft = draftsByScope.current[currentScopeStr]
      if (existingDraft !== undefined) {
        return
      }
      const pendingPatch = pendingRebasePatch.current
      let nextValues = { ...savedSettings.values }
      if (pendingPatch !== null) {
        nextValues = rebaseAddonSettings(nextValues, pendingPatch)
        pendingRebasePatch.current = null
      }
      setFormValues(nextValues)
      setCredentialValues({})
    }
  }, [savedSettings, currentScopeStr])

  type SettingsSaveFailureReason =
    | { kind: 'conflict'; statusCode: 409; messageKey: string }
    | { kind: 'credential_partial'; fieldId: string; error: string }
    | { kind: 'generic'; error: string }

  function resolveSettingsSaveErrorMessage(
    reason: SettingsSaveFailureReason,
  ): string {
    if (reason.kind === 'generic') {
      return reason.error
    }
    return reason.kind
  }

  class SettingsSaveError extends Error {
    constructor(public readonly reason: SettingsSaveFailureReason) {
      super(resolveSettingsSaveErrorMessage(reason))
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (input: {
      scope: AddonVaultScope
      expectedRevision: number
      patch: AddonSettingsValues
      credentials: Record<string, string>
    }) => {
      const submittedCredentials: Record<string, string | null> = {}
      for (const [fieldId, value] of Object.entries(input.credentials)) {
        let submittedValue: string | null = value
        if (value.length === 0) {
          submittedValue = null
        }
        submittedCredentials[fieldId] = submittedValue
      }

      const res = await bridge.addons.saveSettings({
        body: {
          addonId,
          scope: input.scope,
          expectedRevision: input.expectedRevision,
          patch: input.patch,
          credentials: submittedCredentials,
        },
      })
      if (!res.isSuccess) {
        if (res.statusCode === 409) {
          let conflictMessage = 'REVISION_CONFLICT'
          if (res.error !== undefined && res.error.length > 0) {
            conflictMessage = res.error
          }
          throw new SettingsSaveError({
            kind: 'conflict',
            statusCode: 409,
            messageKey: conflictMessage,
          })
        }
        if (
          res.statusCode === 207 ||
          res.error === 'ADDON_CREDENTIAL_PARTIAL_FAILURE'
        ) {
          let partialError = 'ADDON_CREDENTIAL_PARTIAL_FAILURE'
          if (res.error !== undefined && res.error.length > 0) {
            partialError = res.error
          }
          throw new SettingsSaveError({
            kind: 'credential_partial',
            fieldId: '',
            error: partialError,
          })
        }
        let genericError = 'FAILED_TO_SAVE_SETTINGS'
        if (res.error !== undefined && res.error.length > 0) {
          genericError = res.error
        }
        throw new SettingsSaveError({
          kind: 'generic',
          error: genericError,
        })
      }
      return res
    },
    onSuccess: (result, input) => {
      toast.success('Configurações salvas com sucesso!')
      delete draftsByScope.current[JSON.stringify(input.scope)]
      queryClient.invalidateQueries({
        queryKey: ['addon-settings', addonId, input.scope],
      })
    },
    onError: async (err: Error, input) => {
      if (err instanceof SettingsSaveError && err.reason.kind === 'conflict') {
        pendingRebasePatch.current = input.patch
        await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
        const latest = await queryClient.fetchQuery({
          queryKey: settingsQueryKey,
          queryFn: loadSettings,
        })
        const rebased = rebaseAddonSettings(latest.values, input.patch)
        setFormValues(rebased)
        toast.error(
          'As configurações mudaram. Seus campos foram reaplicados sobre a revisão atual; revise e salve novamente.',
        )
        return
      }
      if (
        err instanceof SettingsSaveError &&
        err.reason.kind === 'credential_partial'
      ) {
        setCredentialValues({})
        await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
        const latest = await queryClient.fetchQuery({
          queryKey: settingsQueryKey,
          queryFn: loadSettings,
        })
        setFormValues({ ...latest.values })
        toast.error(
          'As configurações foram salvas, mas uma credencial falhou. O estado foi recarregado; confira os indicadores antes de tentar novamente.',
        )
        return
      }
      toast.error(err.message)
    },
  })

  const handleFieldChange = (
    fieldId: string,
    value: string | number | boolean | null,
  ) => {
    const field = findSettingsField(schema || [], fieldId)
    if (field?.scope === 'credential') {
      setCredentialValues((previous) => ({
        ...previous,
        [fieldId]: isString(value) ? value : '',
      }))
      return
    }
    setFormValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const handleReset = () => {
    setFormValues({ ...savedSettings.values })
    setCredentialValues({})
    toast.info('AlteraÃ§Ãµes descartadas.')
  }

  const handleSave = () => {
    const patch: AddonSettingsValues = {}
    for (const [fieldId, value] of Object.entries(formValues)) {
      if (savedSettings.values[fieldId] !== value) patch[fieldId] = value
    }
    saveMutation.mutate({
      scope,
      expectedRevision: savedSettings.revision,
      patch,
      credentials: credentialValues,
    })
  }

  const fieldValue = (field: AddonSettingsField) => {
    if (field.scope === 'credential') {
      const pendingValue = credentialValues[field.id]
      if (pendingValue === undefined) return ''
      return pendingValue
    }
    return formValues[field.id]
  }

  const { data: installedList = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess) throw new Error(res.error)
      if (!res.data) return []
      return res.data
    },
  })

  const currentAddon = installedList.find((a) => a.id === addonId)
  const isDataSource = currentAddon
    ? addonMatchesCategory(currentAddon, 'dataSource')
    : false
  const { data: connectionProfiles = [] } = useQuery<
    ConnectionProfileDescriptor[]
  >({
    queryKey: ['addon-connection-profiles', addonId],
    queryFn: async () => {
      const result = await bridge.addons.getConnectionProfiles({
        body: { addonId },
      })
      if (!result.isSuccess || !result.data)
        throw new Error(result.error ?? 'CONNECTION_PROFILES_UNAVAILABLE')
      return result.data
    },
    enabled: isDataSource,
  })

  if (isLoadingSchema || isLoadingSettings) {
    if (hideWhenEmpty) return null
    return (
      <div
        className="flex flex-1 flex-col gap-4 p-6"
        aria-label="Carregando configuraÃ§Ãµes"
      >
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const allTabs = settingsTabs(schema || [])
  const isAuthTab = (t: AddonSettingsTab) => t.kind === 'auth'

  const authTabs = allTabs.filter(isAuthTab)
  const capabilityTabs = allTabs.filter((t) => !isAuthTab(t))

  if (activeCapability === 'auth') {
    if (authTabs.length === 0) {
      if (hideWhenEmpty) return null
      return (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center p-8 text-center text-sm">
          <Check className="mb-2 size-8 text-emerald-500/80" />
          <span className="text-foreground font-semibold">
            AutenticaÃ§Ã£o AutomÃ¡tica
          </span>
          <p className="mt-1 max-w-sm text-xs">
            Esta extensÃ£o nÃ£o requer credenciais manuais neste workspace.
          </p>
        </div>
      )
    }

    return (
      <div className="bg-card/50 flex h-full flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-auto px-6 py-5">
          <div
            data-testid={`addon-workspace-auth-section-${addonId}`}
            className="border-border/60 bg-muted/15 space-y-4 rounded-lg border p-4"
          >
            {authTabs.map((authTab) => (
              <div key={authTab.id} className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="text-sm font-semibold">{authTab.label}</h3>
                    {authTab.description && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {authTab.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {connectionProfiles.map((profile) => (
                      <Badge
                        key={profile.connectionProfileId}
                        variant="outline"
                        className="font-mono text-[10px]"
                        data-testid={`addon-auth-cardinality-${profile.cardinality}`}
                      >
                        {profile.connectionProfileId}: {profile.cardinality}
                      </Badge>
                    ))}
                  </div>
                </div>

                {authTab.groups
                  ? authTab.groups.map((group) => (
                      <div key={group.id} className="space-y-3">
                        <div>
                          <h4 className="text-xs font-medium">{group.label}</h4>
                          {group.description && (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {group.description}
                            </p>
                          )}
                        </div>
                        <div className="grid w-full gap-4">
                          {group.fields.map((field) => (
                            <FieldRenderer
                              key={field.id}
                              field={field}
                              addonId={addonId}
                              workspaceId={workspaceId}
                              value={fieldValue(field)}
                              credentialConfigured={
                                savedSettings.credentialStates[field.id] ===
                                'configured'
                              }
                              onChange={handleFieldChange}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  : authTab.fields?.map((field) => (
                      <div key={field.id} className="grid w-full gap-4">
                        <FieldRenderer
                          field={field}
                          addonId={addonId}
                          workspaceId={workspaceId}
                          value={fieldValue(field)}
                          credentialConfigured={
                            savedSettings.credentialStates[field.id] ===
                            'configured'
                          }
                          onChange={handleFieldChange}
                        />
                      </div>
                    ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const matchingTab = activeCapability
    ? capabilityTabs.find((t) => t.id === activeCapability)
    : undefined

  const tabs: AddonSettingsTab[] = matchingTab ? [matchingTab] : capabilityTabs

  if (tabs.length === 0) {
    if (hideWhenEmpty) return null

    if (!activeCapability && isDataSource) {
      return (
        <WorkspaceGroupedDataSourceManager
          addonId={addonId}
          workspaceId={workspaceId}
          mode="auth"
        />
      )
    }

    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center p-8 text-center text-sm">
        <Check className="mb-2 size-8 text-emerald-500/80" />
        <span className="text-foreground font-semibold">MÃ³dulo Ativo</span>
        <p className="mt-1 max-w-sm text-xs">
          Esta extensÃ£o estÃ¡ ativa e operando em segundo plano.
        </p>
      </div>
    )
  }

  const defaultTab = initialSettingsTab(tabs)

  const tabHasEditableFields = (tab: AddonSettingsTab) => {
    if (tab.requiresAuth && tab.isAuthenticated === false) {
      return false
    }
    if (tab.groups && tab.groups.length > 0) {
      return tab.groups.some((group) =>
        group.fields.some(
          (field) =>
            field.type !== 'button' &&
            field.type !== 'info-card' &&
            field.type !== 'datasource-instances',
        ),
      )
    }
    if (tab.fields && tab.fields.length > 0) {
      return tab.fields.some(
        (field) =>
          field.type !== 'button' &&
          field.type !== 'info-card' &&
          field.type !== 'datasource-instances',
      )
    }
    return false
  }

  const hasEditableFields = tabs.some(tabHasEditableFields)

  let headerTitle = addonId
  if (currentAddon?.name) headerTitle = currentAddon.name
  if (addon?.name) headerTitle = addon.name

  return (
    <div className="bg-card/50 flex h-full flex-1 flex-col">
      {!hideHeader && (
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">{headerTitle}</h2>
          <p className="text-muted-foreground text-sm">
            Configure os parÃ¢metros deste addon
          </p>
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-auto px-6 py-5">
        <Tabs defaultValue={defaultTab} className="w-full">
          {tabs.length > 1 && (
            <TabsList className="mb-4">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {tabs.map((tab) => {
            const isAuthLocked = Boolean(
              tab.requiresAuth && tab.isAuthenticated === false,
            )
            return (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="m-0 space-y-6"
              >
                {tab.description && (
                  <p className="text-muted-foreground mb-4 text-sm">
                    {tab.description}
                  </p>
                )}

                {isAuthLocked && (
                  <div
                    data-testid="addon-capability-auth-required-banner"
                    className="border-border/70 bg-muted/30 text-muted-foreground rounded-md border border-dashed px-3.5 py-2.5 text-xs"
                  >
                    Conecte uma conta na aba <strong>AutenticaÃ§Ã£o</strong>{' '}
                    deste Workspace para habilitar e configurar esta capacidade.
                  </div>
                )}

                <div
                  className={
                    isAuthLocked
                      ? 'pointer-events-none space-y-6 opacity-50 select-none'
                      : 'space-y-6'
                  }
                >
                  {tab.groups
                    ? tab.groups.map((group) => (
                        <div key={group.id} className="space-y-4">
                          <div className="border-b pb-2">
                            <h3 className="text-sm font-medium">
                              {group.label}
                            </h3>
                            {group.description && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                {group.description}
                              </p>
                            )}
                          </div>
                          <div className="grid w-full gap-4">
                            {group.fields.map((field) => (
                              <FieldRenderer
                                key={field.id}
                                field={field}
                                addonId={addonId}
                                workspaceId={workspaceId}
                                value={fieldValue(field)}
                                credentialConfigured={
                                  savedSettings.credentialStates[field.id] ===
                                  'configured'
                                }
                                onChange={handleFieldChange}
                                disabled={isAuthLocked}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    : tab.fields?.map((field) => (
                        <div key={field.id} className="grid w-full gap-4">
                          <FieldRenderer
                            field={field}
                            addonId={addonId}
                            workspaceId={workspaceId}
                            value={fieldValue(field)}
                            credentialConfigured={
                              savedSettings.credentialStates[field.id] ===
                              'configured'
                            }
                            onChange={handleFieldChange}
                            disabled={isAuthLocked}
                          />
                        </div>
                      ))}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>

      {hasEditableFields && (
        <div className="bg-muted/20 flex justify-end gap-2 border-t px-6 py-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saveMutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}

function DataSourceInstancesManager({ addonId }: { addonId: string }) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const connectionsCtx = useDataSourceConnections()
  const {
    workspaceId,
    connections: connectionState,
    disconnect,
    link,
    connect,
  } = connectionsCtx

  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )
  const [connectionTargetProfileId, setConnectionTargetProfileId] = useState<
    string | null
  >(null)
  const [mappingTargetId, setMappingTargetId] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  )
  const { data: connectionProfiles = [] } = useQuery<
    ConnectionProfileDescriptor[]
  >({
    queryKey: ['addons', addonId, 'connection-profiles'],
    queryFn: async () => {
      const result = await bridge.addons.getConnectionProfiles({
        body: { addonId },
      })
      if (!result.isSuccess || !result.data)
        throw new Error(result.error ?? 'CONNECTION_PROFILES_UNAVAILABLE')
      return result.data
    },
  })
  const selectedProfile = connectionProfiles.find(
    (profile) => profile.connectionProfileId === selectedProfileId,
  )
  const onlyProfile = connectionProfiles.find(() => true)
  const profileForNewConnection =
    connectionProfiles.length === 1 ? onlyProfile : selectedProfile

  const unlinkMutation = useMutation({
    mutationFn: (connectionInstanceId: string) =>
      connectionsCtx.unlink(connectionInstanceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const connectMutation = useMutation({
    mutationFn: (data: DataSourceInstanceFormData) =>
      connect({
        connectionInstanceId: data.connectionInstanceId,
        pluginId: data.pluginId,
        connectionProfileId: data.connectionProfileId,
        credentials: data.credentials,
        configuration: data.configuration,
      }),
    onSuccess: (res) => {
      if (!res?.isSuccess || !res.data) {
        let errorMsg = 'Falha ao conectar'
        if (res?.error) errorMsg = res.error
        toast.error(errorMsg)
        return
      }
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      let label = 'Instância'
      if (res.data.identity && res.data.identity.displayName) {
        label = res.data.identity.displayName
      }
      if (label === 'Instância' && res.data.member && res.data.member.login) {
        label = res.data.member.login
      }
      toast.success(`${label} conectado`)
      setConnectionDialogOpen(false)
      setConnectionTargetId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleAddConnection = async () => {
    if (!profileForNewConnection) {
      toast.error('Selecione o perfil de conexÃ£o no gerenciador de conexÃµes.')
      return
    }
    const unique = crypto.randomUUID().slice(0, 8)
    const newId = `${addonId}-${unique}`
    try {
      const result = await link({
        pluginId: addonId,
        connectionInstanceId: newId,
        connectionProfileId: profileForNewConnection.connectionProfileId,
      })
      if (!result?.isSuccess) {
        toast.error(result?.error ?? 'Falha ao vincular DataSource')
        return
      }
      setConnectionTargetId(newId)
      setConnectionTargetProfileId(profileForNewConnection.connectionProfileId)
      setConnectionDialogOpen(true)
    } catch {
      // Handled in onError
    }
  }

  const myConnections: AddonConnection[] = connectionState
    .filter((c) => c.dataSourceId === addonId)
    .map((c) => ({
      id: c.connectionId,
      name: resolveConnectionName(c.config, c.connectionId),
      url: resolveConnectionUrl(c.config),
      status: resolveConnectionStatus(c.status),
    }))
  const connectionTargetProfile = connectionProfiles.find(
    (profile) => profile.connectionProfileId === connectionTargetProfileId,
  )

  return (
    <div
      data-testid={`addon-setting-card-${addonId}`}
      className="space-y-4 py-2"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="text-sm font-medium">InstÃ¢ncias Conectadas</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Gerencie mÃºltiplas conexÃµes para este DataSource.
          </p>
        </div>
        <Button
          data-testid={`add-instance-btn-${addonId}`}
          size="sm"
          onClick={handleAddConnection}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Nova InstÃ¢ncia
        </Button>
      </div>
      {connectionProfiles.length > 1 && (
        <label className="flex max-w-sm flex-col gap-2 text-xs">
          <span>Perfil de conexão</span>
          <select
            aria-label="Perfil de conexão"
            value={resolveProfileSelectionValue(
              connectionProfiles,
              selectedProfileId,
            )}
            onChange={(event) =>
              setSelectedProfileId(event.currentTarget.value)
            }
            className="border-border bg-background rounded-md border px-3 py-2"
          >
            <option value="">Selecione um perfil</option>
            {connectionProfiles.map((profile) => (
              <option
                key={profile.connectionProfileId}
                value={profile.connectionProfileId}
              >
                {profile.connectionProfileId}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="space-y-3">
        {myConnections.length > 0 ? (
          myConnections.map((conn) => (
            <div key={conn.id} className="space-y-1">
              <ConnectionCard
                connection={conn}
                onOpenSettings={(c) => {
                  setConnectionTargetId(c.id)
                  const linkedConnection =
                    connectionsCtx.workspaceConnections.find(
                      (connection) => connection.id === c.id,
                    )
                  if (linkedConnection)
                    setConnectionTargetProfileId(
                      linkedConnection.connectionProfileId,
                    )
                  setConnectionDialogOpen(true)
                }}
                onDisconnect={(c) => disconnect(c.id)}
                onUninstall={(c) => unlinkMutation.mutate(c.id)}
              />
              {conn.status === 'connected' && workspaceId && (
                <div className="flex justify-end px-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    data-testid={`configure-mapping-instance-btn-${conn.id}`}
                    onClick={() => setMappingTargetId(conn.id)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Configurar Mapeamento
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-muted-foreground border-border/50 bg-muted/20 rounded-lg border border-dashed py-8 text-center text-sm">
            Nenhuma instÃ¢ncia conectada.
          </div>
        )}
      </div>

      {workspaceId && mappingTargetId && (
        <MappingConfigModal
          open={Boolean(mappingTargetId)}
          onOpenChange={(open) => {
            if (!open) setMappingTargetId(null)
          }}
          addonId={addonId}
          workspaceId={workspaceId}
          connectionInstanceId={mappingTargetId}
          onSave={() => setMappingTargetId(null)}
        />
      )}

      <Dialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar InstÃ¢ncia</DialogTitle>
            <DialogDescription>
              Preencha as configuraÃ§Ãµes de conexÃ£o para esta instÃ¢ncia.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 pr-1">
            {connectionTargetId && connectionTargetProfile && (
              <NewDataSourceInstanceForm
                pluginId={addonId}
                connectionInstanceId={connectionTargetId}
                connectionProfileId={
                  connectionTargetProfile.connectionProfileId
                }
                isSubmitting={connectMutation.isPending}
                onSubmit={(data) => connectMutation.mutate(data)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FieldRenderer({
  field,
  addonId,
  workspaceId,
  value,
  onChange,
  disabled,
  credentialConfigured,
}: {
  field: AddonSettingsField
  addonId: string
  workspaceId: string | undefined
  value: string | number | boolean | null | undefined
  onChange: (fieldId: string, value: string | number | boolean | null) => void
  disabled?: boolean
  credentialConfigured: boolean
}) {
  return (
    <AddonFieldRenderer
      field={field}
      addonId={addonId}
      workspaceId={workspaceId}
      value={value}
      onChange={onChange}
      disabled={disabled}
      credentialConfigured={credentialConfigured}
      renderDataSourceInstances={(id) => (
        <DataSourceInstancesManager addonId={id} />
      )}
    />
  )
}

/** Canonical boundary for the two settings schema representations. */
function isSettingsField(
  item: AddonSettingsField | AddonSettingsTab,
): item is AddonSettingsField {
  return 'type' in item
}
function settingsTabs(schema: AddonSettingsSchema): AddonSettingsTab[] {
  const tabs: AddonSettingsTab[] = []
  const fields: AddonSettingsField[] = []
  for (const item of schema) {
    if (isSettingsField(item)) {
      fields.push(item)
      continue
    }
    tabs.push(item)
  }
  if (fields.length > 0) tabs.push({ id: 'general', label: 'Geral', fields })
  return tabs
}

function findSettingsField(
  schema: AddonSettingsSchema,
  fieldId: string,
): AddonSettingsField | undefined {
  for (const item of schema) {
    if (isSettingsField(item) && item.id === fieldId) return item
    if (!isSettingsField(item)) {
      const direct = item.fields?.find((field) => field.id === fieldId)
      if (direct !== undefined) return direct
      if (item.groups !== undefined) {
        for (const group of item.groups) {
          const grouped = group.fields.find((field) => field.id === fieldId)
          if (grouped !== undefined) return grouped
        }
      }
    }
  }
  return undefined
}
function initialSettingsTab(tabs: AddonSettingsTab[]): string | undefined {
  for (const tab of tabs) return tab.id
  return undefined
}
