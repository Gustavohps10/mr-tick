import { AppError, DataSourceContext, Either, TimeEntryDTO } from '@mr-tick/sdk'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { FakeDatabaseStore } from './FakeDatabaseStore'
import { FakeTimeEntryProvider } from './FakeTimeEntryProvider'

const context: DataSourceContext = {
  httpClient: {
    configure() {},
    get: async () => Either.failure(AppError.Internal('UNUSED_HTTP')),
    post: async () => Either.failure(AppError.Internal('UNUSED_HTTP')),
    put: async () => Either.failure(AppError.Internal('UNUSED_HTTP')),
    patch: async () => Either.failure(AppError.Internal('UNUSED_HTTP')),
    delete: async () => Either.failure(AppError.Internal('UNUSED_HTTP')),
  },
}
const entry: TimeEntryDTO = {
  id: 'local-uuid',
  correlationId: 'local-uuid',
  task: { id: '1' },
  activity: { id: '1' },
  user: { id: '1' },
  startDate: new Date(2026, 8, 24, 8),
  endDate: new Date(2026, 8, 24, 9, 20),
  timeSpent: 1.3333,
  createdAt: new Date('2020-01-01'),
  updatedAt: new Date('2020-01-01'),
  comments: 'test',
}

describe('Fake provider stored state and fault injection', () => {
  beforeAll(() => vi.stubEnv('FAKE_DB_IN_MEMORY', 'true'))
  afterAll(() => vi.unstubAllEnvs())
  beforeEach(() => FakeDatabaseStore.getInstance().resetToSeed())

  it('persists correlation and returns the actual stored state with a separate remote ID and server clock', async () => {
    const provider = new FakeTimeEntryProvider(context)
    const result = await provider.create(entry)
    expect(result.success.id).not.toBe(entry.id)
    const remote = (await provider.findByCorrelation('local-uuid')).success
    expect(remote?.correlationId).toBe(entry.correlationId)
    expect(remote).toEqual(result.success.entry)
    expect(remote?.updatedAt.getTime()).toBeGreaterThan(
      entry.updatedAt.getTime(),
    )
  })

  it('can reproduce Redmine normalization explicitly without changing the exact storage mode', async () => {
    const provider = new FakeTimeEntryProvider(context, 'redmine')
    const result = await provider.create(entry)
    expect(result.success.entry?.timeSpent).toBe(1.33)
    expect(result.success.entry?.startDate).toEqual(new Date(2026, 8, 24, 12))
    expect(result.success.entry?.endDate).toEqual(
      new Date(new Date(2026, 8, 24, 12).getTime() + 1.33 * 3600000),
    )
  })

  it('keeps the accepted creation available after a simulated lost response', async () => {
    const provider = new FakeTimeEntryProvider(context)
    FakeDatabaseStore.getInstance().setSimulateTimeEntryCreateResponseLoss(true)
    expect((await provider.create(entry)).isFailure()).toBe(true)
    expect(
      (await provider.findByCorrelation('local-uuid')).success?.id,
    ).toBeDefined()
    expect(
      FakeDatabaseStore.getInstance().getTimeEntrySyncDiagnostics()
        .createAttempts,
    ).toBe(1)
  })
})
