import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  AddonSettingsSnapshot,
  CreatedTaskResult,
  CreatedTimeEntryResult,
  IAddonAccessService,
  IAddonSettingsRepository,
  ICoreAddonCapabilities,
  IHttpClient,
  ILocalRuntimeAPI,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MemberDTO,
  MetadataDTO,
  OAuthAttemptCoordinator,
  PagedResultDTO,
  TaskDTO,
  TimeEntryDTO,
  TimeEntryPullPageDTO,
  UpdatedTaskResult,
  UpdatedTimeEntryResult,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import { unavailableCore } from '../../core/addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyWorkspaceReferenceRegistry,
} from '../../core/addon-workspace-reference-test-fixture'
import { AddonLoader } from '../AddonLoader'

const credentials = emptyAddonCredentialsVault()
const runtime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
  }),
}
const access: IAddonAccessService = {
  authorizeFiles: async () =>
    Either.failure(AppError.Unauthorized('PLUS_REQUIRED')),
  authorizeDirectory: async () =>
    Either.failure(AppError.Unauthorized('PLUS_REQUIRED')),
}

const fakeHttpClient: IHttpClient = {
  get: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
  post: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
  put: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
  patch: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
  delete: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
  withConfig: () => fakeHttpClient,
}

function createLoader(
  coreProvider?: (addonId: string) => ICoreAddonCapabilities,
  customCredentials?: ReturnType<typeof emptyAddonCredentialsVault>,
): AddonLoader {
  const snapshots = new Map<string, AddonSettingsSnapshot>()
  const settingsRepo: IAddonSettingsRepository = {
    ...emptyAddonSettingsRepository,
    read: async (addonId, scopeKey) => {
      const existing = snapshots.get(`${addonId}:${scopeKey}`)
      if (existing) {
        return Either.success(existing)
      }
      return Either.success({
        schemaVersion: 1,
        revision: 0,
        values: {},
      })
    },
    patch: async (addonId, scopeKey, expectedRevision, patchValues) => {
      const key = `${addonId}:${scopeKey}`
      const existing = snapshots.get(key)
      const current: AddonSettingsSnapshot = existing
        ? existing
        : {
            schemaVersion: 1,
            revision: 0,
            values: {},
          }
      if (current.revision !== expectedRevision) {
        return Either.failure(
          AppError.ValidationError('SETTINGS_REVISION_CONFLICT'),
        )
      }
      const nextRevision = current.revision + 1
      const nextSnapshot: AddonSettingsSnapshot = {
        schemaVersion: 1,
        revision: nextRevision,
        values: { ...current.values, ...patchValues },
      }
      snapshots.set(key, nextSnapshot)
      return Either.success(nextSnapshot)
    },
  }
  return new AddonLoader(
    customCredentials ?? credentials,
    runtime,
    '0.4.0',
    coreProvider ?? (() => unavailableCore),
    access,
    emptyWorkspaceReferenceRegistry,
    settingsRepo,
    new AddonAuthenticatorRegistry(),
    new AddonConnectionProfilesResolver(),
    new OAuthAttemptCoordinator(),
  )
}

const fakeTasksProvider: ITaskProvider = {
  pull: async () => Either.success<TaskDTO[], AppError>([]),
  findAll: async () =>
    Either.success<PagedResultDTO<TaskDTO>, AppError>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
  findById: async () => Either.success<TaskDTO | null, AppError>(null),
  create: async () =>
    Either.success<CreatedTaskResult, AppError>({ id: 't-1' }),
  update: async () =>
    Either.success<UpdatedTaskResult, AppError>({ id: 't-1' }),
  delete: async () => Either.success<void, AppError>(undefined),
}

const fakeMembersProvider: IMemberProvider = {
  getCurrentUser: async () => Either.success<MemberDTO | null, AppError>(null),
  findById: async () => Either.success<MemberDTO | null, AppError>(null),
  findByCredentials: async () =>
    Either.failure(AppError.Unauthorized('NOT_SUPPORTED')),
  findAll: async () =>
    Either.success<PagedResultDTO<MemberDTO>, AppError>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
}

const fakeMetadataProvider: IMetadataProvider = {
  getMetadata: async () =>
    Either.success<MetadataDTO, AppError>({
      taskStatuses: [],
      taskPriorities: [],
      activities: [],
      trackStatuses: [],
      participantRoles: [],
      estimationTypes: [],
    }),
}

const fakeTimeEntriesProvider: ITimeEntryProvider = {
  pull: async () =>
    Either.success<TimeEntryPullPageDTO, AppError>({
      items: [],
      checkpoint: { updatedAt: new Date(), id: '0' },
      hasMore: false,
      snapshotId: 'snap-1',
    }),
  findByMemberId: async () =>
    Either.success<PagedResultDTO<TimeEntryDTO>, AppError>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
  create: async () =>
    Either.success<CreatedTimeEntryResult, AppError>({ id: 'te-1' }),
  update: async () =>
    Either.success<UpdatedTimeEntryResult, AppError>({ id: 'te-1' }),
  delete: async () => Either.success<void, AppError>(undefined),
  findById: async () => Either.success<TimeEntryDTO | null, AppError>(null),
  findAll: async () =>
    Either.success<PagedResultDTO<TimeEntryDTO>, AppError>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    }),
}

export {
  access,
  createLoader,
  credentials,
  fakeHttpClient,
  fakeMembersProvider,
  fakeMetadataProvider,
  fakeTasksProvider,
  fakeTimeEntriesProvider,
  runtime,
}
