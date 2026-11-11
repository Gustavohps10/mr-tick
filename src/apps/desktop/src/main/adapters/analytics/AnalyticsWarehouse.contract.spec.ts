import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  IAnalyticsProvider,
  IAnalyticsResolver,
  JsonValue,
} from '@mr-tick/application'
import {
  AnalyticsWarehouseService,
  createAnalyticsDatasetScope,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  ElectronHttpClient,
  type IFetchTransport,
  NodeFetchTransport,
} from '../ElectronHttpClient'
import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

const readingSchema = z.object({
  reading_key: z.string(),
  energy_kwh: z.number(),
  revision_at: z.string(),
})
const packetSchema = z.object({
  readings: z.array(readingSchema),
  more: z.boolean(),
  stamp: z.string(),
  removed: z.array(z.string()),
})
type Packet = z.infer<typeof packetSchema>

function isPacket(value: JsonValue): value is Packet {
  return packetSchema.safeParse(value).success
}

const manifest: AnalyticsDatasetManifest = {
  id: 'meter.readings',
  name: 'Meter readings',
  description: 'Independent HTTP contract fixture',
  sourceFormat: 'json',
  endpoint: '/readings',
  selection: { dateRange: false, project: true },
  extraction: {
    modes: ['snapshot', 'changes'],
    identity: { kind: 'row', columns: ['reading_key'] },
    changes: { deletions: 'explicit' },
  },
  columns: [
    { name: 'reading_key', label: 'Reading', type: 'string' },
    {
      name: 'energy_kwh',
      label: 'Energy',
      type: 'number',
      providerFieldId: 'urn:meter:energy',
    },
    { name: 'revision_at', label: 'Revision', type: 'string' },
  ],
}

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.reverse()) await close()
  cleanup.length = 0
})

async function fixture() {
  const requests: URLSearchParams[] = []
  let mode: 'good' | 'failure' | 'cancel' = 'good'
  let entered = () => {}
  const blocked = new Promise<void>((resolve) => {
    entered = resolve
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture')
    requests.push(url.searchParams)
    const changes = url.searchParams.get('mode') === 'changes'
    const tail = url.searchParams.get('cursor') === 'tail'

    if (changes && tail && mode === 'failure') {
      response.writeHead(503, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'meter unavailable' }))
      return
    }

    if (changes && tail && mode === 'cancel') {
      entered()
      return
    }

    let readings = [
      { reading_key: 'sensor/甲', energy_kwh: 1, revision_at: 'same-tick' },
      { reading_key: 'meter:0008', energy_kwh: 2, revision_at: 'same-tick' },
    ]
    if (tail)
      readings = [
        { reading_key: 'north zone', energy_kwh: 3, revision_at: 'same-tick' },
      ]
    if (changes && !tail)
      readings = [
        { reading_key: 'sensor/甲', energy_kwh: 10, revision_at: 'same-tick' },
        { reading_key: 'north zone', energy_kwh: 3, revision_at: 'same-tick' },
      ]
    if (changes && tail)
      readings = [
        { reading_key: 'δ:reading', energy_kwh: 4, revision_at: 'same-tick' },
      ]
    let stamp = 'etag:initial/α'
    if (changes && tail) stamp = 'etag:delta/β'
    const removed: string[] = []
    if (changes && tail) removed.push('meter:0008')
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ readings, more: !tail, stamp, removed }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('HTTP_FIXTURE_ADDRESS_REQUIRED')
  let controller = new AbortController()
  const native = new NodeFetchTransport()
  const transport: IFetchTransport = {
    fetch: (input, init) =>
      native.fetch(input, {
        ...init,
        signal: AbortSignal.any([init.signal, controller.signal]),
      }),
  }
  const http = new ElectronHttpClient(
    { baseURL: `http://127.0.0.1:${address.port}` },
    transport,
  )
  const provider: IAnalyticsProvider = {
    listAnalyticsDatasets: async () => Either.success([manifest]),
    getFilterOptions: async () => Either.success([]),
    fetchAnalyticsDataset: async (
      input,
    ): Promise<Either<AppError, AnalyticsDatasetResult>> => {
      const params: Record<string, string> = { mode: 'snapshot' }
      if (input.execution?.kind === 'changes') {
        params.mode = 'changes'
        params.checkpoint = input.execution.checkpoint
      }
      if (input.projectId !== undefined) params.plant = input.projectId
      if (input.execution?.cursor !== undefined)
        params.cursor = input.execution.cursor
      const result = await http.get('/readings', {
        params,
        responseValidator: isPacket,
      })
      if (result.isFailure()) return result.forwardFailure()
      const packet = result.success
      let index = 0
      if (params.cursor !== undefined) index = 1
      let coverage: 'partial' | 'unverified' = 'partial'
      if (!packet.more) coverage = 'unverified'
      const batch = {
        index,
        offset: index * 2,
        finished: !packet.more,
        totalRows: 3,
      }
      let continuation: { cursor: string } | undefined
      if (packet.more) continuation = { cursor: 'tail' }
      const common = {
        scope: createAnalyticsDatasetScope(input),
        coverage,
        coverageReason: 'FIXTURE_NO_REMOTE_SNAPSHOT',
        batch,
        continuation,
      }
      if (input.execution?.kind === 'changes')
        return Either.success({
          dataset: manifest,
          rows: packet.readings,
          fetchedAt: '2026-11-10T10:00:00Z',
          execution: {
            ...common,
            kind: 'changes',
            checkpoint: packet.stamp,
            deletedIds: packet.removed,
          },
        })
      let checkpoint: string | undefined
      if (!packet.more) checkpoint = packet.stamp
      return Either.success({
        dataset: manifest,
        rows: packet.readings,
        fetchedAt: '2026-11-10T09:00:00Z',
        execution: { ...common, kind: 'snapshot', checkpoint },
      })
    },
  }
  const directory = await mkdtemp(join(tmpdir(), 'metric-analytics-contract-'))
  let engine = new DuckDBAnalyticsEngine(directory)
  const resolver: IAnalyticsResolver = {
    resolve: async () =>
      Either.success({ provider, authorizationKey: 'meter-reader' }),
    resolveWorkspaceAuthorizations: async () =>
      Either.success([
        {
          connectionInstanceId: 'meter-connection',
          authorizationKey: 'meter-reader',
        },
      ]),
  }
  const emitter = { emit: () => {} }
  let service = new AnalyticsWarehouseService(resolver, engine, emitter)
  cleanup.push(async () => engine.close())
  const query: AnalyticsDatasetQueryInput = {
    datasetId: manifest.id,
    projectId: 'plant/日本',
    execution: { kind: 'snapshot', batchSize: 2 },
  }
  const load = (mode: 'full' | 'fast') =>
    service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'meter-connection',
      query,
      policy: { mode },
    })

  return {
    requests,
    blocked,
    load,
    setMode: (next: typeof mode) => {
      mode = next
    },
    abort: () => controller.abort(),
    retryTransport: () => {
      controller = new AbortController()
    },
    hydrate: () => service.hydrate({ workspaceId: 'workspace' }),
    query: (selectionKey: string) =>
      service.query({
        workspaceId: 'workspace',
        nodes: [
          {
            id: 'meter',
            kind: 'source',
            connectionInstanceId: 'meter-connection',
            selectionKey,
          },
        ],
        targetNodeId: 'meter',
        offset: 0,
        limit: 100,
      }),
    reopen: async () => {
      await engine.close()
      engine = new DuckDBAnalyticsEngine(directory)
      service = new AnalyticsWarehouseService(resolver, engine, emitter)
    },
  }
}

describe('Independent HTTP analytics contract with native warehouse [F4-01/F4-03]', () => {
  it('persists native textual identity and opaque checkpoints, then replays equal-boundary upserts and tombstones safely', async () => {
    const f = await fixture()
    const initial = await f.load('full')
    expect(initial.isSuccess()).toBe(true)
    expect(initial.success.syncState.checkpoint).toBe('etag:initial/α')
    await f.reopen()
    const updated = await f.load('fast')
    expect(updated.isSuccess()).toBe(true)
    expect(updated.success.syncState.checkpoint).toBe('etag:delta/β')
    expect(updated.success.publication.rowCount).toBe(3)
    expect(updated.success.publication.coverage).toBe('unverified')
    const repeated = await f.load('fast')
    expect(repeated.isSuccess()).toBe(true)
    const rows = await f.query(repeated.success.publication.selectionKey)
    expect(rows.success.rows.map((row) => row.reading_key).sort()).toEqual(
      ['north zone', 'sensor/甲', 'δ:reading'].sort(),
    )
    expect(
      rows.success.rows.reduce((sum, row) => sum + Number(row.energy_kwh), 0),
    ).toBe(17)
    expect(
      rows.success.columns.find((column) => column.name === 'energy_kwh')
        ?.providerFieldId,
    ).toBe('urn:meter:energy')
    expect(
      f.requests.every((params) => params.get('plant') === 'plant/日本'),
    ).toBe(true)
    expect(
      f.requests.some((params) => params.get('checkpoint') === 'etag:delta/β'),
    ).toBe(true)
  })

  it.each(['failure', 'cancel'] as const)(
    'retains the publication and committed checkpoint after %s between HTTP pages and restarts cleanly',
    async (mode) => {
      const f = await fixture()
      const initial = await f.load('full')
      expect(initial.isSuccess()).toBe(true)
      f.setMode(mode)
      const pending = f.load('fast')
      if (mode === 'cancel') {
        await f.blocked
        f.abort()
      }
      const failed = await pending
      expect(failed.isFailure()).toBe(true)
      if (mode === 'failure') expect(failed.failure.statusCode).toBe(503)
      const retained = await f.hydrate()
      const publication = retained.success.publications.find(
        (entry) =>
          entry.publication.selectionKey ===
          initial.success.publication.selectionKey,
      )
      expect(publication?.publication.generationId).toBe(
        initial.success.publication.generationId,
      )
      expect(publication?.syncState.checkpoint).toBe('etag:initial/α')
      expect(
        (await f.query(initial.success.publication.selectionKey)).success.rows,
      ).toHaveLength(3)
      await f.reopen()
      f.setMode('good')
      f.retryTransport()
      const requestCount = f.requests.length
      const retried = await f.load('fast')
      expect(retried.isSuccess()).toBe(true)
      const retryRequests = f.requests.slice(requestCount)
      expect(retryRequests.map((params) => params.get('cursor'))).toEqual([
        null,
        'tail',
      ])
      expect(
        retryRequests.every(
          (params) => params.get('checkpoint') === 'etag:initial/α',
        ),
      ).toBe(true)
      expect(retried.success.publication.rowCount).toBe(3)
    },
  )
})
