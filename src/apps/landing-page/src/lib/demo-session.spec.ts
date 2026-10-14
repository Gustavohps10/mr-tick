import type { WorkspaceViewModel } from '@mr-tick/application'
import { createRxDatabase } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { describe, expect, it } from 'vitest'

import { createDemoWorkspace } from './demo-session'

const template: WorkspaceViewModel = {
  id: 'default',
  name: 'Demo',
  description: '',
  avatarUrl: '',
  status: 'configured',
  dataSourceConnections: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

function openMemoryWorkspace(workspace: WorkspaceViewModel) {
  return createRxDatabase({
    name: 'db-memory-' + workspace.id,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
    ignoreDuplicate: false,
    closeDuplicates: false,
  })
}

describe('landing demo workspace isolation', () => {
  it('gives each mounting its own identity without modifying the template', () => {
    const first = createDemoWorkspace(template)
    const second = createDemoWorkspace(template)
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toBe('default')
    expect(template.id).toBe('default')
  })

  it('reproduces DB8 for overlapping copies of the old fixed workspace', async () => {
    const repeated = { ...template, id: crypto.randomUUID() }
    const db = await openMemoryWorkspace(repeated)
    await expect(openMemoryWorkspace(repeated)).rejects.toMatchObject({
      code: 'DB8',
    })
    await db.close()
  })

  it('opens a new demo while the previous demo is still alive without DB8', async () => {
    const first = await openMemoryWorkspace(createDemoWorkspace(template))
    const second = await openMemoryWorkspace(createDemoWorkspace(template))
    expect(first.name).not.toBe(second.name)
    expect(first.closed).toBe(false)
    expect(second.closed).toBe(false)
    await Promise.all([first.close(), second.close()])
  })
})
