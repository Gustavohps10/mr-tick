import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  AddonStorageListPage,
  AddonStorageListRequest,
  IAddonStorageAPI,
} from '../../../contracts/addons/storage/IAddonStorageAPI'
import type { IAddonStorageRepository } from '../../../contracts/addons/storage/IAddonStorageRepository'
import type { AddonVaultScope } from '../../../contracts/addons/vault/IAddonVaultAPI'

export function serializeAddonStorageScopeKey(scope: AddonVaultScope): string {
  if (scope.kind === 'addon') return 'addon'
  if (scope.kind === 'workspace') return `workspace:${scope.workspaceId}`
  if (scope.kind === 'connection') {
    return `connection:${scope.workspaceId}:${scope.connectionInstanceId}`
  }
  return `capability:${scope.workspaceId}:${scope.connectionInstanceId}:${scope.capabilityId}`
}

export class AddonScopedStorage implements IAddonStorageAPI {
  constructor(
    private readonly addonId: string,
    private readonly repository: IAddonStorageRepository,
  ) {}

  public async get(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    if (!isNonEmptyString(this.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(key)) {
      return Either.failure(AppError.ValidationError('STORAGE_KEY_REQUIRED'))
    }
    const scopeKey = serializeAddonStorageScopeKey(scope)
    return this.repository.get(this.addonId, scopeKey, key)
  }

  public async set(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(this.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(key)) {
      return Either.failure(AppError.ValidationError('STORAGE_KEY_REQUIRED'))
    }
    const scopeKey = serializeAddonStorageScopeKey(scope)
    return this.repository.set(this.addonId, scopeKey, key, value)
  }

  public async delete(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(this.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(key)) {
      return Either.failure(AppError.ValidationError('STORAGE_KEY_REQUIRED'))
    }
    const scopeKey = serializeAddonStorageScopeKey(scope)
    return this.repository.delete(this.addonId, scopeKey, key)
  }

  public async list(
    scope: AddonVaultScope,
    request: AddonStorageListRequest,
  ): Promise<Either<AppError, AddonStorageListPage>> {
    if (!isNonEmptyString(this.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100
    ) {
      return Either.failure(AppError.ValidationError('STORAGE_LIMIT_INVALID'))
    }
    const scopeKey = serializeAddonStorageScopeKey(scope)
    return this.repository.list(this.addonId, scopeKey, request)
  }
}
