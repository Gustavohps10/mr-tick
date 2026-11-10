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
  it('serves disjoint preview batches and rejects a cursor moved to a different scope', async () => {
    FakeDatabaseStore.resetInstance()
    const provider = new FakeAnalyticsProvider()
    const first = await provider.fetchAnalyticsDataset({
      datasetId: 'fake_issues',
      execution: { kind: 'snapshot', batchSize: 2 },
    })
    expect(first.success.rows).toHaveLength(2)
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
