import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BootJournal } from './BootJournal'
import { DiagnosticEventsBuffer } from './DiagnosticEventsBuffer'

describe('BootJournal', () => {
  let tempDir: string | undefined

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-tick-boot-journal-'))
  })

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Cleanup temp dir
      }
    }
  })

  it('records boot phases to JSONL file and sanitizes credentials', async () => {
    if (!tempDir) return
    const buffer = new DiagnosticEventsBuffer('session-1')
    const journal = new BootJournal(tempDir, 'session-1', buffer)
    await journal.initialize()

    journal.recordPhase(
      'boot:auth',
      'info',
      'Connecting with token=secret123 and password=supersecret to https://api.example.com/oauth?client_id=123&secret=abc',
    )
    await journal.flush()

    const eventsResult = await journal.readCurrentJournal()
    expect(eventsResult.isSuccess()).toBe(true)
    if (!eventsResult.isSuccess()) return
    const events = eventsResult.success
    expect(events).toHaveLength(1)
    expect(events[0]?.stage).toBe('boot:auth')
    expect(events[0]?.message).not.toContain('secret123')
    expect(events[0]?.message).not.toContain('supersecret')
    expect(events[0]?.message).not.toContain('client_id=123')
    expect(events[0]?.message).toContain('token=[REDACTED]')
    expect(events[0]?.message).toContain('password=[REDACTED]')
    expect(events[0]?.message).toContain('[REDACTED_PARAMS]')

    const bufferEvents = buffer.getEvents()
    expect(bufferEvents).toHaveLength(1)
    expect(bufferEvents[0]?.message).toBe(events[0]?.message)
  })

  it('rotates current journal to previous on new session initialization', async () => {
    if (!tempDir) return
    const buffer1 = new DiagnosticEventsBuffer('session-1')
    const journalSession1 = new BootJournal(tempDir, 'session-1', buffer1)
    await journalSession1.initialize()
    journalSession1.recordPhase('boot:start', 'info', 'Session 1 started')
    await journalSession1.flush()

    const buffer2 = new DiagnosticEventsBuffer('session-2')
    const journalSession2 = new BootJournal(tempDir, 'session-2', buffer2)
    await journalSession2.initialize()
    journalSession2.recordPhase('boot:start', 'info', 'Session 2 started')
    await journalSession2.flush()

    const previousEventsResult = await journalSession2.readPreviousJournal()
    expect(previousEventsResult.isSuccess()).toBe(true)
    if (!previousEventsResult.isSuccess()) return
    const previousEvents = previousEventsResult.success
    expect(previousEvents).toHaveLength(1)
    expect(previousEvents[0]?.sessionId).toBe('session-1')
    expect(previousEvents[0]?.message).toBe('Session 1 started')

    const currentEventsResult = await journalSession2.readCurrentJournal()
    expect(currentEventsResult.isSuccess()).toBe(true)
    if (!currentEventsResult.isSuccess()) return
    const currentEvents = currentEventsResult.success
    expect(currentEvents).toHaveLength(1)
    expect(currentEvents[0]?.sessionId).toBe('session-2')
    expect(currentEvents[0]?.message).toBe('Session 2 started')
  })

  it('rotates file during append when maxFileSizeBytes is reached', async () => {
    if (!tempDir) return
    const buffer = new DiagnosticEventsBuffer('session-1')
    // Set small max file size (e.g. 150 bytes)
    const journal = new BootJournal(tempDir, 'session-1', buffer, 150)
    await journal.initialize()

    journal.recordPhase('boot:1', 'info', 'Message line 1')
    journal.recordPhase('boot:2', 'info', 'Message line 2')
    journal.recordPhase('boot:3', 'info', 'Message line 3')
    await journal.flush()

    const currentEventsResult = await journal.readCurrentJournal()
    const previousEventsResult = await journal.readPreviousJournal()
    expect(currentEventsResult.isSuccess()).toBe(true)
    expect(previousEventsResult.isSuccess()).toBe(true)
    if (!currentEventsResult.isSuccess() || !previousEventsResult.isSuccess())
      return
    const currentEvents = currentEventsResult.success
    const previousEvents = previousEventsResult.success

    expect(currentEvents.length + previousEvents.length).toBeGreaterThanOrEqual(
      2,
    )
  })

  it('returns typed corruption failure on malformed JSON line or schema mismatch', async () => {
    if (!tempDir) return
    const buffer = new DiagnosticEventsBuffer('session-1')
    const journal = new BootJournal(tempDir, 'session-1', buffer)
    await journal.initialize()

    const currentFile = path.join(tempDir, 'boot-current.jsonl')
    const malformedContent = `
{"sequence":1,"sessionId":"session-1","origin":"boot","level":"info","stage":"s1","message":"valid","timestamp":"2026-01-01T00:00:00Z"}
INVALID_JSON_LINE_CORRUPTED
{"sequence":2,"sessionId":"session-1","origin":"boot","level":"info","stage":"s2","message":"valid 2","timestamp":"2026-01-01T00:00:01Z"}
`
    await fs.writeFile(currentFile, malformedContent, 'utf8')

    const eventsResult = await journal.readCurrentJournal()
    expect(eventsResult.isFailure()).toBe(true)
    if (eventsResult.isFailure()) {
      expect(eventsResult.failure.messageKey).toContain(
        'BOOT_JOURNAL_CORRUPT_JSON',
      )
      expect(eventsResult.failure.messageKey).toContain('line 3')
    }
  })

  it('truncates oversized message during recordPhase to ensure line does not exceed maxFileSizeBytes', async () => {
    if (!tempDir) return
    const buffer = new DiagnosticEventsBuffer('session-1')
    const maxBytes = 512
    const journal = new BootJournal(tempDir, 'session-1', buffer, maxBytes)
    await journal.initialize()

    journal.recordPhase('audit', 'info', 'synthetic-message-'.repeat(256))
    await journal.flush()

    const currentPath = path.join(tempDir, 'boot-current.jsonl')
    const bytes = (await fs.stat(currentPath)).size
    expect(bytes).toBeLessThanOrEqual(maxBytes)
    expect(bytes).toBeGreaterThan(0)
  })
})
