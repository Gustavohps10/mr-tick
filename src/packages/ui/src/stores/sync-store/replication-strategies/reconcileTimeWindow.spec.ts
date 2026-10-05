import { describe, expect, it } from 'vitest'

import { reconcileTimeWindow } from './reconcileTimeWindow'

describe('provider canonical window', () => {
  it('uses the remote start even if another provider preserves real start times', () => {
    expect(
      reconcileTimeWindow({
        startDate: '2026-09-24T15:00:00Z',
        endDate: '2026-09-24T16:19:48Z',
        timeSpent: 1.33,
      }),
    ).toEqual({
      startDate: '2026-09-24T15:00:00Z',
      endDate: '2026-09-24T16:19:48Z',
    })
  })
  it('keeps an absent end instead of mixing unrelated local and remote dates', () => {
    expect(
      reconcileTimeWindow({ startDate: '2026-09-24T23:59:00Z', timeSpent: 0 }),
    ).toEqual({ startDate: '2026-09-24T23:59:00Z', endDate: null })
  })
})
