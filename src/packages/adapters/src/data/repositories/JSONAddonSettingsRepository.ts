import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  AddonSettingsSnapshot,
  AddonSettingsValues,
  IAddonSettingsRepository,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { z } from 'zod'

const settingValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
])
const settingsEntrySchema = z
  .object({
    addonId: z.string().min(1),
    scopeKey: z.string().min(1),
    revision: z.number().int().nonnegative(),
    values: z.record(settingValueSchema),
    fieldRevisions: z.record(z.number().int().nonnegative()),
  })
  .strict()
const settingsDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(settingsEntrySchema),
  })
  .strict()

type SettingsEntry = z.infer<typeof settingsEntrySchema>
type SettingsDocument = z.infer<typeof settingsDocumentSchema>

const writers = new Map<string, Promise<void>>()

export class JSONAddonSettingsRepository implements IAddonSettingsRepository {
  private readonly filePath: string

  constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'addon-settings.json')
  }

  public async read(
    addonId: string,
    scopeKey: string,
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    if (!isValidAddress(addonId, scopeKey))
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_ADDRESS_INVALID'),
      )
    const documentResult = await this.readDocument()
    if (documentResult.isFailure()) return documentResult.forwardFailure()
    const entry = documentResult.success.entries.find(
      (item) => item.addonId === addonId && item.scopeKey === scopeKey,
    )
    if (entry === undefined)
      return Either.success({ schemaVersion: 1, revision: 0, values: {} })
    return Either.success(snapshotOf(entry))
  }

  public async patch(
    addonId: string,
    scopeKey: string,
    expectedRevision: number,
    patch: AddonSettingsValues,
    editableFieldIds: readonly string[],
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    if (!isValidAddress(addonId, scopeKey))
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_ADDRESS_INVALID'),
      )
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_REVISION_INVALID'),
      )
    return this.withWriter(async () => {
      const documentResult = await this.readDocument()
      if (documentResult.isFailure()) return documentResult.forwardFailure()
      const document = documentResult.success
      const entryIndex = document.entries.findIndex(
        (item) => item.addonId === addonId && item.scopeKey === scopeKey,
      )
      let current: SettingsEntry = {
        addonId,
        scopeKey,
        revision: 0,
        values: {},
        fieldRevisions: {},
      }
      if (entryIndex >= 0) current = document.entries[entryIndex]
      if (expectedRevision > current.revision)
        return Either.failure(
          AppError.Http(409, 'ADDON_SETTINGS_REVISION_AHEAD'),
        )
      const changedKeys = Object.keys(patch)
      for (const key of changedKeys) {
        if (!editableFieldIds.includes(key))
          return Either.failure(
            AppError.ValidationError('ADDON_SETTINGS_FIELD_NOT_EDITABLE'),
          )
        const fieldRevision = current.fieldRevisions[key]
        if (fieldRevision !== undefined && fieldRevision > expectedRevision)
          return Either.failure(
            AppError.Http(409, 'ADDON_SETTINGS_FIELD_CONFLICT'),
          )
      }
      if (changedKeys.length === 0) return Either.success(snapshotOf(current))
      const nextRevision = current.revision + 1
      const values = { ...current.values }
      const fieldRevisions = { ...current.fieldRevisions }
      for (const key of changedKeys) {
        Object.defineProperty(values, key, {
          value: patch[key],
          enumerable: true,
          configurable: true,
          writable: true,
        })
        fieldRevisions[key] = nextRevision
      }
      const updated: SettingsEntry = {
        ...current,
        revision: nextRevision,
        values,
        fieldRevisions,
      }
      const entries = document.entries.slice()
      if (entryIndex < 0) entries.push(updated)
      if (entryIndex >= 0) entries[entryIndex] = updated
      const writeResult = await this.writeAtomic({
        schemaVersion: 1,
        entries,
      })
      if (writeResult.isFailure()) return writeResult.forwardFailure()
      return Either.success(snapshotOf(updated))
    })
  }

  private async readDocument(): Promise<Either<AppError, SettingsDocument>> {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8')
      const parsed: object = JSON.parse(contents)
      const validation = settingsDocumentSchema.safeParse(parsed)
      if (!validation.success)
        return Either.failure(
          AppError.ValidationError('ADDON_SETTINGS_DOCUMENT_INVALID'),
        )
      const keys = new Set<string>()
      for (const entry of validation.data.entries) {
        const key = addressKey(entry.addonId, entry.scopeKey)
        if (keys.has(key))
          return Either.failure(
            AppError.ValidationError('ADDON_SETTINGS_DOCUMENT_INVALID'),
          )
        keys.add(key)
      }
      return Either.success(validation.data)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return Either.success({ schemaVersion: 1, entries: [] })
      return Either.failure(
        AppError.Internal('ADDON_SETTINGS_DOCUMENT_READ_FAILED'),
      )
    }
  }

  private async writeAtomic(
    document: SettingsDocument,
  ): Promise<Either<AppError, void>> {
    const validation = settingsDocumentSchema.safeParse(document)
    if (!validation.success)
      return Either.failure(
        AppError.ValidationError('ADDON_SETTINGS_DOCUMENT_INVALID'),
      )
    const temporaryPath = `${this.filePath}.${crypto.randomUUID()}.tmp`
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true })
      const handle = await fs.open(temporaryPath, 'wx')
      try {
        await handle.writeFile(JSON.stringify(validation.data, null, 2), 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await fs.rename(temporaryPath, this.filePath)
      return Either.success()
    } catch {
      try {
        await fs.rm(temporaryPath, { force: true })
      } catch {
        return Either.failure(
          AppError.Internal('ADDON_SETTINGS_TEMP_CLEANUP_FAILED'),
        )
      }
      return Either.failure(AppError.Internal('ADDON_SETTINGS_WRITE_FAILED'))
    }
  }

  private async withWriter<T>(operation: () => Promise<T>): Promise<T> {
    const previous = writers.get(this.filePath)
    let release = (): void => undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    writers.set(this.filePath, current)
    if (previous !== undefined) await previous
    try {
      return await operation()
    } finally {
      release()
      if (writers.get(this.filePath) === current) writers.delete(this.filePath)
    }
  }
}

function isValidAddress(addonId: string, scopeKey: string): boolean {
  return addonId.trim().length > 0 && scopeKey.trim().length > 0
}

function addressKey(addonId: string, scopeKey: string): string {
  return JSON.stringify([addonId, scopeKey])
}

function snapshotOf(entry: SettingsEntry): AddonSettingsSnapshot {
  return {
    schemaVersion: 1,
    revision: entry.revision,
    values: { ...entry.values },
  }
}
