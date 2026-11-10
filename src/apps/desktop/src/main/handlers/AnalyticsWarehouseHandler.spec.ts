import type {
  AnalyticsQueryInput,
  IAnalyticsWarehouseUseCase,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { AnalyticsWarehouseHandler } from './AnalyticsWarehouseHandler'

const event = {} as IpcMainInvokeEvent
const query: AnalyticsQueryInput = {
  workspaceId: 'workspace',
  nodes: [
    {
      id: 'source',
      kind: 'source',
      connectionInstanceId: 'connection',
      selectionKey: 'selection',
    },
  ],
  targetNodeId: 'source',
  offset: 0,
  limit: 100,
}

function fixture() {
  const service: IAnalyticsWarehouseUseCase = { load: vi.fn(), query: vi.fn() }
  return { service, handler: new AnalyticsWarehouseHandler(service) }
}

describe('Analytical warehouse IPC boundary', () => {
  it('rejects caller-supplied authorization ownership and unbounded result pages', async () => {
    const f = fixture()
    const forged = {
      ...query,
      nodes: [
        {
          id: 'source',
          kind: 'source',
          connectionInstanceId: 'connection',
          selectionKey: 'selection',
          authorizationKey: 'forged-owner',
        },
      ],
    } as unknown as AnalyticsQueryInput
    expect((await f.handler.query(event, { body: forged })).statusCode).toBe(
      400,
    )
    expect(
      (await f.handler.query(event, { body: { ...query, limit: 501 } }))
        .statusCode,
    ).toBe(400)
    expect(f.service.query).not.toHaveBeenCalled()
  })

  it('preserves structured failures from the canonical authorization service', async () => {
    const f = fixture()
    vi.mocked(f.service.query).mockResolvedValue(
      Either.failure(
        AppError.Http(403, 'FORBIDDEN', { connection: ['permission revoked'] }),
      ),
    )
    expect(await f.handler.query(event, { body: query })).toMatchObject({
      isSuccess: false,
      statusCode: 403,
      error: 'FORBIDDEN',
      details: { connection: ['permission revoked'] },
    })
    expect(f.service.query).toHaveBeenCalledWith(query)
  })

  it('requires a connection and validates source extraction requests before loading', async () => {
    const f = fixture()
    expect(
      (
        await f.handler.load(event, {
          body: {
            workspaceId: 'workspace',
            connectionInstanceId: '',
            query: { datasetId: 'entries' },
          },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await f.handler.load(event, {
          body: {
            workspaceId: 'workspace',
            connectionInstanceId: 'connection',
            query: {
              datasetId: 'entries',
              execution: { kind: 'snapshot', batchSize: 0 },
            },
          },
        })
      ).statusCode,
    ).toBe(400)
    expect(f.service.load).not.toHaveBeenCalled()
  })
})
