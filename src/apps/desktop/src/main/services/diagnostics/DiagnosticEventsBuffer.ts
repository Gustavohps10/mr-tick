import type {
  DiagnosticEvent,
  DiagnosticEventLevel,
  DiagnosticEventOrigin,
  DiagnosticScope,
} from '@mr-tick/application'

interface InternalDiagnosticEvent extends DiagnosticEvent {
  byteLength: number
}

export interface RecordEventInput {
  generation?: string
  origin: DiagnosticEventOrigin
  level: DiagnosticEventLevel
  stage: string
  scope?: DiagnosticScope
  correlationId?: string
  code?: string
  message: string
  timestamp?: string
}

export class DiagnosticEventsBuffer {
  private readonly entries: InternalDiagnosticEvent[] = []
  private sequence = 0
  private discardedCount = 0
  private currentBytes = 0
  private isRecording = false

  constructor(
    private readonly sessionId: string,
    private readonly maxEntries: number = 150,
    private readonly maxBytes: number = 64 * 1024,
  ) {}

  record(input: RecordEventInput): void {
    if (this.isRecording) return
    if (this.maxEntries <= 0 || this.maxBytes <= 0) return
    this.isRecording = true
    try {
      this.sequence += 1
      const timestamp =
        input.timestamp !== undefined
          ? input.timestamp
          : new Date().toISOString()

      const rawEvent: DiagnosticEvent = {
        sequence: this.sequence,
        sessionId: this.sessionId,
        generation: input.generation,
        origin: input.origin,
        level: input.level,
        stage: input.stage,
        scope: input.scope,
        correlationId: input.correlationId,
        code: input.code,
        message: input.message,
        timestamp,
      }

      const eventBytes = Buffer.byteLength(JSON.stringify(rawEvent), 'utf8')
      if (eventBytes > this.maxBytes) {
        this.discardedCount += 1
        return
      }

      while (
        this.entries.length >= this.maxEntries ||
        (this.entries.length > 0 &&
          this.currentBytes + eventBytes > this.maxBytes)
      ) {
        const oldest = this.entries.shift()
        if (oldest !== undefined) {
          this.currentBytes -= oldest.byteLength
          this.discardedCount += 1
        }
      }

      const event: InternalDiagnosticEvent = {
        ...rawEvent,
        byteLength: eventBytes,
      }

      this.entries.push(event)
      this.currentBytes += eventBytes
    } finally {
      this.isRecording = false
    }
  }

  push(event: DiagnosticEvent): void {
    this.record({
      generation: event.generation,
      origin: event.origin,
      level: event.level,
      stage: event.stage,
      scope: event.scope,
      correlationId: event.correlationId,
      code: event.code,
      message: event.message,
      timestamp: event.timestamp,
    })
  }

  getEvents(): DiagnosticEvent[] {
    return this.entries.map((item) => ({
      sequence: item.sequence,
      sessionId: item.sessionId,
      generation: item.generation,
      origin: item.origin,
      level: item.level,
      stage: item.stage,
      scope: item.scope,
      correlationId: item.correlationId,
      code: item.code,
      message: item.message,
      timestamp: item.timestamp,
    }))
  }

  getDiscardedCount(): number {
    return this.discardedCount
  }

  getCurrentBytes(): number {
    return this.currentBytes
  }
}
