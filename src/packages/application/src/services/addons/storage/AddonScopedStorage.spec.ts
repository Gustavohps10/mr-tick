import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type {
  AddonStorageListPage,
  AddonStorageListRequest,
} from '../../../contracts/addons/storage/IAddonStorageAPI'
import type { IAddonStorageRepository } from '../../../contracts/addons/storage/IAddonStorageRepository'
import { AddonScopedStorage } from './AddonScopedStorage'

class MockStorageRepository implements IAddonStorageRepository {
  public data = new Map<string, string>()

  public async get(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    const val = this.data.get(`${addonId}:${scopeKey}:${key}`) ?? null
    return Either.success(val)
  }

  public async set(
    addonId: string,
    scopeKey: string,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    this.data.set(`${addonId}:${scopeKey}:${key}`, value)
    return Either.success()
  }

  public async delete(
    addonId: string,
    scopeKey: string,
    key: string,
  ): Promise<Either<AppError, void>> {
    this.data.delete(`${addonId}:${scopeKey}:${key}`)
    return Either.success()
  }

  public async list(
    addonId: string,
    scopeKey: string,
    request: AddonStorageListRequest,
  ): Promise<Either<AppError, AddonStorageListPage>> {
    const prefix = `${addonId}:${scopeKey}:`
    const entries: { key: string; value: string }[] = []
    for (const [k, v] of this.data.entries()) {
      if (k.startsWith(prefix)) {
        const pureKey = k.slice(prefix.length)
        if (!request.prefix || pureKey.startsWith(request.prefix)) {
          entries.push({ key: pureKey, value: v })
        }
      }
    }
    entries.sort((a, b) => {
      if (a.key < b.key) return -1
      return 1
    })
    const sliced = entries.slice(0, request.limit)
    const lastEntry = sliced.at(-1)
    if (entries.length > request.limit && lastEntry !== undefined) {
      return Either.success({
        entries: sliced,
        hasMore: true,
        nextCursor: lastEntry.key,
      })
    }
    return Either.success({
      entries: sliced,
      hasMore: false,
    })
  }
}

describe('AddonScopedStorage', () => {
  let repository: MockStorageRepository
  let storage: AddonScopedStorage

  beforeEach(() => {
    repository = new MockStorageRepository()
    storage = new AddonScopedStorage('discord-addon', repository)
  })

  it('serializes workspace and capability scopes properly', async () => {
    await storage.set(
      { kind: 'workspace', workspaceId: 'ws-1' },
      'key-a',
      'val-a',
    )
    const result = await storage.get(
      { kind: 'workspace', workspaceId: 'ws-1' },
      'key-a',
    )
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return
    expect(result.success).toBe('val-a')

    await storage.set(
      {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'cap-1',
      },
      'key-cap',
      'val-cap',
    )
    const capResult = await storage.get(
      {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'cap-1',
      },
      'key-cap',
    )
    expect(capResult.isSuccess()).toBe(true)
    if (capResult.isFailure()) return
    expect(capResult.success).toBe('val-cap')
  })

  it('rejects invalid limit in list request', async () => {
    const result = await storage.list({ kind: 'addon' }, { limit: 0 })
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toBe('STORAGE_LIMIT_INVALID')
  })
})
