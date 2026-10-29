import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteAddonStorageRepository } from './SQLiteAddonStorageRepository'

describe('SQLiteAddonStorageRepository', () => {
  let temporaryDirectory: string
  let dbFilePath: string
  let repository: SQLiteAddonStorageRepository

  beforeEach(async () => {
    temporaryDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'mr-tick-sqlite-storage-'),
    )
    dbFilePath = path.join(temporaryDirectory, 'workspaces.sqlite')
    repository = new SQLiteAddonStorageRepository(dbFilePath)
  })

  afterEach(async () => {
    await repository.close()
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('isolates keys across addons and scopes', async () => {
    await repository.set('addon-a', 'scope-1', 'key-1', 'val-a1')
    await repository.set('addon-b', 'scope-1', 'key-1', 'val-b1')
    await repository.set('addon-a', 'scope-2', 'key-1', 'val-a2')

    const resA1 = await repository.get('addon-a', 'scope-1', 'key-1')
    const resB1 = await repository.get('addon-b', 'scope-1', 'key-1')
    const resA2 = await repository.get('addon-a', 'scope-2', 'key-1')

    expect(resA1.isSuccess()).toBe(true)
    if (resA1.isFailure()) return
    expect(resA1.success).toBe('val-a1')

    expect(resB1.isSuccess()).toBe(true)
    if (resB1.isFailure()) return
    expect(resB1.success).toBe('val-b1')

    expect(resA2.isSuccess()).toBe(true)
    if (resA2.isFailure()) return
    expect(resA2.success).toBe('val-a2')
  })

  it('handles literal prefix matching including wildcards and unicode without pattern interpretation', async () => {
    // Keys with literal %, _ and Unicode
    await repository.set('addon-1', 'scope-1', '100%_done:item1', 'v1')
    await repository.set('addon-1', 'scope-1', '100%_done:item2', 'v2')
    await repository.set('addon-1', 'scope-1', '100X_done:item3', 'v3') // Would match 100%_ if wildcards were active
    await repository.set('addon-1', 'scope-1', '100%Xdone:item4', 'v4') // Would match 100%_ if _ was wildcard
    await repository.set('addon-1', 'scope-1', 'tarefa_🚀:001', 'v-rocket')

    // Query with literal '100%_done:'
    const wildcardPrefixResult = await repository.list('addon-1', 'scope-1', {
      prefix: '100%_done:',
      limit: 10,
    })
    expect(wildcardPrefixResult.isSuccess()).toBe(true)
    if (wildcardPrefixResult.isFailure()) return
    expect(wildcardPrefixResult.success.entries).toHaveLength(2)
    expect(wildcardPrefixResult.success.entries[0]?.key).toBe('100%_done:item1')
    expect(wildcardPrefixResult.success.entries[1]?.key).toBe('100%_done:item2')

    // Query with Unicode prefix
    const unicodeResult = await repository.list('addon-1', 'scope-1', {
      prefix: 'tarefa_🚀:',
      limit: 10,
    })
    expect(unicodeResult.isSuccess()).toBe(true)
    if (unicodeResult.isFailure()) return
    expect(unicodeResult.success.entries).toHaveLength(1)
    expect(unicodeResult.success.entries[0]?.key).toBe('tarefa_🚀:001')
  })

  it('paginates natively with limit and cursor across multiple pages', async () => {
    for (let i = 1; i <= 5; i++) {
      const formatted = String(i).padStart(3, '0')
      await repository.set(
        'addon-1',
        'scope-1',
        `segment:${formatted}`,
        `data-${i}`,
      )
    }

    // Page 1: limit 2
    const page1 = await repository.list('addon-1', 'scope-1', {
      prefix: 'segment:',
      limit: 2,
    })
    expect(page1.isSuccess()).toBe(true)
    if (page1.isFailure()) return
    expect(page1.success.entries).toHaveLength(2)
    expect(page1.success.entries[0]?.key).toBe('segment:001')
    expect(page1.success.entries[1]?.key).toBe('segment:002')
    expect(page1.success.hasMore).toBe(true)
    if (!page1.success.hasMore) return
    const cursor1 = page1.success.nextCursor
    expect(cursor1).toBe('segment:002')

    // Page 2: limit 2 with cursor
    const page2 = await repository.list('addon-1', 'scope-1', {
      prefix: 'segment:',
      limit: 2,
      cursor: cursor1,
    })
    expect(page2.isSuccess()).toBe(true)
    if (page2.isFailure()) return
    expect(page2.success.entries).toHaveLength(2)
    expect(page2.success.entries[0]?.key).toBe('segment:003')
    expect(page2.success.entries[1]?.key).toBe('segment:004')
    expect(page2.success.hasMore).toBe(true)
    if (!page2.success.hasMore) return
    const cursor2 = page2.success.nextCursor

    // Page 3: limit 2 with cursor -> last remaining item
    const page3 = await repository.list('addon-1', 'scope-1', {
      prefix: 'segment:',
      limit: 2,
      cursor: cursor2,
    })
    expect(page3.isSuccess()).toBe(true)
    if (page3.isFailure()) return
    expect(page3.success.entries).toHaveLength(1)
    expect(page3.success.entries[0]?.key).toBe('segment:005')
    expect(page3.success.hasMore).toBe(false)
  })

  it('persists data across restarts and handles upserts/deletes', async () => {
    await repository.set('addon-1', 'scope-1', 'active:session', 'session-1')
    await repository.close()

    // Reopen repository on same database file
    const reopened = new SQLiteAddonStorageRepository(dbFilePath)
    const readResult = await reopened.get(
      'addon-1',
      'scope-1',
      'active:session',
    )
    expect(readResult.isSuccess()).toBe(true)
    if (readResult.isFailure()) return
    expect(readResult.success).toBe('session-1')

    // Upsert value
    await reopened.set('addon-1', 'scope-1', 'active:session', 'session-2')
    const updatedResult = await reopened.get(
      'addon-1',
      'scope-1',
      'active:session',
    )
    expect(updatedResult.isSuccess()).toBe(true)
    if (updatedResult.isFailure()) return
    expect(updatedResult.success).toBe('session-2')

    // Delete
    await reopened.delete('addon-1', 'scope-1', 'active:session')
    const deletedResult = await reopened.get(
      'addon-1',
      'scope-1',
      'active:session',
    )
    expect(deletedResult.isSuccess()).toBe(true)
    if (deletedResult.isFailure()) return
    expect(deletedResult.success).toBeNull()

    await reopened.close()
  })

  it('handles concurrent writes safely', async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      repository.set('addon-1', 'scope-1', `key-${i}`, `val-${i}`),
    )
    const results = await Promise.all(writes)
    for (const r of results) {
      expect(r.isSuccess()).toBe(true)
    }

    const listResult = await repository.list('addon-1', 'scope-1', {
      limit: 50,
    })
    expect(listResult.isSuccess()).toBe(true)
    if (listResult.isFailure()) return
    expect(listResult.success.entries).toHaveLength(20)
  })
})
