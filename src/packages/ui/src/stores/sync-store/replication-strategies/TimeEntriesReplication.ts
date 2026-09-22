import { IOpenAPI, SyncTimeEntryDTO } from '@mr-tick/sdk'
import { TimeEntryViewModel } from '@mr-tick/shared/view-models'
import { RxCollection } from 'rxdb'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import {
  IReplicationStrategy,
  ReplicationCheckpoint,
  RxReplicationWriteToMasterRow,
} from '../types'

interface ValidationErrorPayload {
  messageKey?: string
  message?: string
  details?: Record<string, string[]>
}

const formatValidationErrorMessage = (
  validationError: ValidationErrorPayload | null | undefined,
): string => {
  if (!validationError) return 'Erro de validação desconhecido'

  let baseMessage = 'Erro de validação'
  if (validationError.messageKey) baseMessage = validationError.messageKey
  if (validationError.message) baseMessage = validationError.message

  if (!validationError.details) return baseMessage

  const detailParts: string[] = []
  for (const [field, errors] of Object.entries(validationError.details)) {
    if (Array.isArray(errors) && errors.length > 0) {
      detailParts.push(`${field}: ${errors.join(', ')}`)
    }
  }

  if (detailParts.length === 0) return baseMessage

  return `${baseMessage} (${detailParts.join('; ')})`
}

const dateToISO = (
  value: Date | string | null | undefined,
): string | undefined => {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()

  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) return parsedDate.toISOString()

  return String(value)
}

export class TimeEntriesReplication implements IReplicationStrategy<
  SyncTimeEntryRxDBDTO,
  ReplicationCheckpoint
> {
  private readonly inFlightPushDocIds = new Set<string>()
  private readonly lastPushedDocTimestamps = new Map<string, number>()

  constructor(
    private client: IOpenAPI,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
    private collection?: RxCollection<SyncTimeEntryRxDBDTO>,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTimeEntryRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const res = await this.client.services.timeEntries.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint ? checkpoint.id : '',
          updatedAt: checkpoint ? new Date(checkpoint.updatedAt) : new Date(0),
        },
      },
    })

    const data: TimeEntryViewModel[] = res.data ? res.data : []
    if (data.length === 0) {
      if (checkpoint) {
        return { documents: [], checkpoint }
      }
      return {
        documents: [],
        checkpoint: {
          updatedAt: new Date(0).toISOString(),
          id: '',
        },
      }
    }
    const last = data[data.length - 1]
    const nowIso = new Date().toISOString()

    const existingDocs = this.collection
      ? await this.collection
          .find({
            selector: {
              connectionInstanceId: this.connectionInstanceId,
            },
          })
          .exec()
      : []

    const existingByRemoteId = new Map<string, SyncTimeEntryRxDBDTO>()
    const seenRemoteIds = new Set<string>()

    for (const doc of existingDocs) {
      const docData = doc.toMutableJSON()
      if (!docData.remoteId) continue
      if (seenRemoteIds.has(docData.remoteId)) {
        await doc.remove()
        continue
      }
      seenRemoteIds.add(docData.remoteId)
      existingByRemoteId.set(docData.remoteId, docData)
    }

    const docs: SyncTimeEntryRxDBDTO[] = []

    for (const item of data) {
      const remoteId = String(item.id)
      const existingLocalDoc = existingByRemoteId.get(remoteId)

      let docId: string = crypto.randomUUID()

      if (existingLocalDoc) {
        if (existingLocalDoc.syncStatus === 'conflict') continue
        if (existingLocalDoc.syncStatus === 'pending_push') continue
        if (existingLocalDoc.syncStatus === 'local_only') continue

        const parsedUpdatedAt = dateToISO(item.updatedAt)
        const remoteUpdatedTime = parsedUpdatedAt
          ? new Date(parsedUpdatedAt).getTime()
          : 0
        const localUpdatedTime = new Date(existingLocalDoc.updatedAt).getTime()

        if (localUpdatedTime > remoteUpdatedTime) continue

        docId = existingLocalDoc.id
      }

      for (const d of existingDocs) {
        const dData = d.toMutableJSON()
        if (dData.id !== docId && dData.remoteId === remoteId) {
          await d.remove()
        }
      }

      const rawStartDate = dateToISO(item.startDate)
      let resolvedStartDate = rawStartDate
      if (!resolvedStartDate) {
        const rawCreatedAt = dateToISO(item.createdAt)
        resolvedStartDate = rawCreatedAt ? rawCreatedAt : nowIso
      }

      const parsedCreatedAt = dateToISO(item.createdAt)
      const createdAtIso = parsedCreatedAt ? parsedCreatedAt : nowIso

      const parsedUpdatedAt = dateToISO(item.updatedAt)
      const updatedAtIso = parsedUpdatedAt ? parsedUpdatedAt : nowIso

      const parsedEndDate = dateToISO(item.endDate)
      const endDateIso = parsedEndDate ? parsedEndDate : null

      // Support both legacy seconds (> 24) and decimal hours
      let resolvedTimeSpent = item.timeSpent
      if (resolvedTimeSpent > 24) {
        resolvedTimeSpent = Number((resolvedTimeSpent / 3600).toFixed(4))
      }

      let timeStatus: 'running' | 'paused' | 'finished' | 'suggestion' =
        'finished'
      if (existingLocalDoc && existingLocalDoc.timeStatus) {
        timeStatus = existingLocalDoc.timeStatus
      }

      let source: 'manual' | 'timer' | 'ai_suggestion' | 'addon' = 'manual'
      if (existingLocalDoc && existingLocalDoc.source) {
        source = existingLocalDoc.source
      }

      let type: 'increasing' | 'decreasing' | 'manual' = 'manual'
      if (existingLocalDoc && existingLocalDoc.type) {
        type = existingLocalDoc.type
      }

      docs.push({
        id: docId,
        remoteId,
        dataSourceId: this.pluginId,
        connectionInstanceId: this.connectionInstanceId,
        _deleted: false,
        syncStatus: 'synced',
        lastPulledAt: nowIso,
        lastPushedAt: existingLocalDoc ? existingLocalDoc.lastPushedAt : null,
        task: item.task,
        taskData: existingLocalDoc ? existingLocalDoc.taskData : undefined,
        activity: item.activity,
        user: item.user,
        timeSpent: resolvedTimeSpent,
        comments: item.comments,
        startDate: resolvedStartDate,
        endDate: endDateIso,
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
        timeStatus,
        source,
        addonSource: existingLocalDoc
          ? existingLocalDoc.addonSource
          : undefined,
        type,
        journal: existingLocalDoc ? existingLocalDoc.journal : undefined,
        timerConfig: existingLocalDoc
          ? existingLocalDoc.timerConfig
          : undefined,
      })
    }

    const parsedLastUpdatedAt = dateToISO(last.updatedAt)
    const lastUpdatedAtIso = parsedLastUpdatedAt ? parsedLastUpdatedAt : nowIso

    return {
      documents: docs,
      checkpoint: {
        updatedAt: lastUpdatedAtIso,
        id: String(last.id),
      },
    }
  }

  async push(
    rows: RxReplicationWriteToMasterRow<SyncTimeEntryRxDBDTO>[],
  ): Promise<SyncTimeEntryRxDBDTO[]> {
    const eligibleRows: RxReplicationWriteToMasterRow<SyncTimeEntryRxDBDTO>[] =
      []

    for (const row of rows) {
      const doc = row.newDocumentState
      if (this.inFlightPushDocIds.has(doc.id)) continue
      if (doc.connectionInstanceId !== this.connectionInstanceId) continue
      if (doc.syncStatus === 'local_only') continue
      if (doc.syncStatus === 'conflict') continue
      if (!doc._deleted && doc.syncStatus !== 'pending_push') continue
      if (
        !doc._deleted &&
        (!doc.task || !doc.task.id || doc.task.id.trim() === '')
      )
        continue
      if (
        !doc._deleted &&
        (!doc.activity || !doc.activity.id || doc.activity.id.trim() === '')
      )
        continue

      const lastPushTime = this.lastPushedDocTimestamps.get(doc.id)
      if (lastPushTime && Date.now() - lastPushTime < 3000 && !doc._deleted) {
        continue
      }

      if (this.collection) {
        const liveDoc = await this.collection.findOne(doc.id).exec()
        if (!liveDoc && !doc._deleted) continue
        if (liveDoc) {
          const liveData = liveDoc.toMutableJSON()
          if (!doc._deleted && liveData.syncStatus !== 'pending_push') {
            continue
          }
          if (!doc.remoteId && liveData.remoteId) {
            doc.remoteId = liveData.remoteId
          }
        }
      }

      eligibleRows.push(row)
    }

    if (eligibleRows.length === 0) return []

    for (const row of eligibleRows) {
      this.inFlightPushDocIds.add(row.newDocumentState.id)
    }

    try {
      const entries: SyncTimeEntryDTO[] = eligibleRows.map((row) => {
        const doc = row.newDocumentState
        const assumedState = row.assumedMasterState

        let entryId = doc.id
        if (doc.remoteId) {
          entryId = doc.remoteId
        }

        const entry: SyncTimeEntryDTO = {
          id: entryId,
          _deleted: doc._deleted,
          task: { id: doc.task.id },
          activity: { id: doc.activity.id, name: doc.activity.name },
          user: { id: doc.user.id, name: doc.user.name },
          timeSpent: doc.timeSpent,
          comments: doc.comments,
          startDate: doc.startDate ? new Date(doc.startDate) : undefined,
          endDate: doc.endDate ? new Date(doc.endDate) : undefined,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        }

        if (assumedState) {
          let assumedId = assumedState.id
          if (assumedState.remoteId) {
            assumedId = assumedState.remoteId
          }
          let assumedUpdatedAt = new Date(assumedState.updatedAt)
          if (doc.lastPulledAt) {
            const pulledDate = new Date(doc.lastPulledAt)
            if (
              !Number.isNaN(pulledDate.getTime()) &&
              pulledDate.getTime() > assumedUpdatedAt.getTime()
            ) {
              assumedUpdatedAt = pulledDate
            }
          }

          entry.assumedMasterState = {
            id: assumedId,
            task: { id: assumedState.task.id },
            activity: {
              id: assumedState.activity.id,
              name: assumedState.activity.name,
            },
            user: { id: assumedState.user.id, name: assumedState.user.name },
            timeSpent: assumedState.timeSpent,
            comments: assumedState.comments,
            startDate: assumedState.startDate
              ? new Date(assumedState.startDate)
              : undefined,
            endDate: assumedState.endDate
              ? new Date(assumedState.endDate)
              : undefined,
            createdAt: new Date(assumedState.createdAt),
            updatedAt: assumedUpdatedAt,
          }
        }

        return entry
      })

      const res = await this.client.services.timeEntries.push({
        body: {
          workspaceId: this.workspaceId,
          pluginId: this.pluginId,
          connectionInstanceId: this.connectionInstanceId,
          entries,
        },
      })

      const serverItems = res.data ? res.data : []
      const nowIso = new Date().toISOString()

      for (const item of serverItems) {
        const matchingRow = eligibleRows.find((row) => {
          const rowDoc = row.newDocumentState
          if (
            'originalId' in item &&
            typeof item.originalId === 'string' &&
            (rowDoc.id === item.originalId ||
              rowDoc.remoteId === item.originalId)
          ) {
            return true
          }
          return rowDoc.id === item.id || rowDoc.remoteId === item.id
        })
        if (!matchingRow) continue

        if (item.validationError) {
          const friendlyError = formatValidationErrorMessage(
            item.validationError,
          )

          if (this.collection) {
            const docId = matchingRow.newDocumentState.id
            const localDoc = await this.collection.findOne(docId).exec()
            if (localDoc) {
              await localDoc.incrementalPatch({
                syncStatus: 'error',
                syncError: friendlyError,
              })
            }
          }
          continue
        }

        if (item.conflicted) {
          const conflictData = item.conflictData
            ? {
                server: item.conflictData.server
                  ? {
                      id: item.conflictData.server.id,
                      startDate: dateToISO(item.conflictData.server.startDate),
                      endDate: dateToISO(item.conflictData.server.endDate)
                        ? dateToISO(item.conflictData.server.endDate)
                        : null,
                      timeSpent: item.conflictData.server.timeSpent,
                      comments: item.conflictData.server.comments,
                      updatedAt: dateToISO(item.conflictData.server.updatedAt),
                      task: item.conflictData.server.task,
                      activity: item.conflictData.server.activity,
                    }
                  : undefined,
                local: item.conflictData.local
                  ? {
                      id: item.conflictData.local.id,
                      startDate: dateToISO(item.conflictData.local.startDate),
                      endDate: dateToISO(item.conflictData.local.endDate)
                        ? dateToISO(item.conflictData.local.endDate)
                        : null,
                      timeSpent: item.conflictData.local.timeSpent,
                      comments: item.conflictData.local.comments,
                      updatedAt: dateToISO(item.conflictData.local.updatedAt),
                      task: item.conflictData.local.task,
                      activity: item.conflictData.local.activity,
                    }
                  : undefined,
              }
            : undefined

          if (this.collection) {
            const docId = matchingRow.newDocumentState.id
            const localDoc = await this.collection.findOne(docId).exec()
            if (localDoc) {
              await localDoc.incrementalPatch({
                syncStatus: 'conflict',
                conflictData,
                lastPulledAt: nowIso,
              })
            }
          }
          continue
        }

        // Sucesso na gravação remota do item
        if (this.collection) {
          const docId = matchingRow.newDocumentState.id
          const localDoc = await this.collection.findOne(docId).exec()
          if (localDoc) {
            const finalRemoteId = item.id ? String(item.id) : null
            const parsedUpdatedAt = dateToISO(item.updatedAt)
            const finalUpdatedAt = parsedUpdatedAt ? parsedUpdatedAt : nowIso

            await localDoc.incrementalPatch({
              remoteId: finalRemoteId,
              syncStatus: 'synced',
              lastPushedAt: nowIso,
              lastPulledAt: finalUpdatedAt,
              updatedAt: finalUpdatedAt,
              syncError: null,
            })

            this.lastPushedDocTimestamps.set(docId, Date.now())
          }
        }
      }
    } finally {
      for (const row of eligibleRows) {
        this.inFlightPushDocIds.delete(row.newDocumentState.id)
      }
    }

    return []
  }
}
