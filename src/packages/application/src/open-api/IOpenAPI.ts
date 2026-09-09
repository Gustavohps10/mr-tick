import { IHeaders, IJobResult, IRequest } from '@mr-tick/shared/transport'
import {
  AddonInstallerViewModel,
  AddonManifestViewModel,
  ConnectionResultViewModel,
  MemberViewModel,
  MetadataViewModel,
  PaginatedViewModel,
  SyncDocumentViewModel,
  TaskViewModel,
  TimeEntryViewModel,
  ViewModel,
  WorkspaceViewModel,
} from '@mr-tick/shared/view-models'

import { FileData } from '@/contracts/infra'
import {
  PushTimeEntriesInput,
  UpdateWorkspaceIdentityInput,
} from '@/contracts/use-cases'

export interface IWorkspacesAPI {
  create(
    input: IRequest<{
      name: string
      description?: string
      avatarFile?: FileData
    }>,
  ): Promise<ViewModel<WorkspaceViewModel>>

  markWorkspaceAsConfigured(
    input: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel>

  getById(
    input: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel<WorkspaceViewModel>>

  listAll(): Promise<PaginatedViewModel<WorkspaceViewModel[]>>

  getDataSourceFields(input: IRequest<{ pluginId: string }>): Promise<{
    credentials: AddonSettingsGroup[]
    configuration: AddonSettingsGroup[]
  }>

  linkDataSource(
    input: IRequest<{
      workspaceId: string
      dataSourceId: string
      connectionInstanceId: string
    }>,
  ): Promise<ViewModel<WorkspaceViewModel>>

  unlinkDataSource(
    input: IRequest<{
      workspaceId: string
      connectionInstanceId: string
    }>,
  ): Promise<ViewModel<WorkspaceViewModel>>

  connectDataSource(
    input: IRequest<{
      workspaceId: string
      pluginId: string
      connectionInstanceId: string
      credentials: Record<string, unknown>
      configuration: Record<string, unknown>
    }>,
  ): Promise<ViewModel<ConnectionResultViewModel>>

  disconnectDataSource(
    input: IRequest<{
      workspaceId: string
      connectionInstanceId: string
    }>,
  ): Promise<ViewModel>

  getConnectionMember(
    input: IRequest<{
      workspaceId: string
      connectionInstanceId: string
    }>,
  ): Promise<ViewModel<MemberViewModel | null>>

  updateIdentity(
    input: IRequest<UpdateWorkspaceIdentityInput>,
  ): Promise<ViewModel<WorkspaceViewModel>>

  delete(input: IRequest<{ workspaceId: string }>): Promise<ViewModel<void>>
}

export interface ISessionAPI {
  getCurrentUser(
    input: IRequest<{
      workspaceId: string
      connectionInstanceId: string
    }>,
  ): Promise<ViewModel<MemberViewModel>>
}

export interface ITaskAPI {
  listTasks: (
    input: IRequest<{
      workspaceId: string
      connectionInstanceId: string
    }>,
  ) => Promise<PaginatedViewModel<TaskViewModel[]>>

  pull: (
    payload: IRequest<{
      workspaceId: string
      connectionInstanceId: string
      checkpoint: { updatedAt: Date; id: string }
      batch: number
    }>,
  ) => Promise<ViewModel<TaskViewModel[]>>
}

export interface IMetadataAPI {
  pull: (
    payload: IRequest<{
      workspaceId: string
      connectionInstanceId: string
      checkpoint: { updatedAt: Date; id: string }
      batch: number
    }>,
  ) => Promise<ViewModel<MetadataViewModel>>
}

export interface ITimeEntriesAPI {
  listTimeEntries: (
    payload: IRequest<{
      workspaceId: string
      connectionInstanceId: string
      startDate: Date
      endDate: Date
    }>,
  ) => Promise<PaginatedViewModel<TimeEntryViewModel[]>>

  pull: (
    payload: IRequest<{
      workspaceId: string
      connectionInstanceId: string
      checkpoint: { updatedAt: Date; id: string }
      batch: number
    }>,
  ) => Promise<ViewModel<TimeEntryViewModel[]>>

  push: (
    payload: IRequest<PushTimeEntriesInput>,
  ) => Promise<ViewModel<SyncDocumentViewModel<TimeEntryViewModel>[]>>
}

export interface IHeadersAPI {
  setDefaultHeaders(headers: IHeaders): void
  getDefaultHeaders(): IHeaders
}

export interface ITokenStorageAPI {
  saveToken(
    request: IRequest<{
      service: string
      account: string
      token?: string
    }>,
  ): Promise<ViewModel<void>>

  getToken(
    request: IRequest<{
      service: string
      account: string
    }>,
  ): Promise<ViewModel<string | null>>

  deleteToken(
    request: IRequest<{
      service: string
      account: string
    }>,
  ): Promise<ViewModel<void>>
}

export interface AddonManifest {
  id: string
  name: string
  creator: string
  description: string
  path: string
  logo: string
  downloads: number
  version: string
  stars: number
  installed: boolean
  installerManifestUrl?: string
  sourceUrl?: string
  tags?: string[]
  category?:
    'DataSources' | 'Watchers' | 'Calendars' | 'Punch' | 'Themes' | string
}

export interface AddonInstaller {
  id: string
  packages: {
    version: string
    requiredApiVersion: string
    releaseDate: string
    downloadUrl: string
    changelog: string[]
  }[]
}

export interface AddonSidebarMenuItem {
  id: string
  label: string
  href?: string
  icon?: string
  children?: {
    id: string
    label: string
    href: string
    icon?: string
  }[]
}

export interface AddonTimerbarPopoverSubItem {
  id: string
  label: string
  icon?: string
  description?: string
  shortcut?: string
  danger?: boolean
}

export interface AddonTimerbarActionItem {
  id: string
  type: 'action'
  label?: string
  icon: string
  tooltip?: string
}

export interface AddonTimerbarPopoverItem {
  id: string
  type: 'popover'
  label?: string
  icon: string
  tooltip?: string
  items?: AddonTimerbarPopoverSubItem[]
}

export type AddonTimerbarMenuItem =
  AddonTimerbarActionItem | AddonTimerbarPopoverItem

export type AddonSettingsFieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'button'
  | 'file'
  | 'directory'
  | 'datasource-instances'
  | 'info-card'

export interface AddonSettingsOption {
  label: string
  value: string | number | boolean
}

export interface AddonSettingsField {
  id: string
  type: AddonSettingsFieldType
  label: string
  required?: boolean
  defaultValue?: any
  description?: string
  placeholder?: string
  options?: AddonSettingsOption[] // For select
  actionId?: string // For button
  variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  display?: {
    title?: string
    message?: string
    avatarUrl?: string
    data?: Record<string, string>
  } // For info-card
}

export interface AddonSettingsGroup {
  id: string
  label: string
  description?: string
  fields: AddonSettingsField[]
}

export interface AddonSettingsTab {
  id: string
  label: string
  description?: string
  groups?: AddonSettingsGroup[]
  fields?: AddonSettingsField[]
}

export type AddonSettingsSchema = AddonSettingsTab[] | AddonSettingsField[]

export interface AddonActionResponse {
  isSuccess: boolean
  error?: string
  display?: {
    title?: string
    message?: string
    avatarUrl?: string
    data?: Record<string, string>
  }
}

export interface AddonThemeViewModel {
  id: string
  name: string
  description?: string
  css: string
}

export interface IAddonsAPI {
  listAvailable(): Promise<PaginatedViewModel<AddonManifestViewModel[]>>

  listInstalled(): Promise<PaginatedViewModel<AddonManifestViewModel[]>>

  getInstalledById(
    payload: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonManifestViewModel>>

  updateLocal(payload: IRequest<AddonManifest>): Promise<ViewModel<void>>

  import(payload: IRequest<{ addon: FileData }>): Promise<ViewModel<void>>

  getInstaller(
    payload: IRequest<{ installerUrl: string }>,
  ): Promise<ViewModel<AddonInstallerViewModel>>

  install(
    payload: IRequest<{ downloadUrl: string }>,
  ): Promise<ViewModel<IJobResult>>

  uninstall(
    payload: IRequest<{ addonId: string; version?: string }>,
  ): Promise<ViewModel<void>>

  getSidebarMenus(): Promise<ViewModel<AddonSidebarMenuItem[]>>

  getTimerbarMenus(): Promise<ViewModel<AddonTimerbarMenuItem[]>>

  executeCommand(
    payload: IRequest<{ commandId: string; args?: unknown[] }>,
  ): Promise<ViewModel<unknown>>

  showToast(
    payload: IRequest<{
      type?: 'info' | 'success' | 'warning' | 'error' | 'loading'
      message: string
      title?: string
      toastId?: string
    }>,
  ): Promise<ViewModel<string>>

  dismissToast(
    payload: IRequest<{
      toastId: string
    }>,
  ): Promise<ViewModel<void>>

  getSchema(
    payload: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonSettingsSchema>>
  getSettings(
    payload: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<Record<string, unknown>>>
  saveSettings(
    payload: IRequest<{ addonId: string; settings: Record<string, unknown> }>,
  ): Promise<ViewModel<void>>
  executeAction(
    payload: IRequest<{ addonId: string; actionId: string; payload?: unknown }>,
  ): Promise<ViewModel<AddonActionResponse>>
  setActiveWorkspace(
    payload: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel<void>>
  getActiveTheme(): Promise<ViewModel<AddonThemeViewModel | null>>
  setActiveTheme(
    payload: IRequest<{ themeId: string | null }>,
  ): Promise<ViewModel<void>>
}

export interface EnvironmentInfo {
  isDevelopment: boolean
  platform?: 'win32' | 'darwin' | 'linux' | 'web' | string
}

export interface DisplayInfo {
  id: number
  label: string
  isPrimary: boolean
}

export interface MoveToDisplayInput {
  displayId: number
  windowType?: 'main' | 'widget' | string
}

export interface AppSettings {
  startMinimized?: boolean
  activeThemeId?: string | null
  allowBeta?: boolean
}

export interface RawKeyInputEvent {
  vkCode: number
  key: string
}
export type ThemeMode = 'light' | 'dark' | 'system'

export interface ISystemAPI {
  getAppVersion(): Promise<string>
  getEnvironment(): Promise<EnvironmentInfo>
  setIgnoreMouseEvents(
    payload: IRequest<{ ignore: boolean; forward: boolean }>,
  ): Promise<void>
  getDisplays(): Promise<DisplayInfo[]>
  moveToDisplay(input: IRequest<MoveToDisplayInput>): Promise<void>
  minimizeWindow(windowType?: string): Promise<void>
  maximizeWindow(windowType?: string): Promise<void>
  unmaximizeWindow(windowType?: string): Promise<void>
  closeWindow(windowType?: string): Promise<void>
  hideWindow(windowType?: string): Promise<void>
  showWindow(windowType?: string): Promise<void>
  isMaximized(windowType?: string): Promise<boolean>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>

  forceTopmost(): Promise<void>
  startKeyboardInterception(): Promise<void>
  stopKeyboardInterception(): Promise<void>
  toggleTheme(payload: IRequest<{ theme: ThemeMode }>): Promise<void>
}

export interface TimerStartInput {
  baseSeconds?: number
  initialSeconds?: number
  elapsedSeconds?: number
  mode?: 'countup' | 'countdown'
}

export interface TimerResumeInput {
  baseSeconds?: number
  initialSeconds?: number
  elapsedSeconds?: number
}

export interface ITimerAPI {
  start(input: TimerStartInput): void
  pause(): void
  resume(input?: TimerResumeInput): void
  stop(): void
}

export interface IEventAPI {
  on<T = unknown>(channel: string, handler: (data: T) => void): () => void
  emit?<T = unknown>(channel: string, data?: T): void
}

export interface UpdaterInfo {
  version: string
  releaseDate: string
}

export interface UpdaterProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface IUpdaterAPI {
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  quitAndInstall(): Promise<void>
}

export interface IOpenAPI {
  timer: ITimerAPI
  services: {
    workspaces: IWorkspacesAPI
    session: ISessionAPI
    tasks: ITaskAPI
    timeEntries: ITimeEntriesAPI
    metadata: IMetadataAPI
  }
  modules: {
    headers: IHeadersAPI
    tokenStorage: ITokenStorageAPI
    system: ISystemAPI
    updater: IUpdaterAPI
  }
  integrations: {
    addons: IAddonsAPI
  }
  events: IEventAPI
}
