import { beforeEach, describe, expect, it } from 'vitest'

import { FakeAnalyticsProvider } from './FakeAnalyticsProvider'
import { FakeDatabaseStore } from './FakeDatabaseStore'

describe('FakeAnalyticsProvider Analytics Datasets', () => {
  let provider: FakeAnalyticsProvider

  beforeEach(() => {
    FakeDatabaseStore.resetInstance()
    provider = new FakeAnalyticsProvider()
  })

  it('deve listar os datasets analíticos simulados disponíveis', async () => {
    const result = await provider.listAnalyticsDatasets()

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success).toHaveLength(6)
      expect(result.success.map((d) => d.id)).toContain('fake_time_entries')
      expect(result.success.map((d) => d.id)).toContain('fake_issues')
      expect(result.success.map((d) => d.id)).toContain('fake_projects')
      expect(result.success.map((d) => d.id)).toContain('fake_users')
      expect(result.success.map((d) => d.id)).toContain('fake_versions')
      expect(result.success.map((d) => d.id)).toContain('fake_issue_journals')
    }
  })

  it('declares explicit selection instead of legacy date_range filter', async () => {
    const listResult = await provider.listAnalyticsDatasets()
    expect(listResult.isSuccess()).toBe(true)

    const issuesManifest = listResult.success.find(
      (dataset) => dataset.id === 'fake_issues',
    )
    const entriesManifest = listResult.success.find(
      (dataset) => dataset.id === 'fake_time_entries',
    )

    expect(issuesManifest?.selection).toEqual({
      dateRange: true,
      project: true,
    })
    expect(issuesManifest?.extraction).toEqual({
      modes: ['snapshot', 'changes'],
      identity: { kind: 'row', columns: ['id'] },
      changes: { deletions: 'explicit' },
    })
    expect(
      issuesManifest?.supportedFilters?.some((f) => f.id === 'date_range'),
    ).toBe(false)
    expect(
      entriesManifest?.supportedFilters?.some((f) => f.id === 'date_range'),
    ).toBe(false)

    const rejectedLegacyFilter = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_time_entries',
      filters: { date_range: { from: '2026-09-01', to: '2026-09-30' } },
    })
    expect(rejectedLegacyFilter.isFailure()).toBe(true)
  })

  it('deve consultar o dataset fake_time_entries com sucesso e retornar linhas estruturadas', async () => {
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_time_entries',
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.dataset.id).toBe('fake_time_entries')
      expect(result.success.rows.length).toBeGreaterThan(0)

      const [firstRow] = result.success.rows
      expect(firstRow).toBeDefined()
      expect(firstRow).toHaveProperty('project')
      expect(firstRow).toHaveProperty('hours')
      expect(typeof firstRow?.hours).toBe('number')
    }
  })

  it('deve consultar o dataset fake_issues com sucesso e retornar tarefas estruturadas', async () => {
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.dataset.id).toBe('fake_issues')
      expect(result.success.rows.length).toBeGreaterThan(0)

      const [firstRow] = result.success.rows
      expect(firstRow).toBeDefined()
      expect(firstRow).toHaveProperty('title')
      expect(firstRow).toHaveProperty('status')
      expect(firstRow).toHaveProperty('custom_pontos')
      expect(firstRow).toHaveProperty('updated_date')
    }
  })

  it('deve consultar os datasets de transições e sprints com sucesso', async () => {
    const transitionsRes = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issue_journals',
    })
    expect(transitionsRes.isSuccess()).toBe(true)

    const sprintsRes = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_versions',
    })
    expect(sprintsRes.isSuccess()).toBe(true)
  })

  it('deve retornar NotFound ao consultar dataset desconhecido', async () => {
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'dataset_inexistente',
    })

    expect(result.isFailure()).toBe(true)
  })

  it('offers native project and member values accepted by its own extraction', async () => {
    const projects = await provider.getFilterOptions('projects')
    const project = projects.success.find(
      (option) => option.value === 'Projeto Alpha',
    )
    expect(project).toBeDefined()
    if (!project) return
    const members = await provider.getFilterOptions('members')
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_time_entries',
      filters: {
        project_id: project.value,
        user_id: members.success.map((option) => option.value),
      },
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success.rows.length).toBeGreaterThan(0)
  })
})

describe('Independent analytics pagination fixture', () => {
  it('serves disjoint preview batches, emits partial intermediate coverage, and rejects a cursor moved to a different scope', async () => {
    FakeDatabaseStore.resetInstance()
    const provider = new FakeAnalyticsProvider()
    const first = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: { kind: 'snapshot', batchSize: 2 },
    })
    expect(first.success.rows).toHaveLength(2)
    expect(first.success.execution.coverage).toBe('partial')
    const execution = first.success.execution
    if (execution.kind !== 'snapshot' || execution.continuation === undefined)
      throw new Error('Expected continuation')
    const cursor = execution.continuation.cursor
    const second = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: { kind: 'snapshot', batchSize: 2, cursor },
    })
    expect(second.success.rows).toHaveLength(2)
    expect(
      second.success.rows.some((row) =>
        first.success.rows.some((previous) => previous.id === row.id),
      ),
    ).toBe(false)
    expect(
      (
        await provider.fetchAnalyticsDataset({
          datasetId: 'fake_issues',
          projectId: 'different',
          execution: { kind: 'snapshot', batchSize: 2, cursor },
        })
      ).isFailure(),
    ).toBe(true)
  })

  it('emits snapshot checkpoint when finished and omits checkpoint when scope has zero rows', async () => {
    FakeDatabaseStore.resetInstance()
    const provider = new FakeAnalyticsProvider()

    const empty = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      projectId: 'Projeto Inexistente',
    })
    expect(empty.isSuccess()).toBe(true)
    expect(empty.success.rows).toHaveLength(0)
    if (empty.success.execution.kind !== 'snapshot')
      throw new Error('Expected snapshot')
    expect(empty.success.execution.coverage).toBe('complete')
    expect(empty.success.execution.checkpoint).toBeUndefined()

    const scoped = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      projectId: 'SDK fixtures',
    })
    expect(scoped.isSuccess()).toBe(true)
    expect(scoped.success.rows.length).toBeGreaterThan(0)
    if (scoped.success.execution.kind !== 'snapshot')
      throw new Error('Expected snapshot')
    expect(scoped.success.execution.coverage).toBe('complete')
    expect(scoped.success.execution.checkpoint).toBeDefined()
  })

  it('supports paginated changes with inserts, updates, explicit deletedIds, idle second poll, and rejects mutated checkpoint cursor', async () => {
    FakeDatabaseStore.resetInstance()
    const store = FakeDatabaseStore.getInstance()
    const provider = new FakeAnalyticsProvider()

    let checkpoint: string | undefined
    let cursor: string | undefined

    for (let page = 0; page < 50; page += 1) {
      const batch = await provider.fetchAnalyticsDataset({
        datasetId: 'fake_issues',
        execution: { kind: 'snapshot', batchSize: 100, cursor },
      })
      expect(batch.isSuccess()).toBe(true)
      if (batch.success.execution.kind !== 'snapshot')
        throw new Error('Expected snapshot')
      if (batch.success.execution.continuation === undefined) {
        checkpoint = batch.success.execution.checkpoint
        break
      }
      expect(batch.success.execution.coverage).toBe('partial')
      expect(batch.success.execution.checkpoint).toBeUndefined()
      cursor = batch.success.execution.continuation.cursor
    }

    expect(checkpoint).toBeDefined()
    if (checkpoint === undefined) return

    const existing = store.findTaskById('SDK-CONTEXT-1')
    expect(existing).toBeDefined()
    if (existing === undefined) return

    store.saveTask({
      ...existing,
      title: 'SDK context updated',
    })
    store.saveTask({
      id: 'DELTA-NEW-1',
      title: 'Delta Inserted 1',
      projectName: 'Projeto DEV',
      status: { id: 'progress', name: 'In Progress' },
      createdAt: new Date('2026-11-05T10:00:00.000Z'),
      updatedAt: new Date(),
    })
    store.saveTask({
      id: 'DELTA-NEW-2',
      title: 'Delta Inserted 2',
      projectName: 'Projeto DEV',
      status: { id: 'done', name: 'Done' },
      doneRatio: 100,
      createdAt: new Date('2026-11-06T10:00:00.000Z'),
      updatedAt: new Date(),
    })
    expect(store.deleteTask('DEV-9999')).toBe(true)

    const deltaFirst = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: { kind: 'changes', checkpoint, batchSize: 2 },
    })
    expect(deltaFirst.isSuccess()).toBe(true)
    if (deltaFirst.success.execution.kind !== 'changes')
      throw new Error('Expected changes')
    expect(deltaFirst.success.rows).toHaveLength(2)
    expect(deltaFirst.success.execution.deletedIds).toEqual(['DEV-9999'])
    expect(deltaFirst.success.execution.coverage).toBe('partial')
    expect(deltaFirst.success.execution.checkpoint).toBe(checkpoint)
    expect(deltaFirst.success.execution.continuation?.cursor).toBeDefined()

    const deltaCursor = deltaFirst.success.execution.continuation?.cursor
    expect(
      (
        await provider.fetchAnalyticsDataset({
          datasetId: 'fake_issues',
          execution: {
            kind: 'changes',
            checkpoint: '2026-01-01T00:00:00.000Z',
            batchSize: 2,
            cursor: deltaCursor,
          },
        })
      ).isFailure(),
    ).toBe(true)

    const deltaSecond = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: {
        kind: 'changes',
        checkpoint,
        batchSize: 2,
        cursor: deltaCursor,
      },
    })
    expect(deltaSecond.isSuccess()).toBe(true)
    if (deltaSecond.success.execution.kind !== 'changes')
      throw new Error('Expected changes')
    expect(deltaSecond.success.rows).toHaveLength(1)
    expect(deltaSecond.success.execution.deletedIds).toEqual([])
    expect(deltaSecond.success.execution.coverage).toBe('complete')
    expect(deltaSecond.success.execution.continuation).toBeUndefined()

    const nextCheckpoint = deltaSecond.success.execution.checkpoint
    expect(nextCheckpoint > checkpoint).toBe(true)

    const idlePoll = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: { kind: 'changes', checkpoint: nextCheckpoint, batchSize: 2 },
    })
    expect(idlePoll.isSuccess()).toBe(true)
    if (idlePoll.success.execution.kind !== 'changes')
      throw new Error('Expected changes')
    expect(idlePoll.success.rows).toHaveLength(0)
    expect(idlePoll.success.execution.deletedIds).toEqual([])
    expect(idlePoll.success.execution.coverage).toBe('complete')
    expect(idlePoll.success.execution.checkpoint).toBe(nextCheckpoint)
  })
})

describe('Declared remote aggregation fixture', () => {
  it('returns only requested groups and native measure aliases and rejects an unsupported metric', async () => {
    FakeDatabaseStore.resetInstance()
    const provider = new FakeAnalyticsProvider()
    const result = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_time_entries',
      execution: {
        kind: 'aggregate',
        groupBy: ['project'],
        measures: [
          { name: 'mean_hours', column: 'hours', operator: 'average' },
          { name: 'entries', operator: 'count' },
        ],
      },
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success.dataset.columns.map((column) => column.name)).toEqual(
      ['project', 'mean_hours', 'entries'],
    )
    expect(result.success.execution).toMatchObject({
      kind: 'aggregate',
      coverage: 'complete',
    })
    expect(
      result.success.rows.every(
        (row) => typeof row.entries === 'number' && row.entries > 0,
      ),
    ).toBe(true)
    const invalid = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_time_entries',
      execution: {
        kind: 'aggregate',
        groupBy: ['project'],
        measures: [{ name: 'bad', column: 'user', operator: 'average' }],
      },
    })
    expect(invalid.isFailure()).toBe(true)
  })
})
