import { TimeEntryDTO, TimeEntryPullCheckpointDTO } from '@mr-tick/application'
import { describe, expect, it } from 'vitest'

import { createTimeEntrySnapshotPage } from './createTimeEntrySnapshotPage'

function permutations(items: string[]): string[][] {
  if (items.length === 0) return [[]]
  return items.flatMap((item, index) =>
    permutations(items.slice(0, index).concat(items.slice(index + 1))).map(
      (remaining) => [item, ...remaining],
    ),
  )
}

function entry(id: string): TimeEntryDTO {
  return {
    id,
    task: { id: 'task' },
    activity: { id: 'activity' },
    user: { id: 'member' },
    timeSpent: 1,
    comments: 'snapshot entry ' + id,
    createdAt: new Date('2026-10-04T10:00:00Z'),
    updatedAt: new Date('2026-10-04T11:00:00Z'),
  }
}

const cases = [
  {
    name: 'mixed numeric and textual IDs',
    ids: ['2', '10', '1a'],
    expected: ['2', '10', '1a'],
  },
  {
    name: 'numeric IDs beyond the safe integer range',
    ids: ['9007199254740992', '9007199254740993', '9007199254740994'],
    expected: ['9007199254740992', '9007199254740993', '9007199254740994'],
  },
  {
    name: 'distinct IDs with the same numeric value',
    ids: ['1', '01', '001'],
    expected: ['001', '01', '1'],
  },
]

describe('createTimeEntrySnapshotPage ordering', () => {
  it.each(cases)(
    'keeps the fingerprint invariant for $name in every source permutation',
    async ({ ids }) => {
      const snapshots = new Set<string>()
      for (const order of permutations(ids)) {
        const result = await createTimeEntrySnapshotPage(
          order.map(entry),
          { id: '', updatedAt: new Date(0) },
          1,
          'member',
        )
        expect(result.isSuccess()).toBe(true)
        snapshots.add(result.success.snapshotId)
      }
      expect(snapshots.size).toBe(1)
    },
  )
  it.each(cases)(
    'keeps the digest and pages invariant for $name',
    async ({ ids, expected }) => {
      const orders = permutations(ids)
      const snapshots = new Set<string>()
      const pages: string[][] = []
      for (const [orderIndex, order] of orders.entries()) {
        let checkpoint: TimeEntryPullCheckpointDTO = {
          id: '',
          updatedAt: new Date(0),
        }
        const imported: string[] = []
        for (let index = 0; index < ids.length; index++) {
          const sourceOrder = orders[(orderIndex + index) % orders.length]
          const result = await createTimeEntrySnapshotPage(
            sourceOrder.map(entry),
            checkpoint,
            1,
            'member',
          )
          expect(result.isSuccess()).toBe(true)
          const page = result.success
          snapshots.add(page.snapshotId)
          imported.push(
            ...page.items.flatMap((item) => (item.id ? [item.id] : [])),
          )
          checkpoint = page.checkpoint
          expect(page.hasMore).toBe(index < ids.length - 1)
        }
        pages.push(imported)
        const completed = await createTimeEntrySnapshotPage(
          [...order].reverse().map(entry),
          checkpoint,
          1,
          'member',
        )
        expect(completed.isSuccess()).toBe(true)
        expect(completed.success.items).toEqual([])
        expect(completed.success.hasMore).toBe(false)
      }
      expect(snapshots.size).toBe(1)
      for (const page of pages) expect(page).toEqual(expected)
    },
  )
})
