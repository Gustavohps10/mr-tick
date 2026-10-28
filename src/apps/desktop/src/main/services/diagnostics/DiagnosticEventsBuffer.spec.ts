import { describe, expect, it } from 'vitest'

import { DiagnosticEventsBuffer } from './DiagnosticEventsBuffer'

describe('DiagnosticEventsBuffer', () => {
  it('records events with monotonic sequence and session ID', () => {
    const buffer = new DiagnosticEventsBuffer('session-1', 10, 10000)
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 'startup',
      message: 'App started',
    })
    buffer.record({
      origin: 'main',
      level: 'warn',
      stage: 'window',
      message: 'Window displayed',
    })

    const events = buffer.getEvents()
    expect(events).toHaveLength(2)
    expect(events[0]?.sequence).toBe(1)
    expect(events[0]?.sessionId).toBe('session-1')
    expect(events[0]?.message).toBe('App started')
    expect(events[1]?.sequence).toBe(2)
    expect(events[1]?.sessionId).toBe('session-1')
    expect(events[1]?.message).toBe('Window displayed')
    expect(buffer.getDiscardedCount()).toBe(0)
  })

  it('discards oldest events when maxEntries limit is exceeded', () => {
    const buffer = new DiagnosticEventsBuffer('session-1', 3, 100000)
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's1',
      message: 'm1',
    })
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's2',
      message: 'm2',
    })
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's3',
      message: 'm3',
    })
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's4',
      message: 'm4',
    })

    const events = buffer.getEvents()
    expect(events).toHaveLength(3)
    expect(events[0]?.stage).toBe('s2')
    expect(events[1]?.stage).toBe('s3')
    expect(events[2]?.stage).toBe('s4')
    expect(buffer.getDiscardedCount()).toBe(1)
  })

  it('discards oldest events when byte limit is exceeded', () => {
    const buffer = new DiagnosticEventsBuffer('session-1', 100, 300)
    const longMessage = 'A'.repeat(80)
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's1',
      message: longMessage,
    })
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's2',
      message: longMessage,
    })
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 's3',
      message: longMessage,
    })

    const events = buffer.getEvents()
    expect(buffer.getDiscardedCount()).toBeGreaterThanOrEqual(1)
    expect(events.length).toBeLessThanOrEqual(2)
    expect(buffer.getCurrentBytes()).toBeLessThanOrEqual(300)
  })

  it('discards single huge message exceeding maxBytes with discardedCount and preserves buffer capacity', () => {
    const buffer = new DiagnosticEventsBuffer('session-1', 10, 200)
    const hugeMessage = 'Z'.repeat(10000)
    buffer.record({
      origin: 'boot',
      level: 'info',
      stage: 'huge',
      message: hugeMessage,
    })

    const events = buffer.getEvents()
    expect(events).toHaveLength(0)
    expect(buffer.getDiscardedCount()).toBe(1)
    expect(buffer.getCurrentBytes()).toBe(0)
  })

  it('accurately counts multi-byte UTF-8 Unicode characters against byte limit', () => {
    const buffer = new DiagnosticEventsBuffer('session-1', 10, 250)
    // 4-byte emojis
    const unicodeMessage = '🚀'.repeat(20)
    buffer.record({
      origin: 'main',
      level: 'info',
      stage: 'unicode',
      message: unicodeMessage,
    })

    expect(buffer.getCurrentBytes()).toBeGreaterThan(80)
    expect(buffer.getCurrentBytes()).toBeLessThanOrEqual(250)
    expect(buffer.getEvents()).toHaveLength(1)
  })
})
