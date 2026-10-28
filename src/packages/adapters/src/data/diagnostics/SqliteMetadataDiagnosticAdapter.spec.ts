import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import knex, { type Knex } from 'knex'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SqliteMetadataDiagnosticAdapter } from './SqliteMetadataDiagnosticAdapter'

describe('SqliteMetadataDiagnosticAdapter', () => {
  let tempDir: string | undefined
  let db: Knex | undefined

  afterEach(async () => {
    vi.restoreAllMocks()
    if (db) await db.destroy()
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Temp dir cleanup
      }
    }
  })

  it('measures in-memory database storage as not-supported with reason', async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    })
    const adapter = new SqliteMetadataDiagnosticAdapter(db, ':memory:')

    const result = await adapter.checkStorage()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.role).toBe('metadata')
      expect(result.success.technology).toBe('sqlite')
      expect(result.success.measurement.status).toBe('not-supported')
      if (result.success.measurement.status === 'not-supported') {
        expect(result.success.measurement.reason).toBe(
          'MEMORY_STORAGE_NO_PHYSICAL_FILE',
        )
      }
    }
  })

  it('probes database with O(1) id projection query', async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    })
    await db.schema.createTable('workspaces', (table) => {
      table.string('id').primary()
    })
    await db('workspaces').insert({ id: 'ws-1' })
    const adapter = new SqliteMetadataDiagnosticAdapter(db, ':memory:')

    const probe = await adapter.readProbe()

    expect(probe.isSuccess()).toBe(true)
    if (probe.isSuccess()) {
      expect(probe.success.status).toBe('pass')
      if (probe.success.status === 'pass') {
        expect(probe.success.provenOperation).toBe('read_workspaces_id')
      }
      expect(probe.success.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('measures real SQLite file on disk including WAL and SHM if present', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-tick-sqlite-diag-'))
    const dbPath = path.join(tempDir, 'workspaces.sqlite')
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
    })
    await db.raw('PRAGMA journal_mode = WAL;')
    await db.schema.createTable('workspaces', (table) => {
      table.string('id').primary()
      table.string('name')
    })
    await db('workspaces').insert({ id: 'ws-1', name: 'Test WS' })

    const adapter = new SqliteMetadataDiagnosticAdapter(db, dbPath)

    const storage = await adapter.checkStorage()
    expect(storage.isSuccess()).toBe(true)
    if (storage.isSuccess()) {
      expect(storage.success.measurement.status).toBe('available')
      if (storage.success.measurement.status === 'available') {
        expect(storage.success.measurement.bytes).toBeGreaterThan(0)
        expect(storage.success.measurement.precision).toBe('exact')
        expect(storage.success.measurement.coverage).toBe('file')
      }
    }

    const probe = await adapter.readProbe()
    expect(probe.isSuccess()).toBe(true)
    if (probe.isSuccess()) {
      expect(probe.success.status).toBe('pass')
      if (probe.success.status === 'pass') {
        expect(probe.success.provenOperation).toBe('read_workspaces_id')
      }
    }
  })

  it('returns unavailable measurement when WAL file encounters permission denied EACCES', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-tick-sqlite-diag-'))
    const dbPath = path.join(tempDir, 'workspaces.sqlite')
    await fs.writeFile(dbPath, 'test-sqlite-data')

    db = knex({
      client: 'better-sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
    })

    const originalStat = fs.stat
    vi.spyOn(fs, 'stat').mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('-wal')) {
        const error = new Error('permission denied')
        Object.assign(error, { code: 'EACCES' })
        throw error
      }
      return originalStat(filePath)
    })

    const adapter = new SqliteMetadataDiagnosticAdapter(db, dbPath)
    const storage = await adapter.checkStorage()

    expect(storage.isSuccess()).toBe(true)
    if (storage.isSuccess()) {
      expect(storage.success.measurement.status).toBe('unavailable')
      if (storage.success.measurement.status === 'unavailable') {
        expect(storage.success.measurement.reason).toContain(
          'permission denied',
        )
      }
    }
  })

  it('returns unavailable measurement when stat throws an Error without code', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-tick-sqlite-diag-'))
    const dbPath = path.join(tempDir, 'workspaces.sqlite')
    await fs.writeFile(dbPath, 'test-sqlite-data')

    db = knex({
      client: 'better-sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
    })

    const originalStat = fs.stat
    vi.spyOn(fs, 'stat').mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('-wal')) {
        throw new Error('GENERIC_IO_ERROR_NO_CODE')
      }
      return originalStat(filePath)
    })

    const adapter = new SqliteMetadataDiagnosticAdapter(db, dbPath)
    const storage = await adapter.checkStorage()

    expect(storage.isSuccess()).toBe(true)
    if (storage.isSuccess()) {
      expect(storage.success.measurement.status).toBe('unavailable')
      if (storage.success.measurement.status === 'unavailable') {
        expect(storage.success.measurement.reason).toContain(
          'GENERIC_IO_ERROR_NO_CODE',
        )
      }
    }
  })

  it('reports unavailable measurement when SQLite file does not exist', async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    })
    const adapter = new SqliteMetadataDiagnosticAdapter(
      db,
      'C:/non-existent-path/db.sqlite',
    )

    const storage = await adapter.checkStorage()
    expect(storage.isSuccess()).toBe(true)
    if (storage.isSuccess()) {
      expect(storage.success.measurement.status).toBe('unavailable')
    }
  })

  it('reports fail check with reason when table does not exist or query fails', async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    })
    const adapter = new SqliteMetadataDiagnosticAdapter(db, ':memory:')

    const probe = await adapter.readProbe()
    expect(probe.isSuccess()).toBe(true)
    if (probe.isSuccess()) {
      expect(probe.success.status).toBe('fail')
      if (probe.success.status === 'fail') {
        expect(probe.success.reason).toBeDefined()
      }
    }
  })
})
