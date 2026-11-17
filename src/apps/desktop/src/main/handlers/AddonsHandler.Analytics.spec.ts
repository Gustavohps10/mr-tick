import type {
  AnalyticsDatasetQueryInput,
  IAnalyticsUseCase,
} from '@mr-tick/application'
import { Either } from '@mr-tick/shared/helpers'
import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { AddonsHandler } from './AddonsHandler'

function fixture() {
  const service: IAnalyticsUseCase = {
    listAnalyticsDatasets: vi.fn(async () => Either.success([])),
    fetchAnalyticsDataset: vi.fn(),
    getFilterOptions: vi.fn(async () =>
      Either.success([{ value: 'id', label: 'Native' }]),
    ),
  }
  const handler = new AddonsHandler(
    {} as ConstructorParameters<typeof AddonsHandler>[0],
    {} as ConstructorParameters<typeof AddonsHandler>[1],
    {} as ConstructorParameters<typeof AddonsHandler>[2],
    {} as ConstructorParameters<typeof AddonsHandler>[3],
    {} as ConstructorParameters<typeof AddonsHandler>[4],
    {} as ConstructorParameters<typeof AddonsHandler>[5],
    {} as ConstructorParameters<typeof AddonsHandler>[6],
    service,
  )
  return { service, handler }
}
const event = {} as IpcMainInvokeEvent

describe('Analytics IPC boundary', () => {
  it('uses the independent analytics application service for listing and filters', async () => {
    const { handler, service } = fixture()
    const scope = {
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
    }
    expect(
      (await handler.listAnalyticsDatasets(event, { body: scope })).isSuccess,
    ).toBe(true)
    expect(service.listAnalyticsDatasets).toHaveBeenCalledWith(scope)
    const options = await handler.getAnalyticsFilterOptions(event, {
      body: { ...scope, source: 'projects' },
    })
    expect(options.data).toEqual([{ value: 'id', label: 'Native' }])
  })

  it('rejects malformed identifiers before invoking the application service', async () => {
    const { handler, service } = fixture()
    const scope = {
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
    }
    const query = { datasetId: 123 } as unknown as AnalyticsDatasetQueryInput
    const invalid = await handler.fetchAnalyticsDataset(event, {
      body: { ...scope, query },
    })
    expect(invalid.statusCode).toBe(400)
    expect(service.fetchAnalyticsDataset).not.toHaveBeenCalled()
    expect(
      (
        await handler.listAnalyticsDatasets(event, {
          body: { ...scope, workspaceId: '  ' },
        })
      ).statusCode,
    ).toBe(400)
  })
})

describe('Analytics execution input validation', () => {
  it('rejects malformed continuation requests at IPC before entering a provider', async () => {
    const { handler, service } = fixture()
    for (const execution of [
      null,
      { kind: 'snapshot', cursor: 7 },
      { kind: 'snapshot', batchSize: -1 },
      { kind: 'invented' },
    ]) {
      const query = {
        datasetId: 'readings',
        execution,
      } as unknown as AnalyticsDatasetQueryInput
      const result = await handler.fetchAnalyticsDataset(event, {
        body: {
          workspaceId: 'workspace',
          connectionInstanceId: 'reader',
          query,
        },
      })
      expect(result.statusCode).toBe(400)
    }
    expect(service.fetchAnalyticsDataset).not.toHaveBeenCalled()
  })
})
