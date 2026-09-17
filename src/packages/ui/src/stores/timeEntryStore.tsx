// stores/timeEntryStore.tsx
'use client'

import { IOpenAPI } from '@mr-tick/sdk'
import { differenceInSeconds, parseISO, subSeconds } from 'date-fns'
import { createContext, ReactNode, useContext, useEffect, useRef } from 'react'
import { createStore, StoreApi, useStore } from 'zustand'

import { useOpenAPI } from '@/hooks'
import {
  SyncTimeEntryRxDBDTO,
  TimerJournalEntry,
} from '@/local-db/schemas/time-entries-sync-schema'
import { AppDatabase, useSyncStore } from '@/stores/syncStore'

export type JournalEntry = TimerJournalEntry

export interface TimerConfig {
  mode: 'countup' | 'countdown'
  manualInitialSeconds?: number
}

export interface CreateTimeEntryData {
  taskId: string
  activityId: string
  dataSourceId: string
  type: 'increasing' | 'decreasing' | 'manual'
  connectionInstanceId: string
  comments?: string
  userId?: string
  mode?: 'countup' | 'countdown'
  manualInitialSeconds?: number
}

export interface TimeEntryState {
  active: SyncTimeEntryRxDBDTO | null
}

export interface TimeEntryActions {
  setActive: (entry: SyncTimeEntryRxDBDTO | null) => void
  clear: () => void
  createNewTimeEntry: (
    db: AppDatabase,
    data: CreateTimeEntryData,
  ) => Promise<void>
  pauseCurrentTimeEntry: (db: AppDatabase) => Promise<void>
  playCurrentTimeEntry: (db: AppDatabase) => Promise<void>
  stopCurrentTimeEntry: (db: AppDatabase) => Promise<void>
  recoverRunningEntry: (db: AppDatabase) => Promise<void>
}

export type TimeEntryStore = TimeEntryState & TimeEntryActions

// Criação da store focada APENAS em transições de estado, sem interagir com ticks por segundo.
export const createTimeEntryStore = (
  client: IOpenAPI,
): StoreApi<TimeEntryStore> => {
  return createStore<TimeEntryStore>((set, get) => ({
    active: null,

    setActive: (entry) => set({ active: entry }),

    clear: () => set({ active: null }),

    async createNewTimeEntry(db, data) {
      const { active, stopCurrentTimeEntry } = get()

      // If it's a manual entry, we probably don't want to touch the currently running timer
      // since it's just logging past time. If they start a real timer, we stop the current one.
      if (active && data.type !== 'manual') {
        await stopCurrentTimeEntry(db)
      }

      const id = crypto.randomUUID()
      const now = new Date()

      const initialSeconds = data.manualInitialSeconds ?? 0

      if (data.type === 'manual') {
        const startDate = subSeconds(now, initialSeconds).toISOString()
        const finalTimeSpentHours = Number((initialSeconds / 3600).toFixed(4))
        const sourceId = `local-${id}`

        const newEntry: SyncTimeEntryRxDBDTO = {
          id: `${data.connectionInstanceId}::${sourceId}`,
          sourceId,
          _deleted: false,
          syncStatus: 'pending_push',
          lastPulledAt: null,
          lastPushedAt: null,
          lastReconciledAt: null,
          connectionInstanceId: data.connectionInstanceId,
          dataSourceId: data.dataSourceId,
          task: { id: data.taskId },
          activity: { id: data.activityId },
          user: { id: data.userId ?? 'local-user' },
          startDate,
          endDate: now.toISOString(),
          timeSpent: finalTimeSpentHours,
          timeStatus: 'finished',
          type: data.type,
          comments: data.comments,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          journal: [],
        }

        await db.timeEntries.insert(newEntry)
        return // Do NOT call client.timer.start() or set active
      }

      const mode = data.mode ?? 'countup'
      const baseSeconds = data.manualInitialSeconds ?? 0
      const initialElapsed = 0
      const startDate = now.toISOString()
      const eventType = 'started'

      const initialJournal: TimerJournalEntry = {
        id: crypto.randomUUID(),
        action: 'start',
        timestamp: now.toISOString(),
        secondsAtMoment: initialElapsed,
        event: eventType,
        at: now.toISOString(),
        secondsAtEvent: initialElapsed,
        ...(initialElapsed > 0 && {
          note: `Ajuste manual para ${initialElapsed} segundos`,
        }),
      }

      const sourceId = `local-${id}`
      const newEntry: SyncTimeEntryRxDBDTO = {
        id: `${data.connectionInstanceId}::${sourceId}`,
        sourceId,
        _deleted: false,
        syncStatus: 'pending_push',
        lastPulledAt: null,
        lastPushedAt: null,
        lastReconciledAt: null,
        connectionInstanceId: data.connectionInstanceId,
        dataSourceId: data.dataSourceId,
        task: { id: data.taskId },
        activity: { id: data.activityId },
        user: { id: data.userId ?? 'local-user' },
        startDate,
        timeSpent: 0,
        timeStatus: 'running',
        type: data.type,
        comments: data.comments,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        journal: [initialJournal],
        timerConfig: {
          mode,
          manualInitialSeconds: baseSeconds,
        },
      }

      await db.timeEntries.insert(newEntry)

      // Comunica o backend via IPC para iniciar o processamento pesado do timer
      client.timer.start({
        initialSeconds,
        elapsedSeconds: initialElapsed,
        mode,
      })

      client.events?.emit?.('time-entry:sync', newEntry)
      set({ active: newEntry })
    },

    async pauseCurrentTimeEntry(db) {
      const { active } = get()
      if (!active || !active.startDate) return

      const doc = await db.timeEntries.findOne(active.id).exec()
      if (!doc) return

      const now = new Date()
      const currentSeconds = differenceInSeconds(
        now,
        parseISO(active.startDate),
      )

      const base =
        active.timerConfig?.mode === 'countup'
          ? (active.timerConfig?.manualInitialSeconds ?? 0)
          : 0
      const totalSeconds = currentSeconds + base
      const finalTimeSpentHours = Number((totalSeconds / 3600).toFixed(4))

      const updatedJournal = [...(active.journal || [])]
      updatedJournal.push({
        id: crypto.randomUUID(),
        action: 'pause',
        timestamp: now.toISOString(),
        secondsAtMoment: currentSeconds,
        event: 'paused',
        at: now.toISOString(),
        secondsAtEvent: currentSeconds,
      })

      const updatedDoc = await doc.patch({
        timeStatus: 'paused',
        timeSpent: finalTimeSpentHours,
        updatedAt: now.toISOString(),
        journal: updatedJournal,
      })

      client.timer.pause()

      const updatedActive = updatedDoc.toMutableJSON()
      client.events?.emit?.('time-entry:sync', updatedActive)
      set({ active: updatedActive })
    },

    async playCurrentTimeEntry(db) {
      const { active } = get()
      if (!active) return

      const doc = await db.timeEntries.findOne(active.id).exec()
      if (!doc) return

      const now = new Date()
      const lastPauseEvent = active.journal
        ?.slice()
        .reverse()
        .find((j: JournalEntry) => j.event === 'paused' || j.action === 'pause')
      const secondsAtLastPause =
        lastPauseEvent?.secondsAtMoment ?? lastPauseEvent?.secondsAtEvent ?? 0

      const newStartDate = subSeconds(now, secondsAtLastPause).toISOString()
      const updatedJournal = [...(active.journal || [])]

      updatedJournal.push({
        id: crypto.randomUUID(),
        action: 'resume',
        timestamp: now.toISOString(),
        secondsAtMoment: secondsAtLastPause,
        event: 'resumed',
        at: now.toISOString(),
        secondsAtEvent: secondsAtLastPause,
      })

      const updatedDoc = await doc.patch({
        timeStatus: 'running',
        startDate: newStartDate,
        updatedAt: now.toISOString(),
        journal: updatedJournal,
      })

      client.timer.resume({
        initialSeconds: active.timerConfig?.manualInitialSeconds ?? 0,
        elapsedSeconds: secondsAtLastPause,
      })

      const updatedActive = updatedDoc.toMutableJSON()
      client.events?.emit?.('time-entry:sync', updatedActive)
      set({ active: updatedActive })
    },

    async stopCurrentTimeEntry(db) {
      const { active } = get()
      if (!active || !active.startDate) return

      const doc = await db.timeEntries.findOne(active.id).exec()
      if (!doc) return

      const now = new Date()
      let currentSeconds = differenceInSeconds(now, parseISO(active.startDate))

      const updatedJournal = [...(active.journal || [])]

      if (active.timeStatus === 'paused') {
        const lastPause = updatedJournal
          .slice()
          .reverse()
          .find(
            (j: JournalEntry) => j.event === 'paused' || j.action === 'pause',
          )
        if (lastPause) {
          currentSeconds =
            lastPause.secondsAtMoment ??
            lastPause.secondsAtEvent ??
            currentSeconds
        }
      } else {
        updatedJournal.push({
          id: crypto.randomUUID(),
          action: 'stop',
          timestamp: now.toISOString(),
          secondsAtMoment: currentSeconds,
          event: 'stopped',
          at: now.toISOString(),
          secondsAtEvent: currentSeconds,
        })
      }

      const base =
        active.timerConfig?.mode === 'countup'
          ? (active.timerConfig?.manualInitialSeconds ?? 0)
          : 0
      const totalSeconds = currentSeconds + base
      const finalTimeSpentHours = Number((totalSeconds / 3600).toFixed(4))

      await doc.patch({
        timeStatus: 'finished',
        timeSpent: finalTimeSpentHours,
        endDate: now.toISOString(),
        updatedAt: now.toISOString(),
        journal: updatedJournal,
      })

      client.timer.stop()

      client.events?.emit?.('time-entry:sync', {
        ...active,
        timeStatus: 'finished',
        endDate: now.toISOString(),
      })
      set({ active: null })
    },

    async recoverRunningEntry(db) {
      const runningDoc = await db.timeEntries
        .findOne({
          selector: { timeStatus: 'running' },
        })
        .exec()

      if (!runningDoc) return

      const activeEntry = runningDoc.toMutableJSON()
      const start = parseISO(activeEntry.startDate!)
      const currentElapsed = differenceInSeconds(new Date(), start)

      const mode = activeEntry.timerConfig?.mode ?? 'countup'

      client.timer.start({
        initialSeconds: activeEntry.timerConfig?.manualInitialSeconds ?? 0,
        elapsedSeconds: currentElapsed,
        mode,
      })

      set({ active: activeEntry })
    },
  }))
}

// ---------------------------------------------------------
// Contexto Absurdamente Simplificado
// ---------------------------------------------------------

export const TimeEntryContext = createContext<
  StoreApi<TimeEntryStore> | undefined
>(undefined)

export function TimeEntryProvider({ children }: { children: ReactNode }) {
  const client: IOpenAPI = useOpenAPI()
  const db = useSyncStore((s) => s.db)
  const storeRef = useRef<StoreApi<TimeEntryStore> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createTimeEntryStore(client)
  }

  // Recover active entry once on database ready
  useEffect(() => {
    if (db && storeRef.current) {
      storeRef.current.getState().recoverRunningEntry(db)
    }
  }, [db])

  // Sincronização e listeners de IPC (Main Timer Events)
  useEffect(() => {
    if (!client?.events?.on) return

    const unsubs = [
      'play',
      'pause',
      'resume',
      'stop',
      'reset',
      'mode-changed',
    ].map((event) =>
      client.events.on(`timer:${event}`, (payload: any) => {
        console.log(`[TimeTracker] Evento recebido: timer:${event}`, payload)
      }),
    )

    unsubs.push(
      client.events.on(
        'time-entry:sync',
        (entry: Partial<SyncTimeEntryRxDBDTO>) => {
          if (!entry) return
          const current = storeRef.current?.getState().active

          if (entry.timeStatus === 'finished') {
            const isCurrent = current && current.id === entry.id
            if (isCurrent) {
              storeRef.current?.getState().clear()
            }
            return
          }

          const isCurrentActive = current && current.id === entry.id

          if (isCurrentActive) {
            storeRef.current
              ?.getState()
              .setActive(entry as SyncTimeEntryRxDBDTO)
            return
          }

          if (entry.timeStatus === 'running' || entry.timeStatus === 'paused') {
            storeRef.current
              ?.getState()
              .setActive(entry as SyncTimeEntryRxDBDTO)
          }
        },
      ),
    )

    return () => {
      unsubs.forEach((unsub) => unsub?.())
    }
  }, [client])

  // Process and persist Addon Suggestions directly into RxDB timeEntries collection
  useEffect(() => {
    if (!client?.events?.on || !db) return

    const unsub = client.events.on(
      'addons:suggestion-created',
      async (item: any) => {
        console.log('🤖 [TimeEntryStore] Sugestão recebida para RxDB:', item)
        if (!item) return

        const timeSpentHours = Number(
          ((item.timeSpentSeconds || 0) / 3600).toFixed(4),
        )
        const nowIso = new Date().toISOString()
        const sourceId = `local-${item.id}`
        const docId = `addon::${sourceId}`

        const suggestionDoc: SyncTimeEntryRxDBDTO = {
          id: docId,
          sourceId,
          _deleted: false,
          syncStatus: 'local_only',
          lastPulledAt: null,
          lastPushedAt: null,
          lastReconciledAt: null,
          dataSourceId: 'addon',
          connectionInstanceId: 'addon',
          task: { id: item.taskId ? item.taskId : '' },
          activity: { id: 'default', name: 'Sugestão' },
          user: { id: 'local-user', name: 'Watcher Simulado' },
          startDate: item.startDate
            ? item.startDate
            : item.createdAt
              ? item.createdAt
              : nowIso,
          endDate: item.endDate ? item.endDate : nowIso,
          timeSpent: timeSpentHours,
          timeStatus: 'suggestion',
          source: item.source ? item.source : 'ai_suggestion',
          addonSource: item.addonSource,
          type: 'manual',
          comments: item.comments ? item.comments : '',
          createdAt: item.createdAt ? item.createdAt : nowIso,
          updatedAt: nowIso,
          journal: [],
        }

        try {
          await db.timeEntries.upsert(suggestionDoc)
          console.log(
            '✅ [TimeEntryStore] Sugestão salva com sucesso no RxDB:',
            suggestionDoc,
          )
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          console.error(
            '❌ [TimeEntryStore] Erro ao salvar sugestão no RxDB:',
            errorMessage,
          )
        }
      },
    )

    return () => {
      unsub?.()
    }
  }, [client, db])

  return (
    <TimeEntryContext.Provider value={storeRef.current}>
      {children}
    </TimeEntryContext.Provider>
  )
}

// ---------------------------------------------------------
// Hook para consumo seguro e performático
// ---------------------------------------------------------
export function useTimeEntryStore<T>(
  selector: (state: TimeEntryStore) => T,
): T {
  const store = useContext(TimeEntryContext)
  if (!store) {
    throw new Error('useTimeEntryStore must be used inside TimeEntryProvider')
  }
  return useStore(store, selector)
}
