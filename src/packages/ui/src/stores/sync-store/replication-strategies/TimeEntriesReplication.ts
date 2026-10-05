import { IHostBridge } from '@mr-tick/application'
import {
  SyncDocumentViewModel,
  TimeEntryViewModel,
} from '@mr-tick/shared/view-models'
import {
  defaultHashSha256,
  normalizeMangoQuery,
  prepareQuery,
  RxCollection,
  RxDocument,
} from 'rxdb'

import {
  SyncTimeEntryRxDBDTO,
  TimeEntryRemoteState,
} from '@/local-db/schemas/time-entries-sync-schema'

import { ReplicationError } from '../ReplicationError'
import {
  IReplicationStrategy,
  ReplicationCheckpoint,
  RxReplicationWriteToMasterRow,
} from '../types'
import { reconcileTimeWindow } from './reconcileTimeWindow'
import {
  hasBusinessChanges,
  snapshotDocument,
  toPushEntry,
  toRemoteState,
} from './timeEntrySyncState'

type PushResult = SyncDocumentViewModel<TimeEntryViewModel>

interface PullObservationContext {
  documents: Map<string, string>
  retryRequired: boolean
}

interface PushMetadata {
  document: SyncTimeEntryRxDBDTO
  creationAttempted: boolean
}

function errorMessage(error: PushResult['validationError']): string {
  if (!error) return 'SYNC_PUSH_FAILED'
  const details = error.details
    ? Object.entries(error.details).map(
        ([field, errors]) => `${field}: ${errors.join(', ')}`,
      )
    : []
  if (details.length === 0) return error.messageKey
  return `${error.messageKey} (${details.join('; ')})`
}

export class TimeEntriesReplication implements IReplicationStrategy<
  SyncTimeEntryRxDBDTO,
  ReplicationCheckpoint
> {
  private readonly inFlightPushDocIds = new Set<string>()

  constructor(
    private readonly client: Pick<IHostBridge, 'timeEntries'>,
    private readonly workspaceId: string,
    private readonly connectionInstanceId: string,
    private readonly pluginId: string,
    private readonly collection?: RxCollection<SyncTimeEntryRxDBDTO>,
  ) {}

  /** Queries include tombstones: a delete can race with a successful POST. */
  private async localDocument(
    id: string,
  ): Promise<RxDocument<SyncTimeEntryRxDBDTO> | undefined> {
    if (!this.collection) return undefined
    const stored = await this.collection.storageInstance.findDocumentsById(
      [id],
      true,
    )
    const data = stored.find((item) => item.id === id)
    if (!data) return undefined
    return this.collection._docCache.getCachedRxDocument(data)
  }

  private async documentsByRemoteIds(
    ids: string[],
  ): Promise<RxDocument<SyncTimeEntryRxDBDTO>[]> {
    const collection = this.collection
    if (!collection || ids.length === 0) return []
    // RxCollection.find() always filters deleted documents. Query storage directly
    // so exact remote identity can locate both active documents and tombstones.
    const query = normalizeMangoQuery(collection.schema.jsonSchema, {
      selector: {
        connectionInstanceId: this.connectionInstanceId,
        remoteId: { $in: ids },
      },
      sort: [{ id: 'asc' }],
    })
    const result = await collection.storageInstance.query(
      prepareQuery(collection.schema.jsonSchema, query),
    )
    return result.documents.map((document) =>
      collection._docCache.getCachedRxDocument(document),
    )
  }

  async getDocumentError(): Promise<Error | null> {
    const collection = this.collection
    if (!collection) return null
    const query = normalizeMangoQuery(collection.schema.jsonSchema, {
      selector: {
        connectionInstanceId: this.connectionInstanceId,
        syncStatus: { $in: ['error', 'ambiguous', 'pending_push', 'creating'] },
      },
      sort: [{ id: 'asc' }],
    })
    const result = await collection.storageInstance.query(
      prepareQuery(collection.schema.jsonSchema, query),
    )
    const messages = result.documents.flatMap((document) =>
      document.syncError ? [document.syncError] : [],
    )
    if (messages.length === 0) return null
    const failures = result.documents.flatMap((document) =>
      document.syncFailure ? [document.syncFailure] : [],
    )
    return new ReplicationError([...new Set(messages)].join('; '), failures)
  }

  private applyCanonical(
    doc: SyncTimeEntryRxDBDTO,
    state: TimeEntryRemoteState,
  ): SyncTimeEntryRxDBDTO {
    const window = reconcileTimeWindow(state)
    return {
      ...doc,
      remoteId: state.id,
      remoteState: state,
      remoteUpdatedAt: state.updatedAt,
      task: state.task,
      taskData:
        doc.taskData?.sourceId === state.task.id ? doc.taskData : undefined,
      activity: state.activity,
      user: state.user,
      timeSpent: state.timeSpent,
      comments: state.comments ? state.comments : null,
      startDate: window.startDate ? window.startDate : doc.startDate,
      endDate: window.endDate,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      syncStatus: 'synced',
      creationAttemptId: null,
      creationState: null,
      confirmationState: null,
      conflictData: undefined,
      syncError: null,
      syncFailure: null,
    }
  }

  private pullObservation(document: SyncTimeEntryRxDBDTO): string {
    return JSON.stringify({
      connectionInstanceId: document.connectionInstanceId,
      remoteId: document.remoteId,
      deleted: document._deleted,
      remoteDeleted: document.remoteDeleted,
      deletionConfirmed: document.deletionConfirmed,
      syncStatus: document.syncStatus,
      business: snapshotDocument(document),
      remoteState: document.remoteState,
      creationState: document.creationState,
      confirmationState: document.confirmationState,
      creationAttemptId: document.creationAttemptId,
      lastPushedAt: document.lastPushedAt,
    })
  }

  private async observePullDocuments(): Promise<Map<string, string>> {
    const collection = this.collection
    if (!collection) return new Map()
    const query = normalizeMangoQuery(collection.schema.jsonSchema, {
      selector: { connectionInstanceId: this.connectionInstanceId },
      sort: [{ id: 'asc' }],
    })
    const result = await collection.storageInstance.query(
      prepareQuery(collection.schema.jsonSchema, query),
    )
    return new Map(
      result.documents.map((document) => [
        document.id,
        this.pullObservation(document),
      ]),
    )
  }

  private async modifyObservedPullDocument(
    document: RxDocument<SyncTimeEntryRxDBDTO>,
    context: PullObservationContext,
    state: TimeEntryRemoteState,
    modify: (draft: SyncTimeEntryRxDBDTO) => SyncTimeEntryRxDBDTO,
    operation: 'canonical' | 'ambiguity' = 'canonical',
  ): Promise<RxDocument<SyncTimeEntryRxDBDTO> | undefined> {
    let applied = false
    let retryRequired = false
    const observation = context.documents.get(document.id)
    const updated = await document.incrementalModify((draft) => {
      applied = false
      retryRequired = false
      if (
        observation === undefined ||
        this.pullObservation(draft) !== observation
      ) {
        const currentState = draft.remoteState
        const acknowledged =
          draft.connectionInstanceId === this.connectionInstanceId &&
          draft.remoteId === state.id &&
          currentState &&
          (currentState.updatedAt > state.updatedAt ||
            (currentState.updatedAt === state.updatedAt &&
              !draft._deleted &&
              !hasBusinessChanges(currentState, state)))
        retryRequired =
          draft.syncStatus === 'synced' &&
          (!draft._deleted ||
            (Boolean(draft.remoteDeleted) && !draft.deletionConfirmed)) &&
          !acknowledged
        return draft
      }
      if (
        draft.connectionInstanceId !== this.connectionInstanceId ||
        (operation === 'canonical' &&
          draft.remoteId &&
          draft.remoteId !== state.id) ||
        (operation === 'canonical' &&
          draft.remoteState &&
          draft.remoteState.updatedAt > state.updatedAt)
      )
        return draft
      const next = modify(draft)
      applied = next !== draft
      return next
    })
    if (retryRequired) context.retryRequired = true
    if (!applied) return undefined
    return updated
  }
  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTimeEntryRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    let next = checkpoint
    let snapshotId: string | undefined
    const documents: SyncTimeEntryRxDBDTO[] = []
    while (true) {
      const page = await this.pullBatch(
        next,
        batchSize - documents.length,
        snapshotId,
      )
      documents.push(...page.documents)
      next = page.checkpoint
      if (!page.hasMore || documents.length >= batchSize)
        return { documents, checkpoint: next }
      snapshotId = page.snapshotId
    }
  }
  private async pullBatch(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
    expectedSnapshotId: string | undefined,
  ): Promise<{
    documents: SyncTimeEntryRxDBDTO[]
    checkpoint: ReplicationCheckpoint
    hasMore: boolean
    snapshotId: string
  }> {
    const context: PullObservationContext = {
      documents: await this.observePullDocuments(),
      retryRequired: false,
    }
    const response = await this.client.timeEntries.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint ? checkpoint.id : '',
          updatedAt: checkpoint ? new Date(checkpoint.updatedAt) : new Date(0),
          cursor: checkpoint?.cursor,
        },
      },
    })
    if (!response.isSuccess)
      return Promise.reject(
        new ReplicationError(
          response.error ? response.error : 'SYNC_PULL_FAILED',
          [
            {
              messageKey: response.error ? response.error : 'SYNC_PULL_FAILED',
              statusCode: response.statusCode,
            },
          ],
        ),
      )
    const page = response.data
    if (!page)
      return Promise.reject(
        new ReplicationError('TIME_ENTRY_PULL_PAGE_MISSING', [
          { messageKey: 'TIME_ENTRY_PULL_PAGE_MISSING', statusCode: 503 },
        ]),
      )
    if (
      expectedSnapshotId !== undefined &&
      page.snapshotId !== expectedSnapshotId
    )
      return Promise.reject(
        new ReplicationError('TIME_ENTRY_PULL_SNAPSHOT_CHANGED', [
          { messageKey: 'TIME_ENTRY_PULL_SNAPSHOT_CHANGED', statusCode: 503 },
        ]),
      )
    const pageTime = new Date(page.checkpoint.updatedAt).getTime()
    const previousTime = checkpoint
      ? new Date(checkpoint.updatedAt).getTime()
      : 0
    const previousId = checkpoint ? checkpoint.id : ''
    const unchangedCheckpoint =
      page.checkpoint.id === previousId &&
      pageTime === previousTime &&
      page.checkpoint.cursor === checkpoint?.cursor
    if (
      !Number.isFinite(pageTime) ||
      !page.snapshotId ||
      page.items.length > batchSize ||
      (page.hasMore && unchangedCheckpoint)
    )
      return Promise.reject(
        new ReplicationError('TIME_ENTRY_PULL_PAGE_INVALID', [
          { messageKey: 'TIME_ENTRY_PULL_PAGE_INVALID', statusCode: 503 },
        ]),
      )
    const items = page.items
    const documents: SyncTimeEntryRxDBDTO[] = []
    const existing = await this.documentsByRemoteIds(
      items.flatMap((item) => (item.id ? [item.id] : [])),
    )

    const remoteIdsByCorrelation = new Map<string, Set<string>>()
    for (const item of items) {
      if (!item.correlationId || !item.id) continue
      const ids = remoteIdsByCorrelation.get(item.correlationId)
      if (ids) {
        ids.add(item.id)
        continue
      }
      remoteIdsByCorrelation.set(item.correlationId, new Set([item.id]))
    }

    for (const item of items) {
      if (!item.id) continue
      const state = toRemoteState(item, item.id)
      let local = existing.find((doc) => doc.remoteId === item.id)
      if (!local && item.correlationId)
        local = await this.localDocument(item.correlationId)
      if (!local) local = await this.localDocument(item.id)
      if (local && local.connectionInstanceId !== this.connectionInstanceId)
        local = undefined
      const correlationIds = item.correlationId
        ? remoteIdsByCorrelation.get(item.correlationId)
        : undefined
      if (
        (correlationIds && correlationIds.size > 1) ||
        (local?.remoteId && local.remoteId !== item.id)
      ) {
        if (local)
          await this.modifyObservedPullDocument(
            local,
            context,
            state,
            (draft) => ({
              ...draft,
              syncStatus: 'ambiguous',
              syncError: 'MULTIPLE_REMOTE_TIME_ENTRIES_FOR_CORRELATION',
            }),
            'ambiguity',
          )
        continue
      }
      if (local) {
        const current = local.toMutableJSON(true)
        if (
          current.syncStatus === 'conflict' ||
          current.syncStatus === 'local_only'
        )
          continue
        if (current._deleted && current.deletionConfirmed) continue
        if (current._deleted && current.remoteDeleted) {
          const restored = await this.modifyObservedPullDocument(
            local,
            context,
            state,
            (draft) => {
              if (!draft._deleted || !draft.remoteDeleted) return draft
              return {
                ...this.applyCanonical(draft, state),
                _deleted: false,
                remoteDeleted: false,
              }
            },
          )
          if (restored?.syncStatus === 'synced' && !restored._deleted)
            documents.push(restored.toMutableJSON(true))
          continue
        }
        if (current._deleted) {
          if (current.remoteId) continue
          // Keep the tombstone and bind its ID so the pending delete reaches the provider.
          await this.modifyObservedPullDocument(
            local,
            context,
            state,
            (draft) => ({
              ...draft,
              remoteId: state.id,
              remoteState: state,
              remoteUpdatedAt: state.updatedAt,
              syncStatus: 'pending_push',
            }),
          )
          continue
        }
        // A dirty bound document retains the approved baseline until confirmation
        // or explicit conflict resolution. Pull is observation, not acknowledgement.
        if (
          current.syncStatus !== 'synced' &&
          current.remoteId &&
          (Boolean(current.remoteState) ||
            current.syncStatus === 'pending_push' ||
            current.syncStatus === 'error' ||
            current.syncStatus === 'ambiguous')
        )
          continue
        if (current.syncStatus !== 'synced') {
          const bound = await this.modifyObservedPullDocument(
            local,
            context,
            state,
            (draft) => {
              if (draft.remoteId && draft.remoteId !== state.id) return draft
              if (
                draft.syncStatus === 'conflict' ||
                draft.syncStatus === 'local_only'
              )
                return draft
              const hasEdits = draft.creationState
                ? hasBusinessChanges(
                    snapshotDocument(draft),
                    draft.creationState,
                  )
                : true
              if (hasEdits || draft._deleted)
                return {
                  ...draft,
                  remoteId: state.id,
                  remoteState: state,
                  remoteUpdatedAt: state.updatedAt,
                  syncStatus: 'pending_push',
                  creationAttemptId: null,
                  creationState: null,
                  syncError: null,
                  syncFailure: null,
                }
              return {
                ...this.applyCanonical(draft, state),
                lastPulledAt: new Date().toISOString(),
              }
            },
          )
          if (bound?.syncStatus === 'synced')
            documents.push(bound.toMutableJSON(true))
          continue
        }
        const canonical = this.applyCanonical(current, state)
        const observedCurrent =
          context.documents.get(current.id) === this.pullObservation(current)
        const sameCanonical =
          JSON.stringify(current.remoteState) === JSON.stringify(state) &&
          JSON.stringify({
            ...snapshotDocument(current),
            taskData: current.taskData,
          }) ===
            JSON.stringify({
              ...snapshotDocument(canonical),
              taskData: canonical.taskData,
            })
        if (
          observedCurrent &&
          sameCanonical &&
          !current.remoteDeleted &&
          !current.deletionConfirmed &&
          !current.conflictData &&
          !current.creationState &&
          !current.creationAttemptId &&
          !current.confirmationState &&
          !current.syncError &&
          !current.syncFailure
        )
          continue
        const pulled = await this.modifyObservedPullDocument(
          local,
          context,
          state,
          (draft) => {
            if (draft.syncStatus !== 'synced' || draft._deleted) return draft
            return {
              ...this.applyCanonical(draft, state),
              lastPulledAt: new Date().toISOString(),
            }
          },
        )
        if (pulled?.syncStatus === 'synced' && !pulled.deleted)
          documents.push(pulled.toMutableJSON(true))
        continue
      }
      const now = new Date().toISOString()
      documents.push({
        id:
          'import-' +
          (await defaultHashSha256(
            JSON.stringify([this.connectionInstanceId, state.id]),
          )),
        remoteId: state.id,
        remoteState: state,
        remoteUpdatedAt: state.updatedAt,
        connectionInstanceId: this.connectionInstanceId,
        dataSourceId: this.pluginId,
        _deleted: false,
        syncStatus: 'synced',
        lastPulledAt: now,
        lastPushedAt: null,
        task: state.task,
        activity: state.activity,
        user: state.user,
        timeSpent: state.timeSpent,
        comments: state.comments ? state.comments : null,
        startDate: state.startDate ? state.startDate : state.createdAt,
        endDate: state.endDate ? state.endDate : null,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        timeStatus: 'finished',
        source: 'addon',
        type: 'manual',
      })
    }
    if (context.retryRequired)
      return {
        documents,
        checkpoint: checkpoint
          ? checkpoint
          : { id: '', updatedAt: new Date(0).toISOString() },
        hasMore: false,
        snapshotId: page.snapshotId,
      }
    return {
      documents,
      checkpoint: {
        ...page.checkpoint,
        updatedAt: new Date(page.checkpoint.updatedAt).toISOString(),
      },
      hasMore: page.hasMore,
      snapshotId: page.snapshotId,
    }
  }
  private pushIdentityMatches(
    document: SyncTimeEntryRxDBDTO,
    sent: SyncTimeEntryRxDBDTO,
  ): boolean {
    if (
      document.connectionInstanceId !== sent.connectionInstanceId ||
      document.syncStatus === 'local_only'
    )
      return false
    if (sent.remoteId && document.remoteId !== sent.remoteId) return false
    if (
      sent.creationAttemptId &&
      !document.remoteId &&
      document.creationAttemptId !== sent.creationAttemptId
    )
      return false
    return true
  }

  private async modifyPushDocument(
    document: RxDocument<SyncTimeEntryRxDBDTO>,
    sent: SyncTimeEntryRxDBDTO,
    modify: (draft: SyncTimeEntryRxDBDTO) => SyncTimeEntryRxDBDTO,
  ): Promise<boolean> {
    let applied = false
    await document.incrementalModify((draft) => {
      applied = false
      if (!this.pushIdentityMatches(draft, sent)) return draft
      const next = modify(draft)
      applied = next !== draft
      return next
    })
    return applied
  }

  private async modifyPushFailureDocument(
    document: RxDocument<SyncTimeEntryRxDBDTO>,
    sent: SyncTimeEntryRxDBDTO,
    modify: (draft: SyncTimeEntryRxDBDTO) => SyncTimeEntryRxDBDTO,
  ): Promise<boolean> {
    return this.modifyPushDocument(document, sent, (draft) => {
      if (
        draft.lastPushedAt !== sent.lastPushedAt ||
        JSON.stringify(draft.remoteState) !==
          JSON.stringify(sent.remoteState) ||
        draft.deletionConfirmed !== sent.deletionConfirmed ||
        draft.syncStatus === 'conflict' ||
        (draft.syncStatus === 'synced' && !sent._deleted)
      )
        return draft
      return modify(draft)
    })
  }
  async push(
    rows: RxReplicationWriteToMasterRow<SyncTimeEntryRxDBDTO>[],
  ): Promise<SyncTimeEntryRxDBDTO[]> {
    const metadata = new Map<string, PushMetadata>()
    for (const row of rows) {
      const rowDoc = row.newDocumentState
      if (this.inFlightPushDocIds.has(rowDoc.id)) continue
      if (rowDoc.connectionInstanceId !== this.connectionInstanceId) continue
      const local = await this.localDocument(rowDoc.id)
      let doc = local ? local.toMutableJSON(true) : rowDoc
      if (doc.connectionInstanceId !== this.connectionInstanceId) continue
      if (
        doc._deleted &&
        doc.syncStatus === 'synced' &&
        row.assumedMasterState?._deleted
      )
        continue
      if (
        doc.syncStatus !== 'pending_push' &&
        doc.syncStatus !== 'creating' &&
        !(doc._deleted && doc.syncStatus === 'synced')
      )
        continue
      if (
        !doc._deleted &&
        ((!doc.remoteId && !doc.task.id.trim()) || !doc.activity.id.trim())
      )
        continue
      if (doc._deleted && (doc.remoteDeleted || doc.deletionConfirmed)) continue
      let creationAttempted =
        doc.syncStatus === 'creating' || Boolean(doc.creationState)
      if (
        !doc._deleted &&
        !doc.remoteId &&
        doc.syncStatus === 'pending_push' &&
        local
      ) {
        const attemptId = crypto.randomUUID()
        const claimed = await local.incrementalModify((draft) => {
          if (
            draft.connectionInstanceId !== this.connectionInstanceId ||
            draft.syncStatus !== 'pending_push' ||
            draft.remoteId ||
            draft._deleted
          )
            return draft
          return {
            ...draft,
            syncStatus: 'creating',
            creationAttemptId: attemptId,
            creationState: snapshotDocument(draft),
          }
        })
        doc = claimed.toMutableJSON(true)
        if (doc.creationAttemptId !== attemptId) continue
        creationAttempted = false
      }
      if (doc.connectionInstanceId !== this.connectionInstanceId) continue
      // A version is only meaningful with the business data from the same snapshot.
      if (!doc.remoteState && row.assumedMasterState?.remoteState)
        doc = { ...doc, remoteState: row.assumedMasterState.remoteState }
      metadata.set(doc.id, { document: doc, creationAttempted })
      this.inFlightPushDocIds.add(doc.id)
    }
    if (metadata.size === 0) return []
    try {
      const entries = [...metadata.values()].map((item) =>
        toPushEntry(item.document, item.creationAttempted),
      )
      const response = await this.client.timeEntries.push({
        body: {
          workspaceId: this.workspaceId,
          pluginId: this.pluginId,
          connectionInstanceId: this.connectionInstanceId,
          entries,
        },
      })
      if (!response.isSuccess)
        return Promise.reject(
          new ReplicationError(
            response.error ? response.error : 'SYNC_PUSH_FAILED',
            [
              {
                messageKey: response.error
                  ? response.error
                  : 'SYNC_PUSH_FAILED',
                statusCode: response.statusCode,
              },
            ],
          ),
        )
      const results = response.data ? response.data : []
      let retryError: Error | undefined
      for (const item of results) {
        const sent = [...metadata.values()].find(
          (candidate) =>
            candidate.document.id === item.originalId ||
            candidate.document.id === item.id ||
            candidate.document.remoteId === item.id,
        )
        if (!sent) continue
        const local = await this.localDocument(sent.document.id)
        if (!local) continue
        if (item.confirmationPending) {
          const applied = await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => {
              if (
                draft.lastPushedAt !== sent.document.lastPushedAt ||
                draft.syncStatus === 'conflict' ||
                draft.syncStatus === 'local_only' ||
                (draft.remoteId && draft.remoteId !== item.remoteId)
              )
                return draft
              return {
                ...draft,
                remoteId: item.remoteId,
                confirmationState: draft.confirmationState
                  ? draft.confirmationState
                  : sent.document.creationState
                    ? sent.document.creationState
                    : snapshotDocument(sent.document),
                creationState: null,
                creationAttemptId: null,
                syncStatus: item.syncRetryable ? 'pending_push' : 'error',
                syncError: errorMessage(item.validationError),
                syncFailure: item.validationError ? item.validationError : null,
              }
            },
          )
          if (!applied) continue
          if (item.syncRetryable)
            retryError = new ReplicationError(
              errorMessage(item.validationError),
              item.validationError ? [item.validationError] : [],
            )
          continue
        }
        if (item.syncRetryable) {
          const applied = await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => {
              if (
                (draft.syncStatus === 'synced' && !sent.document._deleted) ||
                draft.lastPushedAt !== sent.document.lastPushedAt ||
                draft.syncStatus === 'conflict' ||
                draft.syncStatus === 'local_only' ||
                draft.remoteState?.updatedAt !==
                  sent.document.remoteState?.updatedAt
              )
                return draft
              return {
                ...draft,
                syncStatus: 'pending_push',
                syncError: errorMessage(item.validationError),
                syncFailure: item.validationError ? item.validationError : null,
              }
            },
          )
          if (!applied) continue
          retryError = new ReplicationError(
            errorMessage(item.validationError),
            item.validationError ? [item.validationError] : [],
          )
          continue
        }
        if (item.creationPending) {
          const applied = await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => ({
              ...draft,
              syncStatus:
                item.creationAttempted === false ? 'pending_push' : 'creating',
              syncError: errorMessage(item.validationError),
              syncFailure: item.validationError ? item.validationError : null,
              creationState:
                item.creationAttempted === false ? null : draft.creationState,
              creationAttemptId:
                item.creationAttempted === false
                  ? null
                  : draft.creationAttemptId,
              remoteId: item.remoteId ? item.remoteId : draft.remoteId,
            }),
          )
          if (!applied) continue
          retryError = new ReplicationError(
            errorMessage(item.validationError),
            item.validationError ? [item.validationError] : [],
          )
          continue
        }
        if (item.creationAmbiguous) {
          await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => {
              if (draft.remoteId && !sent.document.remoteId) return draft
              return {
                ...draft,
                syncStatus: 'ambiguous',
                remoteId: item.remoteId ? item.remoteId : draft.remoteId,
                confirmationState: null,
                syncError: errorMessage(item.validationError),
                syncFailure: item.validationError ? item.validationError : null,
              }
            },
          )
          continue
        }
        if (item.conflicted) {
          const server = item.conflictData?.server
          if (!server || !server.id) continue
          const serverState = toRemoteState(server, server.id)
          await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => ({
              ...draft,
              syncStatus: 'conflict',
              syncError: item.validationError
                ? errorMessage(item.validationError)
                : null,
              syncFailure: item.validationError ? item.validationError : null,
              conflictData: {
                server: serverState,
                local: snapshotDocument(draft),
              },
            }),
          )
          continue
        }
        if (item.validationError) {
          await this.modifyPushFailureDocument(
            local,
            sent.document,
            (draft) => ({
              ...draft,
              syncStatus: 'error',
              syncError: errorMessage(item.validationError),
              syncFailure: item.validationError ? item.validationError : null,
              creationState: null,
              creationAttemptId: null,
            }),
          )
          continue
        }
        if (!item.id) continue
        const state = toRemoteState(item, item.id)
        const now = new Date().toISOString()
        await this.modifyPushDocument(local, sent.document, (draft) => {
          if (draft.connectionInstanceId !== this.connectionInstanceId)
            return draft
          if (sent.document._deleted) {
            if (!draft._deleted || draft.remoteId !== sent.document.remoteId)
              return draft
            return {
              ...draft,
              syncStatus: 'synced',
              deletionConfirmed: true,
              remoteId: state.id,
              creationAttemptId: null,
              creationState: null,
              confirmationState: null,
              syncError: null,
              syncFailure: null,
              lastPushedAt: now,
            }
          }
          // Timestamp precision alone cannot order confirmations from concurrent windows.
          const confirmationChanged =
            draft.lastPushedAt !== sent.document.lastPushedAt ||
            JSON.stringify(draft.remoteState) !==
              JSON.stringify(sent.document.remoteState)
          if (
            draft.remoteState &&
            (draft.remoteState.updatedAt > state.updatedAt ||
              (confirmationChanged &&
                draft.remoteState.updatedAt === state.updatedAt))
          )
            return draft
          if (
            draft.syncStatus === 'synced' &&
            draft.remoteState &&
            !hasBusinessChanges(draft.remoteState, state)
          )
            return draft
          const wasCreation = !sent.document.remoteId
          const creationState = sent.document.creationState
            ? sent.document.creationState
            : snapshotDocument(sent.document)
          const changedDuringRequest = hasBusinessChanges(
            snapshotDocument(draft),
            snapshotDocument(sent.document),
          )
          const editedBeforeRecovery =
            wasCreation &&
            sent.creationAttempted &&
            hasBusinessChanges(snapshotDocument(sent.document), creationState)
          const editedBeforeConfirmation = sent.document.confirmationState
            ? hasBusinessChanges(
                snapshotDocument(sent.document),
                sent.document.confirmationState,
              )
            : false
          const deletionPending = draft._deleted && !sent.document._deleted
          if (
            changedDuringRequest ||
            editedBeforeRecovery ||
            editedBeforeConfirmation ||
            deletionPending
          )
            return {
              ...draft,
              remoteId: state.id,
              remoteState: state,
              remoteUpdatedAt: state.updatedAt,
              syncStatus: 'pending_push',
              creationAttemptId: null,
              creationState: null,
              confirmationState: null,
              syncError: null,
              syncFailure: null,
              lastPushedAt: now,
            }
          return { ...this.applyCanonical(draft, state), lastPushedAt: now }
        })
      }
      // RxDB retries rejected batches using its own backoff. This is the protocol boundary;
      // application/provider failures have already been represented as typed results.
      if (retryError) return Promise.reject(retryError)
      return []
    } finally {
      for (const id of metadata.keys()) this.inFlightPushDocIds.delete(id)
    }
  }
}
