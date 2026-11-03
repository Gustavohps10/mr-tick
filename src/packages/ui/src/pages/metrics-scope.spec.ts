import { createRxDatabase, type RxDatabase } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConnectionScope } from '@/lib/connection-scope'
import {
  fetchActivityData,
  fetchAvgHoursData,
  fetchEnhancedAnalyticsData,
  fetchHeatmapData,
  fetchPeriodSummaryData,
  fetchQualityData,
  fetchSummaryData,
  fetchTimelineData,
  getEntriesForRange,
} from '@/pages/metrics'

let db: RxDatabase
let sequence = 0
const from = new Date('2026-11-02T00:00:00.000Z')
const to = new Date('2026-11-02T23:59:59.999Z')
const range = { from, to }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'))
  db = await createRxDatabase({
    name: `qadockmetrics${++sequence}`,
    storage: getRxStorageMemory(),
    multiInstance: false,
  })
  await db.addCollections({
    timeEntries: {
      schema: {
        version: 0,
        primaryKey: 'id',
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', maxLength: 200 },
          connectionInstanceId: { type: 'string', maxLength: 100 },
          startDate: { type: 'string', maxLength: 40 },
          endDate: { type: 'string' },
          createdAt: { type: 'string' },
          timeSpent: { type: 'number' },
          comments: { type: 'string' },
          task: { type: 'object', additionalProperties: true },
          activity: { type: 'object', additionalProperties: true },
        },
        required: ['id', 'startDate'],
      },
    },
  })

  for (const [suffix, hours] of [
    ['a', 1],
    ['b', 2],
    ['c', 4],
  ] as const) {
    await db.timeEntries.insert({
      id: `conn-${suffix}::entry`,
      connectionInstanceId: `conn-${suffix}`,
      startDate: '2026-11-02T08:00:00.000Z',
      endDate: new Date(Date.UTC(2026, 10, 2, 8 + hours)).toISOString(),
      createdAt: '2026-11-02T08:00:00.000Z',
      timeSpent: hours,
      comments: 'QA deterministic comment',
      task: { id: 'shared-task' },
      activity: { id: `activity-${suffix}`, name: `Activity ${suffix}` },
    })
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db?.remove()
  vi.useRealTimers()
})

describe('Production metrics functions + real RxDB selectors (not rendered UI)', () => {
  for (const scenario of [
    {
      scope: { kind: 'all' } as ConnectionScope,
      hours: 7,
      count: 3,
      buckets: [1, 2],
    },
    {
      scope: { kind: 'subset', ids: ['conn-a'] } as ConnectionScope,
      hours: 1,
      count: 1,
      buckets: [1, 0],
    },
    {
      scope: { kind: 'subset', ids: ['conn-a', 'conn-b'] } as ConnectionScope,
      hours: 3,
      count: 2,
      buckets: [1, 1],
    },
    {
      scope: { kind: 'none' } as ConnectionScope,
      hours: 0,
      count: 0,
      buckets: [0, 0],
    },
  ]) {
    it(`exercises all nine real functions for ${JSON.stringify(scenario.scope)}`, async () => {
      // Only the fixture's database type is partial. The actual production
      // functions and RxDB implementation execute unchanged.
      const database = db as unknown as Parameters<typeof fetchSummaryData>[0]
      const find = vi.spyOn(db.timeEntries, 'find')
      const entries = await getEntriesForRange(
        database,
        from,
        to,
        scenario.scope,
      )
      expect(entries).toHaveLength(scenario.count)
      const summary = await fetchSummaryData(database, scenario.scope)
      expect(summary).toEqual({
        today: scenario.hours,
        week: scenario.hours,
        month: scenario.hours,
      })
      const period = await fetchPeriodSummaryData(
        database,
        range,
        scenario.scope,
      )
      expect(period).toMatchObject({
        totalHours: scenario.hours,
        totalEntries: scenario.count,
        overtimeHours: 0,
      })
      const timeline = await fetchTimelineData(database, range, scenario.scope)
      expect(
        timeline.timelineData.reduce((sum, item) => sum + item.dailyHours, 0),
      ).toBe(scenario.hours)
      const averages = await fetchAvgHoursData(database, range, scenario.scope)
      expect(averages.reduce((sum, item) => sum + item.averageHours, 0)).toBe(
        scenario.hours,
      )
      const heatmap = await fetchHeatmapData(database, range, scenario.scope)
      expect(
        Object.values(heatmap)
          .flatMap(Object.values)
          .reduce((sum, hours) => sum + hours, 0),
      ).toBe(scenario.hours)
      const activities = await fetchActivityData(
        database,
        range,
        scenario.scope,
      )
      expect(
        activities.reduce((sum, activity) => sum + activity.hours, 0),
      ).toBe(scenario.hours)
      expect(activities).toHaveLength(scenario.count)
      const quality = await fetchQualityData(database, range, scenario.scope)
      expect(quality.quality.noCommentPercent).toBe(0)
      expect(
        quality.punctualityData.reduce((sum, bucket) => sum + bucket.value, 0),
      ).toBe(scenario.count)
      const analytics = await fetchEnhancedAnalyticsData(
        database,
        range,
        scenario.scope,
      )
      expect(analytics.effort.deepWorkHours).toBe(scenario.hours)
      expect(
        analytics.sessionDistribution.find((bucket) => bucket.range === '1-2h')
          ?.count,
      ).toBe(scenario.buckets.at(0))
      expect(
        analytics.sessionDistribution.find((bucket) => bucket.range === '2h+')
          ?.count,
      ).toBe(scenario.buckets.at(1))
      expect(analytics.effort.deepWorkPercent).toBe(
        scenario.count === 0 ? 0 : 100,
      )
      expect(
        analytics.focusAnalysis.reduce((sum, item) => sum + item.deepWork, 0),
      ).toBe(scenario.hours)

      if (scenario.scope.kind === 'none') {
        expect(find).not.toHaveBeenCalled()
        return
      }

      expect(find).toHaveBeenCalledTimes(9)
      for (const [query] of find.mock.calls) {
        if (scenario.scope.kind === 'subset')
          expect(query?.selector).toMatchObject({
            connectionInstanceId: { $in: scenario.scope.ids },
          })
        if (scenario.scope.kind === 'all')
          expect(query?.selector).not.toHaveProperty('connectionInstanceId')
      }
    })
  }
})
