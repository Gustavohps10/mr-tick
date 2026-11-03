import type { DataSourceContext } from '@mr-tick/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeTaskProvider } from './FakeTaskProvider'

describe('Task lookup fake provider contract', () => {
  beforeEach(() => vi.stubEnv('FAKE_DB_IN_MEMORY', 'true'))
  afterEach(() => vi.unstubAllEnvs())

  it('filters explicit source IDs and does not replace an absent ID with unrelated tasks', async () => {
    const provider = new FakeTaskProvider({} as DataSourceContext)
    const found = await provider.findAll({
      ids: ['DEV-9999'],
      page: 1,
      pageSize: 50,
    })
    expect(found.success.items.map((task) => task.id)).toEqual(['DEV-9999'])
    const missing = await provider.findAll({
      ids: ['UNRESOLVED-123456'],
      page: 1,
      pageSize: 50,
    })
    expect(missing.success.items).toEqual([])
  })

  it('filters literal titles without changing source IDs', async () => {
    const provider = new FakeTaskProvider({} as DataSourceContext)
    const result = await provider.findAll({
      search: 'responsividade',
      page: 1,
      pageSize: 50,
    })
    expect(result.success.items.length).toBeGreaterThan(0)
    expect(
      result.success.items.every((task) =>
        task.title.toLowerCase().includes('responsividade'),
      ),
    ).toBe(true)
    expect(result.success.items.some((task) => task.id === 'API-240')).toBe(
      true,
    )
  })
})
