import type {
  AddonSettingsSnapshot,
  IAddonSettingsRepository,
  IConnectionCredentialsVault,
  ICredentialsVault,
  IWorkspaceCredentialReferenceRegistry,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export const emptyWorkspaceReferenceRegistry: IWorkspaceCredentialReferenceRegistry =
  {
    reserveWorkspaceCredentialWrite: async () => Either.success(),
    commitWorkspaceCredentialWrite: async () => Either.success(),
    finishWorkspaceCredentialWrite: async () => Either.success(),
    rollbackWorkspaceCredentialWrite: async () => Either.success(),
    reserveWorkspaceCredentialDelete: async () => Either.success(),
    finishWorkspaceCredentialDelete: async () => Either.success(),
    getWorkspaceCredentialReference: async () => Either.success(undefined),
    listPendingWorkspaceCredentialReferences: async () => Either.success([]),
    unregisterWorkspaceCredentialReference: async () => Either.success(),
    listWorkspaceCredentialReferences: async () => Either.success([]),
  }

export const emptyAddonSettingsRepository: IAddonSettingsRepository = {
  read: async (addonId, scopeKey) => {
    if (addonId.length === 0 || scopeKey.length === 0)
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_ADDRESS_INVALID'),
      )
    return Either.success({ schemaVersion: 1, revision: 0, values: {} })
  },
  patch: async (addonId, scopeKey, expectedRevision, patch) => {
    if (addonId.length === 0 || scopeKey.length === 0)
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_ADDRESS_INVALID'),
      )
    if (expectedRevision !== 0)
      return Either.failure(AppError.Http(409, 'ADDON_SETTINGS_REVISION_AHEAD'))
    const snapshot: AddonSettingsSnapshot = {
      schemaVersion: 1,
      revision: Object.keys(patch).length === 0 ? 0 : 1,
      values: { ...patch },
    }
    return Either.success(snapshot)
  },
}

export function emptyAddonCredentialsVault(): ICredentialsVault &
  IConnectionCredentialsVault {
  return {
    readCredential: async () => ({ kind: 'absent' }),
    getToken: async () => ({ kind: 'absent' }),
    hasToken: async () => ({ kind: 'absent' }),
    saveToken: async () => {},
    deleteToken: async () => {},
    replaceToken: async () => {},
    writeCredential: async () => ({ kind: 'completed' }),
    removeCredential: async () => ({ kind: 'completed' }),
  }
}
