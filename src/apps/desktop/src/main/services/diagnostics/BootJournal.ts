import fs from 'node:fs/promises'
import path from 'node:path'

import type {
  DiagnosticEvent,
  DiagnosticEventLevel,
  DiagnosticScope,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { z } from 'zod'

import type { DiagnosticEventsBuffer } from './DiagnosticEventsBuffer'

const DiagnosticEventSchema = z.object({
  sequence: z.number().int().finite().positive(),
  sessionId: z.string().min(1).max(256),
  generation: z.string().min(1).max(256).optional(),
  origin: z.enum(['boot', 'main', 'dispatcher', 'executor', 'storage', 'sync']),
  level: z.enum(['info', 'warn', 'error']),
  stage: z.string().min(1).max(256),
  scope: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('application') }),
      z.object({
        type: z.literal('workspace'),
        workspaceId: z.string().min(1),
      }),
      z.object({
        type: z.literal('connection'),
        workspaceId: z.string().min(1),
        connectionInstanceId: z.string().min(1),
      }),
    ])
    .optional(),
  correlationId: z.string().min(1).max(256).optional(),
  code: z.string().min(1).max(256).optional(),
  message: z.string().max(4096),
  timestamp: z.string().min(10).max(64),
})

export class BootJournal {
  private readonly currentFile: string
  private readonly previousFile: string
  private sequence = 0
  private writeQueue: Promise<void> = Promise.resolve()
  private lastWriteError: string | undefined
  private initPromise: Promise<void> | null = null
  private isInitialized = false

  constructor(
    private readonly diagnosticsDir: string,
    private readonly sessionId: string,
    private readonly buffer: DiagnosticEventsBuffer,
    private readonly maxFileSizeBytes: number = 64 * 1024,
  ) {
    this.currentFile = path.join(diagnosticsDir, 'boot-current.jsonl')
    this.previousFile = path.join(diagnosticsDir, 'boot-previous.jsonl')
  }

  async initialize(): Promise<void> {
    if (this.initPromise !== null) {
      return this.initPromise
    }
    const op = this.executeInitialize()
    this.initPromise = op
    return op
  }

  recordPhase(
    stage: string,
    level: DiagnosticEventLevel,
    message: string,
    code?: string,
  ): void {
    if (!this.isInitialized) {
      this.lastWriteError = 'BOOT_JOURNAL_NOT_INITIALIZED'
      return
    }

    this.sequence += 1
    const timestamp = new Date().toISOString()
    const sanitizedMessage = this.sanitizeMessage(message)

    this.buffer.record({
      origin: 'boot',
      level,
      stage,
      code,
      message: sanitizedMessage,
      timestamp,
    })

    const rawEntry: DiagnosticEvent = {
      sequence: this.sequence,
      sessionId: this.sessionId,
      origin: 'boot',
      level,
      stage,
      code,
      message: sanitizedMessage,
      timestamp,
    }

    let line = JSON.stringify(rawEntry) + '\n'
    let lineBytes = Buffer.byteLength(line, 'utf8')

    if (lineBytes > this.maxFileSizeBytes) {
      let currentMsg = sanitizedMessage
      while (currentMsg.length > 0 && lineBytes > this.maxFileSizeBytes) {
        currentMsg = currentMsg.slice(0, Math.floor(currentMsg.length / 2))
        line = JSON.stringify({ ...rawEntry, message: currentMsg }) + '\n'
        lineBytes = Buffer.byteLength(line, 'utf8')
      }
      if (lineBytes > this.maxFileSizeBytes) {
        line = JSON.stringify({ ...rawEntry, message: '' }) + '\n'
        lineBytes = Buffer.byteLength(line, 'utf8')
      }
    }

    if (lineBytes > this.maxFileSizeBytes) {
      this.lastWriteError = 'BOOT_JOURNAL_RECORD_OVERSIZED'
      return
    }

    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          let currentSize = 0
          try {
            const stat = await fs.stat(this.currentFile)
            currentSize = stat.size
          } catch (statError) {
            if (
              !this.isMissingFileError(
                typeof statError === 'object' ? statError : null,
              )
            ) {
              const reason =
                statError instanceof Error
                  ? statError.message
                  : 'STAT_FILE_FAILED'
              this.lastWriteError = reason
              return
            }
          }

          if (currentSize + lineBytes > this.maxFileSizeBytes) {
            try {
              await fs.rename(this.currentFile, this.previousFile)
            } catch (renameError) {
              if (
                !this.isMissingFileError(
                  typeof renameError === 'object' ? renameError : null,
                )
              ) {
                const reason =
                  renameError instanceof Error
                    ? renameError.message
                    : 'ROTATION_RENAME_FAILED'
                this.lastWriteError = reason
                return
              }
            }
          }

          await fs.appendFile(this.currentFile, line, 'utf8')
        } catch (error) {
          this.lastWriteError =
            error instanceof Error ? error.message : 'FILE_APPEND_ERROR'
        }
      })
      .catch((error) => {
        this.lastWriteError =
          error instanceof Error ? error.message : 'QUEUE_ERROR'
      })
  }

  async readCurrentJournal(): Promise<Either<AppError, DiagnosticEvent[]>> {
    return this.readJournalBounded(this.currentFile)
  }

  async readPreviousJournal(): Promise<Either<AppError, DiagnosticEvent[]>> {
    return this.readJournalBounded(this.previousFile)
  }

  async flush(): Promise<Either<AppError, void>> {
    await this.writeQueue
    if (this.lastWriteError !== undefined) {
      return Either.failure(AppError.Internal(this.lastWriteError))
    }
    return Either.success()
  }

  getLastError(): string | undefined {
    return this.lastWriteError
  }

  private async executeInitialize(): Promise<void> {
    try {
      await fs.mkdir(this.diagnosticsDir, { recursive: true })
      let exists = false
      try {
        await fs.access(this.currentFile)
        exists = true
      } catch (accessError) {
        if (
          !this.isMissingFileError(
            typeof accessError === 'object' ? accessError : null,
          )
        ) {
          const reason =
            accessError instanceof Error
              ? accessError.message
              : 'ACCESS_CHECK_FAILED'
          this.lastWriteError = reason
          this.isInitialized = true
          return
        }
      }

      if (exists) {
        try {
          await fs.rename(this.currentFile, this.previousFile)
        } catch (error) {
          this.lastWriteError =
            error instanceof Error ? error.message : 'ROTATION_FAILED'
        }
      }
      this.isInitialized = true
    } catch (error) {
      this.lastWriteError =
        error instanceof Error ? error.message : 'DIR_INIT_FAILED'
      this.isInitialized = true
    }
  }

  private async readJournalBounded(
    filePath: string,
  ): Promise<Either<AppError, DiagnosticEvent[]>> {
    let handle: fs.FileHandle | null = null
    try {
      handle = await fs.open(filePath, 'r')
      const stat = await handle.stat()
      if (stat.size > this.maxFileSizeBytes) {
        return Either.failure(
          AppError.Internal(
            `BOOT_JOURNAL_FILE_EXCEEDS_MAX_SIZE: ${stat.size} > ${this.maxFileSizeBytes}`,
          ),
        )
      }

      const buffer = Buffer.alloc(stat.size)
      await handle.read(buffer, 0, stat.size, 0)
      const content = buffer.toString('utf8')
      const lines = content.split('\n')
      const events: DiagnosticEvent[] = []

      let lineNumber = 0
      for (const line of lines) {
        lineNumber += 1
        const trimmed = line.trim()
        if (trimmed.length === 0) continue

        let raw: object | null = null
        try {
          raw = JSON.parse(trimmed)
        } catch {
          return Either.failure(
            AppError.Internal(
              `BOOT_JOURNAL_CORRUPT_JSON at line ${lineNumber}`,
            ),
          )
        }

        const parsed = DiagnosticEventSchema.safeParse(raw)
        if (!parsed.success) {
          return Either.failure(
            AppError.Internal(
              `BOOT_JOURNAL_INVALID_SCHEMA at line ${lineNumber}`,
            ),
          )
        }

        let scope: DiagnosticScope | undefined
        if (parsed.data.scope !== undefined) {
          if (parsed.data.scope.type === 'application') {
            scope = { type: 'application' }
          }
          if (parsed.data.scope.type === 'workspace') {
            scope = {
              type: 'workspace',
              workspaceId: parsed.data.scope.workspaceId,
            }
          }
          if (parsed.data.scope.type === 'connection') {
            scope = {
              type: 'connection',
              workspaceId: parsed.data.scope.workspaceId,
              connectionInstanceId: parsed.data.scope.connectionInstanceId,
            }
          }
        }
        events.push({
          sequence: parsed.data.sequence,
          sessionId: parsed.data.sessionId,
          generation: parsed.data.generation,
          origin: parsed.data.origin,
          level: parsed.data.level,
          stage: parsed.data.stage,
          scope,
          correlationId: parsed.data.correlationId,
          code: parsed.data.code,
          message: parsed.data.message,
          timestamp: parsed.data.timestamp,
        })
      }

      return Either.success(events)
    } catch (error) {
      if (this.isMissingFileError(typeof error === 'object' ? error : null)) {
        return Either.success([])
      }
      const message =
        error instanceof Error ? error.message : 'FAILED_TO_READ_JOURNAL'
      return Either.failure(AppError.Internal(message))
    } finally {
      if (handle !== null) {
        await handle.close().catch(() => undefined)
      }
    }
  }

  private isFileSystemError(error: object | null): error is { code?: string } {
    if (error === null) return false
    return 'code' in error
  }

  private isMissingFileError(error: object | null): boolean {
    if (!this.isFileSystemError(error)) return false
    return error.code === 'ENOENT'
  }

  private sanitizeMessage(message: string): string {
    return message
      .replace(/bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      .replace(/token[=:][\s]*['"]?[a-zA-Z0-9_\-.]+['"]?/gi, 'token=[REDACTED]')
      .replace(/password[=:][\s]*['"]?[^\s'"]+['"]?/gi, 'password=[REDACTED]')
      .replace(/key[=:][\s]*['"]?[a-zA-Z0-9_\-.]+['"]?/gi, 'key=[REDACTED]')
      .replace(/https?:\/\/[^\s?]+\?[^\s]*/gi, (match) => {
        const urlWithoutQuery = match.split('?')[0]
        return urlWithoutQuery + '?[REDACTED_PARAMS]'
      })
  }
}
