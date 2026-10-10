'use client'

import type {
  IHostBridge,
  LocalRuntimeCommand,
  LocalTimerInput,
} from '@mr-tick/application'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from 'react'
import { toast } from 'sonner'
import { createStore, type StoreApi, useStore } from 'zustand'

import { useHostBridge } from '@/hooks'
import type {
  SyncTimeEntryRxDBDTO,
  TimerJournalEntry,
} from '@/local-db/schemas/time-entries-sync-schema'
import { getDatabaseScope } from '@/local-runtime/persistence-client'
import { type AppDatabase, useSyncStore } from '@/stores/syncStore'

export type JournalEntry = TimerJournalEntry
export interface TimerConfig {
  mode: 'countup' | 'countdown'
  manualInitialSeconds?: number
}
export interface CreateTimeEntryData {
  taskId: string
  activityId: string
  activityName?: string
  dataSourceId: string
  type: 'increasing' | 'decreasing' | 'manual'
  connectionInstanceId: string
  comments?: string
  userId?: string
  userName?: string
  mode?: 'countup' | 'countdown'
  manualInitialSeconds?: number
}
export interface TimeEntryState {
  isReady: boolean
  active: SyncTimeEntryRxDBDTO | null
}
export interface TimeEntryActions {
  beginProjection(): void
  observeProjection(entry: SyncTimeEntryRxDBDTO | null): void
  endProjection(): void
  setActive(entry: SyncTimeEntryRxDBDTO | null): void
  clear(): void
  createNewTimeEntry(db: AppDatabase, data: CreateTimeEntryData): Promise<void>
  pauseCurrentTimeEntry(db: AppDatabase): Promise<void>
  playCurrentTimeEntry(db: AppDatabase): Promise<void>
  stopCurrentTimeEntry(db: AppDatabase): Promise<void>
  recoverRunningEntry(db: AppDatabase): Promise<void>
}
export type TimeEntryStore = TimeEntryState & TimeEntryActions

export function createTimeEntryStore(
  client: Pick<IHostBridge, 'localRuntime'>,
): StoreApi<TimeEntryStore> {
  // A reader started before a newer observation must never replace that projection.
  let projectionRevision = 0
  let projectionGeneration = 0
  const refresh = async (
    db: AppDatabase,
    setActive: (record: SyncTimeEntryRxDBDTO | null) => void,
    expectedRevision: number,
  ) => {
    if (expectedRevision !== projectionRevision) return
    const documents = await db.timeEntries
      .find({ selector: { timeStatus: { $in: ['running', 'paused'] } } })
      .exec()
    if (expectedRevision !== projectionRevision) return
    if (documents.length > 1) {
      toast.error('MULTIPLE_ACTIVE_TIMERS')
      return
    }
    for (const document of documents) {
      setActive(document.toMutableJSON())
      return
    }
    setActive(null)
  }
  const request = async (command: LocalRuntimeCommand): Promise<boolean> => {
    const response = await client.localRuntime.request(command)
    if (!response.ok) {
      toast.error(response.error.messageKey)
      return false
    }
    return true
  }
  return createStore<TimeEntryStore>((set, get) => ({
    active: null,
    isReady: false,
    beginProjection: () => {
      projectionGeneration += 1
      projectionRevision += 1
      set({ active: null, isReady: false })
    },
    observeProjection: (entry) => {
      projectionRevision += 1
      set({ active: entry, isReady: true })
    },
    endProjection: () => {
      projectionGeneration += 1
      projectionRevision += 1
      set({ active: null, isReady: false })
    },
    setActive: (entry) => {
      projectionRevision += 1
      set({ active: entry })
    },
    clear: () => {
      projectionRevision += 1
      set({ active: null })
    },
    async createNewTimeEntry(db, data) {
      if (!get().isReady) {
        toast.error('TIMER_PROJECTION_UNAVAILABLE')
        return
      }
      const scope = getDatabaseScope(db)
      if (scope.isFailure()) {
        toast.error(scope.failure.messageKey)
        return
      }
      const expectedGeneration = projectionGeneration
      if (get().active !== null && data.type !== 'manual') {
        await get().stopCurrentTimeEntry(db)
        if (!get().isReady || expectedGeneration !== projectionGeneration) {
          toast.error('TIMER_PROJECTION_UNAVAILABLE')
          return
        }
        if (get().active !== null) return
      }
      let mode: 'countup' | 'countdown' = 'countup'
      if (data.mode !== undefined) mode = data.mode
      let initialSeconds = 0
      if (data.manualInitialSeconds !== undefined)
        initialSeconds = data.manualInitialSeconds
      const payload: LocalTimerInput = {
        taskId: data.taskId,
        activityId: data.activityId,
        activityName: data.activityName,
        connectionInstanceId: data.connectionInstanceId,
        dataSourceId: data.dataSourceId,
        userId: data.userId,
        userName: data.userName,
        comments: data.comments,
        timeSpentSeconds: initialSeconds,
        source: data.type === 'manual' ? 'manual' : 'timer',
        mode,
      }
      const identity = {
        workspaceId: scope.success,
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
      }
      const expectedRevision = projectionRevision
      const success =
        data.type === 'manual'
          ? await request({ ...identity, action: 'create', payload })
          : await request({ ...identity, action: 'timerStart', payload })
      if (!success) return
      await refresh(db, get().observeProjection, expectedRevision)
    },
    async pauseCurrentTimeEntry(db) {
      if (!get().isReady) {
        toast.error('TIMER_PROJECTION_UNAVAILABLE')
        return
      }
      const active = get().active
      if (active === null) return
      const scope = getDatabaseScope(db)
      if (scope.isFailure()) {
        toast.error(scope.failure.messageKey)
        return
      }
      const expectedRevision = projectionRevision
      const success = await request({
        action: 'timerPause',
        workspaceId: scope.success,
        commandId: crypto.randomUUID(),
        entryId: active.id,
      })
      if (success) await refresh(db, get().observeProjection, expectedRevision)
    },
    async playCurrentTimeEntry(db) {
      if (!get().isReady) {
        toast.error('TIMER_PROJECTION_UNAVAILABLE')
        return
      }
      const active = get().active
      if (active === null) return
      const scope = getDatabaseScope(db)
      if (scope.isFailure()) {
        toast.error(scope.failure.messageKey)
        return
      }
      const expectedRevision = projectionRevision
      const success = await request({
        action: 'timerResume',
        workspaceId: scope.success,
        commandId: crypto.randomUUID(),
        entryId: active.id,
      })
      if (success) await refresh(db, get().observeProjection, expectedRevision)
    },
    async stopCurrentTimeEntry(db) {
      if (!get().isReady) {
        toast.error('TIMER_PROJECTION_UNAVAILABLE')
        return
      }
      const active = get().active
      if (active === null) return
      const scope = getDatabaseScope(db)
      if (scope.isFailure()) {
        toast.error(scope.failure.messageKey)
        return
      }
      const expectedRevision = projectionRevision
      const success = await request({
        action: 'timerStop',
        workspaceId: scope.success,
        commandId: crypto.randomUUID(),
        entryId: active.id,
      })
      if (success && expectedRevision === projectionRevision) get().clear()
    },
    async recoverRunningEntry(db) {
      const expectedRevision = projectionRevision
      await refresh(db, get().observeProjection, expectedRevision)
    },
  }))
}

export const TimeEntryContext = createContext<
  StoreApi<TimeEntryStore> | undefined
>(undefined)

export function TimeEntryProvider({ children }: { children: ReactNode }) {
  const client = useHostBridge()
  const db = useSyncStore((state) => state.db)
  const storeRef = useRef<StoreApi<TimeEntryStore> | null>(null)
  if (storeRef.current === null) storeRef.current = createTimeEntryStore(client)
  const store = storeRef.current
  useEffect(() => {
    store.getState().beginProjection()
    if (db === undefined || db === null) return
    const subscription = db.timeEntries
      .find({ selector: { timeStatus: { $in: ['running', 'paused'] } } })
      .$.subscribe({
        next: (documents) => {
          if (documents.length > 1) {
            store.getState().endProjection()
            toast.error('MULTIPLE_ACTIVE_TIMERS')
            return
          }
          for (const document of documents) {
            store.getState().observeProjection(document.toMutableJSON())
            return
          }
          store.getState().observeProjection(null)
        },
        error: (error: Error) => {
          store.getState().endProjection()
          toast.error(error.message)
        },
      })
    return () => {
      subscription.unsubscribe()
      store.getState().endProjection()
    }
  }, [db, store])
  return (
    <TimeEntryContext.Provider value={store}>
      {children}
    </TimeEntryContext.Provider>
  )
}

export function useTimeEntryStore<T>(
  selector: (state: TimeEntryStore) => T,
): T {
  const store = useContext(TimeEntryContext)
  if (!store) {
    throw new Error('useTimeEntryStore must be used inside TimeEntryProvider')
  }
  return useStore(store, selector)
}
