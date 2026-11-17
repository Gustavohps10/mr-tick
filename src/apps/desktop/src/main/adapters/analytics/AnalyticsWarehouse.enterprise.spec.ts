import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  AnalyticsDatasetManifest,
  IAnalyticsProvider,
  IAnalyticsResolver,
} from '@mr-tick/application'
import { AnalyticsWarehouseService } from '@mr-tick/application'
import { Either } from '@mr-tick/shared/helpers'
import { NoOpSystemEventEmitter } from '@mr-tick/shared/transport'
import { expect, it } from 'vitest'
import { z } from 'zod'

import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

const entry = z.object({
  id: z.number(),
  project: z.object({ id: z.number(), name: z.string() }),
  user: z.object({ id: z.number(), name: z.string() }),
  hours: z.number(),
  spent_on: z.string(),
})
const payload = z.object({
  time_entries: z.array(entry),
  total_count: z.number(),
  offset: z.number(),
  limit: z.number(),
})

/** Read-only real API fixture; this does not add a provider dependency to the core. */
it.skipIf(process.env.METRIC_ANALYTICS_REDMINE_URL === undefined)(
  'measures real Redmine extraction, native ingestion and full-table aggregation',
  async () => {
    const url = process.env.METRIC_ANALYTICS_REDMINE_URL
    const key = process.env.METRIC_ANALYTICS_REDMINE_KEY
    expect(url).toBeDefined()
    expect(key).toBeDefined()
    if (url === undefined || key === undefined) return
    const manifest: AnalyticsDatasetManifest = {
      id: 'entries',
      name: 'Entries',
      description: 'Read-only enterprise fixture',
      sourceFormat: 'json',
      endpoint: '/time_entries.json',
      extraction: {
        modes: ['snapshot'],
        identity: { kind: 'row', columns: ['id'] },
      },
      columns: [
        { name: 'id', label: 'ID', type: 'number' },
        { name: 'project_id', label: 'Project ID', type: 'number' },
        { name: 'project', label: 'Project', type: 'string' },
        { name: 'user_id', label: 'User ID', type: 'number' },
        { name: 'user', label: 'User', type: 'string' },
        { name: 'hours', label: 'Hours', type: 'number' },
        { name: 'date', label: 'Date', type: 'date' },
      ],
    }
    let extractionMs = 0,
      batches = 0,
      expectedHours = 0
    const provider: IAnalyticsProvider = {
      listAnalyticsDatasets: async () => Either.success([manifest]),
      getFilterOptions: async () => Either.success([]),
      fetchAnalyticsDataset: async (query) => {
        let offset = 0
        if (query.execution?.cursor !== undefined)
          offset = Number(query.execution.cursor)
        const start = performance.now()
        const response = await fetch(
          `${url}/time_entries.json?limit=100&offset=${offset}`,
          {
            headers: {
              'X-Redmine-API-Key': key,
              'Accept-Language': 'en-US,en;q=0.9',
              Accept: 'application/json',
            },
          },
        )
        expect(response.ok).toBe(true)
        const data = payload.parse(await response.json())
        extractionMs += performance.now() - start
        batches += 1
        const rows = data.time_entries.map((item) => ({
          id: item.id,
          project_id: item.project.id,
          project: item.project.name,
          user_id: item.user.id,
          user: item.user.name,
          hours: item.hours,
          date: item.spent_on,
        }))
        expectedHours += rows.reduce((sum, row) => sum + row.hours, 0)
        const finished = offset + rows.length >= data.total_count
        let continuation: { cursor: string } | undefined
        if (!finished) continuation = { cursor: String(offset + rows.length) }
        return Either.success({
          dataset: manifest,
          rows,
          fetchedAt: new Date().toISOString(),
          execution: {
            kind: 'snapshot',
            scope: { datasetId: 'entries' },
            coverage: 'unverified',
            batch: {
              index: offset / 100,
              offset,
              finished,
              totalRows: data.total_count,
            },
            continuation,
          },
        })
      },
    }
    const resolver: IAnalyticsResolver = {
      resolve: async () =>
        Either.success({
          provider,
          authorizationKey: 'enterprise-test-authorization',
        }),
      resolveWorkspaceAuthorizations: async () =>
        Either.success([
          {
            connectionInstanceId: 'redmine',
            authorizationKey: 'enterprise-test-authorization',
          },
        ]),
    }
    const engine = new DuckDBAnalyticsEngine(
      await mkdtemp(join(tmpdir(), 'metric-native-enterprise-')),
    )
    const service = new AnalyticsWarehouseService(
      resolver,
      engine,
      new NoOpSystemEventEmitter(),
    )
    const memoryBefore = process.memoryUsage()
    const started = performance.now()

    try {
      const loaded = await service.load({
        workspaceId: 'enterprise',
        connectionInstanceId: 'redmine',
        query: { datasetId: 'entries' },
      })
      const loadMs = performance.now() - started
      expect(loaded.isSuccess(), JSON.stringify(loaded)).toBe(true)
      expect(loaded.success.publication.rowCount).toBeGreaterThanOrEqual(3000)
      const queryStart = performance.now()
      const result = await service.query({
        workspaceId: 'enterprise',
        nodes: [
          {
            id: 'source',
            kind: 'source',
            connectionInstanceId: 'redmine',
            selectionKey: loaded.success.publication.selectionKey,
          },
        ],
        targetNodeId: 'source',
        groupBy: [],
        measures: [
          { name: 'total_hours', column: 'hours', operator: 'sum' },
          { name: 'entries', operator: 'count' },
        ],
        offset: 0,
        limit: 1,
      })
      const queryMs = performance.now() - queryStart
      expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
      expect(result.success.rows).toEqual([
        {
          total_hours: expect.closeTo(expectedHours, 5),
          entries: loaded.success.publication.rowCount,
        },
      ])
      const memoryAfter = process.memoryUsage()
      const report = {
        url,
        batches,
        rows: loaded.success.publication.rowCount,
        extractionMs,
        ingestionAndCoordinationMs: loadMs - extractionMs,
        loadMs,
        queryMs,
        returnedRows: result.success.rows.length,
        coverage: result.success.coverage,
        memoryBefore,
        memoryAfter,
      }
      const destination = process.env.METRIC_ANALYTICS_BENCHMARK_REPORT
      if (destination !== undefined)
        await writeFile(destination, JSON.stringify(report, null, 2))
      console.info(JSON.stringify(report))
    } finally {
      await engine.close()
    }
  },
  120000,
)
