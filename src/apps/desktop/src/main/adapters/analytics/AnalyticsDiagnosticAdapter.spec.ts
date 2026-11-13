import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
import type { IWorkspacesRepository } from '@mr-tick/application'
import { Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsDiagnosticAdapter } from './AnalyticsDiagnosticAdapter'
import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

const engines: DuckDBAnalyticsEngine[] = []

afterEach(async () => {
  for (const engine of engines) await engine.close()
  engines.length = 0
})

describe('AnalyticsDiagnosticAdapter', () => {
  it('short-circuits without querying workspaces when analytics directory is empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'metric-analytics-diag-empty-'))
    const engine = new DuckDBAnalyticsEngine(dir)
    engines.push(engine)

    const listMock = vi.fn()
    const repo = { list: listMock } as unknown as IWorkspacesRepository
    const adapter = new AnalyticsDiagnosticAdapter(engine, repo)

    const storages = await adapter.checkStorages()
    const probes = await adapter.readProbes()

    expect(storages.isSuccess()).toBe(true)
    expect(storages.success).toEqual([])
    expect(probes.isSuccess()).toBe(true)
    expect(probes.success).toEqual([])
    expect(listMock).not.toHaveBeenCalled()
  })

  it('paginates workspaces, reports v1/healthy/orphan analytics storages, and never creates files passively', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'metric-analytics-diag-scan-'))

    // Create v1 legacy DB for ws-legacy
    const legacyHash = createHash('sha256').update('ws-legacy').digest('hex')
    const legacyPath = join(dir, `${legacyHash}.duckdb`)
    const legacyInstance = await DuckDBInstance.create(legacyPath)
    const legacyConn = await legacyInstance.connect()
    await legacyConn.run(
      'CREATE TABLE analytics_format(version INTEGER NOT NULL)',
    )
    await legacyConn.run('INSERT INTO analytics_format VALUES (1)')
    legacyConn.closeSync()
    legacyInstance.closeSync()

    // Create healthy v2 DB for ws-healthy using a separate seed engine
    const seedEngine = new DuckDBAnalyticsEngine(dir)
    const saved = await seedEngine.saveWorkspaceState({
      workspaceId: 'ws-healthy',
      pollingIntervalMinutes: 5,
    })
    expect(saved.isSuccess()).toBe(true)
    await seedEngine.close()

    const engine = new DuckDBAnalyticsEngine(dir)
    engines.push(engine)

    // Create an orphan .duckdb file with no matching workspace
    const orphanHash = 'deadbeef'.repeat(8)
    await writeFile(join(dir, `${orphanHash}.duckdb`), 'orphan-bytes', 'utf8')

    // Generate 55 fake workspaces across 2 paginated pages (> WORKSPACES_PAGE_SIZE=50)
    const allWorkspaces = Array.from({ length: 53 }, (_, i) => ({
      id: `ws-filler-${i}`,
      name: `Filler ${i}`,
    })).concat([
      { id: 'ws-legacy', name: 'Workspace Legado' },
      { id: 'ws-healthy', name: 'Workspace Saudável' },
    ])

    const listMock = vi.fn(
      async (
        filter?: unknown,
        pagination?: { page?: number; pageSize?: number },
      ) => {
        void filter
        const page = pagination?.page ?? 1
        const pageSize = pagination?.pageSize ?? 50
        const start = (page - 1) * pageSize
        const items = allWorkspaces.slice(start, start + pageSize)
        return Either.success({
          items,
          total: allWorkspaces.length,
          page,
          pageSize,
        })
      },
    )
    const repo = { list: listMock } as unknown as IWorkspacesRepository
    const adapter = new AnalyticsDiagnosticAdapter(engine, repo)

    const storages = await adapter.checkStorages()
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(storages.isSuccess()).toBe(true)

    const legacyStorage = storages.success.find(
      (s) => s.id === 'analytics-ws-legacy',
    )
    expect(legacyStorage).toMatchObject({
      role: 'analytics',
      technology: 'duckdb',
      workspaceId: 'ws-legacy',
      workspaceName: 'Workspace Legado',
      canReset: true,
      measurement: {
        status: 'error',
        reason: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
        details: {
          storagePath: [legacyPath],
          storedFormatVersion: ['1'],
          supportedFormatVersion: ['2'],
        },
      },
    })

    const healthyStorage = storages.success.find(
      (s) => s.id === 'analytics-ws-healthy',
    )
    expect(healthyStorage).toMatchObject({
      role: 'analytics',
      technology: 'duckdb',
      workspaceId: 'ws-healthy',
      canReset: true,
      measurement: {
        status: 'available',
        precision: 'exact',
        coverage: 'file',
      },
    })

    const orphanStorage = storages.success.find(
      (s) => s.id === `analytics-orphan-${orphanHash}`,
    )
    expect(orphanStorage).toMatchObject({
      role: 'analytics',
      canReset: false,
      measurement: {
        status: 'error',
        reason: 'ANALYTICS_STORAGE_ORPHAN_FILE',
      },
    })

    const probes = await adapter.readProbes()
    expect(probes.isSuccess()).toBe(true)
    expect(
      probes.success.find((c) => c.id === 'probe-analytics-storage-ws-legacy'),
    ).toMatchObject({
      source: 'analytics',
      status: 'fail',
      reason: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
    })
    expect(
      probes.success.find((c) => c.id === 'probe-analytics-storage-ws-healthy'),
    ).toMatchObject({
      source: 'analytics',
      status: 'pass',
      provenOperation: 'duckdb_analytics_storage_verified',
    })
    expect(
      probes.success.find(
        (c) => c.id === `probe-analytics-orphan-${orphanHash}`,
      ),
    ).toMatchObject({
      source: 'analytics',
      status: 'fail',
      reason: 'ANALYTICS_STORAGE_ORPHAN_FILE',
    })
  })
})
