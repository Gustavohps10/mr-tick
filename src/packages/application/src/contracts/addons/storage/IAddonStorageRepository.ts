import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AddonStorageListPage,
  AddonStorageListRequest,
} from './IAddonStorageAPI'

export interface IAddonStorageRepository {
  get(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, string | null>>
  set(
    addonId: string,
    scopeKey: string,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>>
  delete(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, void>>
  list(
    addonId: string,
    scopeKey: string,
    request: AddonStorageListRequest,
  ): Promise<Either<AppError, AddonStorageListPage>>
}
