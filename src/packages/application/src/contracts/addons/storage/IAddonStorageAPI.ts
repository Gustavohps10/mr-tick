import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonVaultScope } from '../vault/IAddonVaultAPI'

export interface AddonStorageEntry {
  readonly key: string
  readonly value: string
}

export interface AddonStorageListRequest {
  readonly prefix?: string
  readonly limit: number
  readonly cursor?: string
}

export type AddonStorageListPagination =
  | { readonly hasMore: true; readonly nextCursor: string }
  | { readonly hasMore: false }

export type AddonStorageListPage = {
  readonly entries: readonly AddonStorageEntry[]
} & AddonStorageListPagination

/**
 * Durable key-value storage for addons to persist minimal journals,
 * receipts, and segments outside of user configuration and vault secrets.
 * Enforces native pagination and prefix filtering to prevent unbounded in-memory loading.
 */
export interface IAddonStorageAPI {
  get(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>>
  set(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>>
  delete(scope: AddonVaultScope, key: string): Promise<Either<AppError, void>>
  list(
    scope: AddonVaultScope,
    request: AddonStorageListRequest,
  ): Promise<Either<AppError, AddonStorageListPage>>
}
