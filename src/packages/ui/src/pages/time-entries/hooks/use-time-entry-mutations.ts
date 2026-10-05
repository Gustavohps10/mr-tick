import { useQueryClient } from '@tanstack/react-query'
import { addSeconds, parseISO } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useHostBridge } from '@/hooks'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { resolveTimeEntryConflict } from '@/pages/time-entries/lib/resolve-time-entry-conflict'
import {
  cleanTaskId,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'
import {
  applyTimeEntryEdit,
  authorizeTimeEntryRecreation,
} from '@/pages/time-entries/lib/time-entry-identity'
import { useConflictModalStore } from '@/stores/conflictModalStore'
import { AppDatabase, useSyncStore } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

export function useTimeEntryMutations(
  db: AppDatabase | null | undefined,
  memberIdsByConnection: Record<string, string>,
) {
  const queryClient = useQueryClient()
  const bridge = useHostBridge()
  const forceSync = useSyncStore((s) => s.forceSync)
  const activeTimeEntry = useTimeEntryStore((s) => s.active)
  const setActive = useTimeEntryStore((s) => s.setActive)
  const clearActive = useTimeEntryStore((s) => s.clear)

  const [draftEntries, setDraftEntries] = useState<SuggestionRow[]>([])
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({})
  const [tempData, setTempData] = useState<
    Record<string, Partial<SyncTimeEntryRxDBDTO>>
  >({})
  const [rowBeingEdited, setRowBeingEdited] = useState<string | null>(null)
  const [taskLookupOpen, setTaskLookupOpen] = useState(false)

  const tempDataRef = useRef(tempData)
  tempDataRef.current = tempData

  const draftEntriesRef = useRef(draftEntries)
  draftEntriesRef.current = draftEntries

  const savingRowsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!bridge?.events?.on) return

    const unsub = bridge.events.on<SyncTimeEntryRxDBDTO>(
      'time-entry:conflict-resolved',
      (updatedEntry) => {
        if (!updatedEntry?.id) return
        const targetId = updatedEntry.id

        setTempData((prev) => {
          const next = { ...prev }
          delete next[targetId]
          Object.keys(next).forEach((k) => {
            if (k.endsWith(targetId)) {
              delete next[k]
            }
          })
          return next
        })

        setEditingRows((prev) => {
          const next = { ...prev }
          delete next[targetId]
          Object.keys(next).forEach((k) => {
            if (k.endsWith(targetId)) {
              delete next[k]
            }
          })
          return next
        })
      },
    )

    return () => unsub?.()
  }, [bridge])

  const getRowData = useCallback((id: string) => {
    return tempDataRef.current[id]
  }, [])

  const handleDuplicateEntry = useCallback(
    (sourceRow: SuggestionRow) => {
      const draftId = crypto.randomUUID()

      const rawTaskId = sourceRow.taskData?.sourceId
        ? sourceRow.taskData.sourceId
        : sourceRow.task?.id
          ? sourceRow.task.id
          : ''
      const sanitizedTaskId = cleanTaskId(rawTaskId)

      const activityId = sourceRow.activity?.id ? sourceRow.activity.id : ''
      const activityName = sourceRow.activity?.name

      const connId = sourceRow.connectionInstanceId
        ? sourceRow.connectionInstanceId
        : ''
      const dsId = sourceRow.dataSourceId ? sourceRow.dataSourceId : 'default'

      let memberId = 'local-user'
      if (connId && memberIdsByConnection[connId]) {
        memberId = memberIdsByConnection[connId]
      } else if (sourceRow.user?.id) {
        memberId = sourceRow.user.id
      }

      const timeSpent =
        sourceRow.timeSpent !== undefined ? sourceRow.timeSpent : 0
      const now = new Date().toISOString()
      const startDate = sourceRow.startDate ? sourceRow.startDate : now
      let endDate = sourceRow.endDate
      if (!endDate || endDate === startDate) {
        const startDateObj = parseISO(startDate)
        endDate = addSeconds(
          startDateObj,
          Math.round(timeSpent * 3600),
        ).toISOString()
      }

      const draftRow: SuggestionRow = {
        id: draftId,
        remoteId: null,
        connectionInstanceId: connId,
        dataSourceId: dsId,
        syncStatus: 'local_only',
        lastPulledAt: null,
        lastPushedAt: null,
        task: { id: sanitizedTaskId },
        taskData: sourceRow.taskData,
        activity: { id: activityId, name: activityName },
        user: { id: memberId, name: sourceRow.user?.name },
        startDate,
        endDate,
        timeSpent,
        comments: sourceRow.comments ? sourceRow.comments : '',
        timeStatus: 'finished',
        type: sourceRow.type ? sourceRow.type : 'manual',
        isDraft: true,
        createdAt: now,
        updatedAt: now,
        _deleted: false,
        subRows: [],
      }

      setDraftEntries((prev) => [...prev, draftRow])
      setEditingRows((prev) => ({ ...prev, [draftId]: true }))
      setTempData((prev) => ({
        ...prev,
        [draftId]: {
          connectionInstanceId: connId,
          dataSourceId: dsId,
          task: { id: sanitizedTaskId },
          taskData: sourceRow.taskData,
          activity: { id: activityId, name: activityName },
          startDate,
          endDate,
          timeSpent,
          comments: sourceRow.comments ? sourceRow.comments : '',
        },
      }))
    },
    [memberIdsByConnection],
  )

  const handleAddNewEntry = useCallback(
    (day: Date, parentTask?: { id: string }) => {
      const draftId = crypto.randomUUID()
      const startOfDayIso = day.toISOString()

      const availableConnKeys = Object.keys(memberIdsByConnection).filter(
        (k) => k !== '0' && k !== '',
      )
      const defaultConnId = availableConnKeys[0] ? availableConnKeys[0] : ''
      const defaultUserId =
        defaultConnId && memberIdsByConnection[defaultConnId]
          ? memberIdsByConnection[defaultConnId]
          : 'local-user'

      const draftRow: SuggestionRow = {
        id: draftId,
        _deleted: false,
        connectionInstanceId: defaultConnId,
        dataSourceId: '',
        syncStatus: 'local_only',
        lastPulledAt: null,
        lastPushedAt: null,
        task: parentTask ? { id: parentTask.id } : { id: '' },
        activity: { id: '' },
        user: { id: defaultUserId },
        startDate: startOfDayIso,
        endDate: startOfDayIso,
        timeSpent: 0,
        timeStatus: 'finished',
        comments: '',
        type: 'manual',
        isDraft: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        subRows: [],
      }

      setDraftEntries((prev) => [...prev, draftRow])
      setEditingRows((prev) => ({ ...prev, [draftId]: true }))
      setTempData((prev) => ({
        ...prev,
        [draftId]: {
          task: parentTask ? { id: parentTask.id } : { id: '' },
          activity: { id: '' },
          comments: '',
          timeSpent: 0,
          startDate: startOfDayIso,
          endDate: startOfDayIso,
        },
      }))
    },
    [memberIdsByConnection],
  )

  const handleCancelEdit = useCallback(async (rowId: string) => {
    // 1. Remove drafts
    setDraftEntries((prev) => prev.filter((d) => d.id !== rowId))

    // 2. Clear editing state
    setEditingRows((prev) => {
      const next = { ...prev }
      delete next[rowId]
      Object.keys(next).forEach((k) => {
        if (k === rowId || k.endsWith(rowId) || rowId.endsWith(k)) {
          delete next[k]
        }
      })
      return next
    })

    // 3. Clear temp data
    setTempData((prev) => {
      const next = { ...prev }
      delete next[rowId]
      Object.keys(next).forEach((k) => {
        if (k === rowId || k.endsWith(rowId) || rowId.endsWith(k)) {
          delete next[k]
        }
      })
      return next
    })
  }, [])

  const handleSaveRow = useCallback(
    async (rowUid: string) => {
      if (!db) return
      if (savingRowsRef.current.has(rowUid)) return

      savingRowsRef.current.add(rowUid)
      try {
        const isDraft = draftEntriesRef.current.some((d) => d.id === rowUid)

        if (isDraft) {
          const draft = draftEntriesRef.current.find((d) => d.id === rowUid)
          if (!draft) return

          let changes: Partial<SyncTimeEntryRxDBDTO> = {}
          if (tempDataRef.current[rowUid]) {
            changes = tempDataRef.current[rowUid]
          } else if (tempDataRef.current[draft.id]) {
            changes = tempDataRef.current[draft.id]
          }

          const id = draft.id
          const now = new Date().toISOString()

          let resolvedTaskData: SyncTaskRxDBDTO | undefined = undefined
          if (changes.taskData) {
            resolvedTaskData = changes.taskData
          } else if (draft.taskData) {
            resolvedTaskData = draft.taskData
          }

          let connId = ''
          if (changes.connectionInstanceId) {
            connId = changes.connectionInstanceId
          } else if (resolvedTaskData?.connectionInstanceId) {
            connId = resolvedTaskData.connectionInstanceId
          } else if (draft.connectionInstanceId) {
            connId = draft.connectionInstanceId
          } else {
            const availableConnKeys = Object.keys(memberIdsByConnection)
            if (availableConnKeys.length > 0) {
              connId = availableConnKeys[0]
            }
          }

          let dsId = 'default'
          if (changes.dataSourceId) {
            dsId = changes.dataSourceId
          } else if (resolvedTaskData?.dataSourceId) {
            dsId = resolvedTaskData.dataSourceId
          } else if (draft.dataSourceId) {
            dsId = draft.dataSourceId
          }

          let memberId = 'local-user'
          if (connId && memberIdsByConnection[connId]) {
            memberId = memberIdsByConnection[connId]
          } else if (draft.user?.id) {
            memberId = draft.user.id
          }

          let rawTaskId = ''
          if (changes.taskData?.sourceId) {
            rawTaskId = changes.taskData.sourceId
          } else if (changes.task?.id) {
            rawTaskId = changes.task.id
          } else if (draft.taskData?.sourceId) {
            rawTaskId = draft.taskData.sourceId
          } else if (draft.task?.id) {
            rawTaskId = draft.task.id
          }
          const sanitizedTaskId = cleanTaskId(rawTaskId)

          let activityId = ''
          let activityName: string | undefined = undefined
          if (changes.activity?.id) {
            activityId = changes.activity.id
            activityName = changes.activity.name
          } else if (draft.activity?.id) {
            activityId = draft.activity.id
            activityName = draft.activity.name
          }

          const isRemoteCandidate = Boolean(
            sanitizedTaskId &&
            connId &&
            connId !== '0' &&
            activityId &&
            activityId.trim() !== '',
          )

          let resolvedStartDate = now
          if (changes.startDate) {
            resolvedStartDate = changes.startDate
          }
          if (!changes.startDate && draft.startDate)
            resolvedStartDate = draft.startDate

          let resolvedTimeSpent = 0
          if (changes.timeSpent !== undefined) {
            resolvedTimeSpent = changes.timeSpent
          }
          if (changes.timeSpent === undefined && draft.timeSpent !== undefined)
            resolvedTimeSpent = draft.timeSpent

          let resolvedEndDate = changes.endDate
          if (!resolvedEndDate && draft.endDate) {
            resolvedEndDate = draft.endDate
          }

          if (resolvedTimeSpent <= 0) {
            toast.error('A duração do apontamento deve ser maior que 0')
            return
          }

          const startDateObj = parseISO(resolvedStartDate)
          if (!resolvedEndDate || resolvedEndDate === resolvedStartDate) {
            resolvedEndDate = addSeconds(
              startDateObj,
              Math.round(resolvedTimeSpent * 3600),
            ).toISOString()
          }

          let resolvedComments: string | null = null
          if (changes.comments !== undefined) {
            resolvedComments = changes.comments
          }
          if (changes.comments === undefined && draft.comments !== undefined) {
            resolvedComments = draft.comments
          }

          const newEntry: SyncTimeEntryRxDBDTO = {
            id,
            dataSourceId: dsId,
            connectionInstanceId: connId,
            syncStatus: isRemoteCandidate ? 'pending_push' : 'local_only',
            syncError: null,
            remoteId: null,
            lastPulledAt: null,
            lastPushedAt: null,
            task: { id: sanitizedTaskId },
            taskData: resolvedTaskData,
            activity: { id: activityId, name: activityName },
            user: { id: memberId, name: draft.user?.name },
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            timeSpent: resolvedTimeSpent,
            comments: resolvedComments,
            timeStatus: 'finished',
            type: 'manual',
            createdAt: now,
            updatedAt: now,
            _deleted: false,
          }

          await db.timeEntries.insert(newEntry)

          // Injeta a nova entidade persistida no cache da query ANTES de remover o rascunho
          queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
            { queryKey: ['time-entries-range'] },
            (previous) => {
              if (!previous) return [newEntry]
              const exists = previous.some((item) => item.id === newEntry.id)
              if (exists) {
                return previous.map((item) =>
                  item.id === newEntry.id ? newEntry : item,
                )
              }
              return [newEntry, ...previous]
            },
          )

          setDraftEntries((prev) => prev.filter((d) => d.id !== rowUid))
          setEditingRows((prev) => {
            const next = { ...prev }
            delete next[rowUid]
            delete next[draft.id]
            return next
          })
          setTempData((prev) => {
            const next = { ...prev }
            delete next[rowUid]
            delete next[draft.id]
            return next
          })

          if (
            forceSync &&
            newEntry.connectionInstanceId &&
            newEntry.syncStatus === 'pending_push'
          ) {
            forceSync(newEntry.connectionInstanceId, 'push').catch((err) => {
              console.error('Erro ao sincronizar novo apontamento:', err)
            })
          }

          bridge.events.emit('time-entry:sync', newEntry)
          toast.success('Registro salvo com sucesso!')
          return
        }

        // Persisted row update
        const doc = await db.timeEntries.findOne(rowUid).exec()

        if (!doc) {
          toast.error('Apontamento não encontrado para salvar')
          return
        }

        const docJson = doc.toMutableJSON()
        let rawChanges: Partial<SyncTimeEntryRxDBDTO> = {}
        if (tempDataRef.current[rowUid]) {
          rawChanges = tempDataRef.current[rowUid]
        } else if (tempDataRef.current[docJson.id]) {
          rawChanges = tempDataRef.current[docJson.id]
        }

        const changes = { ...rawChanges }
        if (changes.taskData?.sourceId) {
          changes.task = {
            ...changes.task,
            id: cleanTaskId(changes.taskData.sourceId),
          }
        } else if (changes.task?.id !== undefined) {
          changes.task = {
            ...changes.task,
            id: cleanTaskId(changes.task.id),
          }
        }

        const finalTimeSpent =
          changes.timeSpent !== undefined
            ? changes.timeSpent
            : docJson.timeSpent
        if (finalTimeSpent <= 0) {
          toast.error('A duração do apontamento deve ser maior que 0')
          return
        }

        const isSuggestion = docJson.timeStatus === 'suggestion'
        let nextTimeStatus = docJson.timeStatus
        if (isSuggestion) nextTimeStatus = 'finished'
        if (!isSuggestion && changes.timeStatus)
          nextTimeStatus = changes.timeStatus

        const isLinkedToRemote = Boolean(
          (docJson.remoteId &&
            docJson.remoteId.trim() !== '' &&
            !docJson.remoteId.startsWith('local-')) ||
          docJson.syncStatus === 'synced',
        )

        if (isLinkedToRemote) {
          if (
            changes.task?.id !== undefined &&
            !cleanTaskId(changes.task.id) &&
            Boolean(cleanTaskId(docJson.task.id))
          ) {
            toast.error('Registros remotos não podem ficar sem tarefa')
            return
          }
          if (
            changes.activity?.id !== undefined &&
            !changes.activity.id.trim()
          ) {
            toast.error('Registros remotos não podem ficar sem atividade')
            return
          }
        }

        const updated = await doc.incrementalModify((draft) =>
          applyTimeEntryEdit(
            draft,
            { ...changes, timeStatus: nextTimeStatus },
            new Date().toISOString(),
          ),
        )
        const updatedJson = updated.toMutableJSON()
        if (
          changes.connectionInstanceId &&
          changes.connectionInstanceId !== updatedJson.connectionInstanceId
        ) {
          toast.error('Confirme a operação remota antes de trocar a conexão')
          return
        }
        if (updatedJson._deleted) return
        toast.success(
          isSuggestion ? 'Sugestão confirmada e salva!' : 'Alterações salvas',
        )

        if (
          forceSync &&
          updatedJson.connectionInstanceId &&
          updatedJson.syncStatus === 'pending_push'
        ) {
          forceSync(updatedJson.connectionInstanceId, 'push').catch((err) => {
            console.error('Erro ao sincronizar apontamento atualizado:', err)
          })
        }

        // Sincroniza a store local e via IPC para todas as janelas
        const isCurrentActive =
          activeTimeEntry &&
          (activeTimeEntry.id === updatedJson.id ||
            activeTimeEntry.id === rowUid)

        if (isCurrentActive) {
          if (updatedJson.timeStatus === 'finished') clearActive()
          if (updatedJson.timeStatus !== 'finished') setActive(updatedJson)
        }

        bridge.events.emit('time-entry:sync', updatedJson)

        // Injeta a atualização no cache do TanStack Query ANTES de limpar tempData
        queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
          { queryKey: ['time-entries-range'] },
          (previous) => {
            if (!previous) return [updatedJson]
            return previous.map((item) => {
              if (
                item.id === updatedJson.id ||
                item.id === rowUid ||
                item.id === docJson.id
              ) {
                return updatedJson
              }
              return item
            })
          },
        )

        setEditingRows((prev) => {
          const next = { ...prev }
          delete next[rowUid]
          delete next[docJson.id]
          return next
        })
        setTempData((prev) => {
          const next = { ...prev }
          delete next[rowUid]
          delete next[docJson.id]
          return next
        })
      } finally {
        savingRowsRef.current.delete(rowUid)
      }
    },
    [
      db,
      memberIdsByConnection,
      queryClient,
      bridge,
      activeTimeEntry,
      setActive,
      clearActive,
      forceSync,
    ],
  )

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!db) return
      const doc = await db.timeEntries.findOne(id).exec()
      if (!doc) return

      const docJson = doc.toMutableJSON()

      try {
        // Use getLatest() to avoid CONFLICT when the pull has updated the document
        // between findOne() and remove() with a newer revision.
        await doc.getLatest().remove()
      } catch {
        toast.error('Erro ao remover registro. Tente novamente.')
        return
      }

      const isCurrentActive =
        activeTimeEntry &&
        (activeTimeEntry.id === docJson.id || activeTimeEntry.id === id)

      if (isCurrentActive) {
        clearActive()
        bridge.events.emit('time-entry:sync', null)
      }

      queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
        { queryKey: ['time-entries-range'] },
        (previous) => {
          if (!previous) return []
          return previous.filter(
            (item) => item.id !== docJson.id && item.id !== id,
          )
        },
      )

      toast.success('Registro removido')
    },
    [db, queryClient, bridge, activeTimeEntry, clearActive],
  )

  const handleAcceptSuggestion = useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(row.id).exec()
        if (!doc) {
          toast.error('Sugestão não encontrada')
          return
        }

        let edited: Partial<SyncTimeEntryRxDBDTO> = {}
        if (tempDataRef.current[row.id]) {
          edited = tempDataRef.current[row.id]
        }

        const updated = await doc.getLatest().patch({
          ...edited,
          timeStatus: 'finished',
          updatedAt: new Date().toISOString(),
        })
        const updatedJson = updated.toMutableJSON()
        queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
          { queryKey: ['time-entries-range'] },
          (previous) => {
            if (!previous) return [updatedJson]
            return previous.map((item) =>
              item.id === updatedJson.id || item.id === row.id
                ? updatedJson
                : item,
            )
          },
        )

        setEditingRows((prev) => {
          const next = { ...prev }
          delete next[row.id]
          return next
        })
        setTempData((prev) => {
          const next = { ...prev }
          delete next[row.id]
          return next
        })
        bridge.events.emit('time-entry:sync', updatedJson)
      } catch (err) {
        console.error('Erro ao aceitar sugestao:', err)
        toast.error('Erro ao aceitar sugestão')
      }
    },
    [db, queryClient, bridge],
  )

  const handleDismissSuggestion = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(id).exec()
        if (doc) {
          await doc.getLatest().remove()
          toast.info('Sugestão descartada')

          queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
            { queryKey: ['time-entries-range'] },
            (previous) => {
              if (!previous) return []
              return previous.filter((item) => item.id !== id)
            },
          )

          setEditingRows((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          setTempData((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        } else {
          console.warn('Sugestão não encontrada para remoção:', id)
        }
      } catch (err) {
        console.error('Erro ao descartar sugestao:', err)
        toast.error('Erro ao descartar sugestão')
      }
    },
    [db, queryClient],
  )

  const handleDirectUpdateRow = useCallback(
    async (rowId: string, rawUpdates: Partial<SyncTimeEntryRxDBDTO>) => {
      const updates = { ...rawUpdates }
      if (updates.task?.id !== undefined) {
        updates.task = {
          ...updates.task,
          id: cleanTaskId(updates.task.id),
        }
      }

      // 1. Update tempData so any active editing session reflects this change
      setTempData((prev) => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          ...updates,
        },
      }))

      // 2. If it's a draft, update draftEntries state
      const isDraft = draftEntriesRef.current.some((d) => d.id === rowId)
      if (isDraft) {
        setDraftEntries((prev) =>
          prev.map((d) => (d.id === rowId ? { ...d, ...updates } : d)),
        )
        return
      }

      // 3. If it's a persisted entry, patch RxDB
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(rowId).exec()
        if (doc) {
          const isLinkedToRemote = Boolean(
            (doc.remoteId &&
              doc.remoteId.trim() !== '' &&
              !doc.remoteId.startsWith('local-')) ||
            doc.syncStatus === 'synced',
          )

          if (isLinkedToRemote) {
            if (
              updates.task?.id !== undefined &&
              !cleanTaskId(updates.task.id) &&
              Boolean(cleanTaskId(doc.task.id))
            ) {
              toast.error('Registros remotos não podem ficar sem tarefa')
              return
            }
            if (
              updates.activity?.id !== undefined &&
              !updates.activity.id.trim()
            ) {
              toast.error('Registros remotos não podem ficar sem atividade')
              return
            }
          }

          const updatedDoc = await doc.incrementalModify((draft) =>
            applyTimeEntryEdit(draft, updates, new Date().toISOString()),
          )
          const updatedJson = updatedDoc.toMutableJSON()
          if (
            updates.connectionInstanceId &&
            updates.connectionInstanceId !== updatedJson.connectionInstanceId
          ) {
            toast.error('Confirme a operação remota antes de trocar a conexão')
            return
          }
          if (updatedJson._deleted) return

          const isCurrentActive =
            activeTimeEntry &&
            (activeTimeEntry.id === updatedJson.id ||
              activeTimeEntry.id === rowId)

          if (isCurrentActive) {
            setActive(updatedJson)
          }

          queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
            { queryKey: ['time-entries-range'] },
            (previous) => {
              if (!previous) return previous
              return previous.map((item) => {
                if (item.id === updatedJson.id || item.id === rowId) {
                  return updatedJson
                }
                return item
              })
            },
          )

          setTempData((prev) => {
            const next = { ...prev }
            delete next[rowId]
            return next
          })

          bridge.events.emit('time-entry:sync', updatedJson)
        }
      } catch (err) {
        console.error('Erro ao atualizar apontamento diretamente:', err)
        toast.error('Erro ao atualizar apontamento')
      }
    },
    [db, queryClient, bridge, activeTimeEntry, setActive],
  )

  const [conflictRowBeingResolved, setConflictRowBeingResolved] =
    useState<SuggestionRow | null>(null)

  const handleOpenConflictResolution = useCallback((row: SuggestionRow) => {
    setConflictRowBeingResolved(row)
    useConflictModalStore.getState().openConflictModal(row.id)
  }, [])

  const handleCloseConflictResolution = useCallback(() => {
    setConflictRowBeingResolved(null)
  }, [])

  const handleResolveConflict = useCallback(
    async (rowId: string, resolution: 'local' | 'remote') => {
      if (!db) return
      const doc = await db.timeEntries.findOne(rowId).exec()
      const server = doc?.conflictData?.server
      if (!doc || !server) {
        toast.error('Snapshot remoto indisponível para resolução de conflito')
        return
      }
      const updated = await doc.incrementalModify((draft) =>
        resolveTimeEntryConflict(draft, server, {
          periodAndDuration: resolution,
          comments: resolution,
          task: resolution,
          activity: resolution,
        }),
      )
      if (updated.syncStatus === 'conflict') {
        toast.error(
          'O conflito mudou. Revise os dados atuais antes de resolver.',
        )
        return
      }
      const value = updated.toMutableJSON()
      queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
        { queryKey: ['time-entries-range'] },
        (previous) =>
          previous?.map((item) => (item.id === value.id ? value : item)),
      )
      bridge.events.emit('time-entry:sync', value)
      toast.success('Conflito resolvido com sucesso!')
      if (value.syncStatus === 'pending_push' && forceSync)
        await forceSync(value.connectionInstanceId, 'push')
    },
    [db, queryClient, bridge, forceSync],
  )

  const handleConfirmRetryAmbiguousCreation = useCallback(
    async (rowId: string) => {
      if (!db) {
        toast.error('Banco local indisponível para tentar novamente')
        return
      }

      try {
        const doc = await db.timeEntries.findOne(rowId).exec()
        if (!doc) {
          toast.error('Apontamento não encontrado para nova tentativa')
          return
        }

        const currentData = doc.toMutableJSON()
        if (currentData.syncStatus !== 'ambiguous') {
          toast.error('O estado do apontamento mudou. Atualize a lista.')
          return
        }

        const updatedDoc = await doc.incrementalModify((draft) =>
          authorizeTimeEntryRecreation(draft, new Date().toISOString()),
        )
        const updatedData = updatedDoc.toMutableJSON()
        if (updatedData.syncStatus !== 'pending_push') {
          toast.error('O estado do apontamento mudou. Atualize a lista.')
          return
        }

        queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
          { queryKey: ['time-entries-range'] },
          (previous) => {
            if (!previous) return previous
            return previous.map((item) =>
              item.id === updatedData.id ? updatedData : item,
            )
          },
        )
        bridge.events.emit('time-entry:sync', updatedData)
        toast.warning(
          'Nova criação autorizada. Se o registro já existir no servidor, ele poderá ser duplicado.',
        )
        if (forceSync) await forceSync(updatedData.connectionInstanceId, 'push')
      } catch (error) {
        console.error('Erro ao tentar criar apontamento novamente:', error)
        toast.error('Não foi possível iniciar a nova tentativa de criação')
      }
    },
    [db, queryClient, bridge, forceSync],
  )

  const handleResolveConflictAndClose = useCallback(
    async (rowId: string, resolution: 'local' | 'remote') => {
      try {
        await handleResolveConflict(rowId, resolution)
        setConflictRowBeingResolved(null)
      } catch (err) {
        console.error('Falha na resolução de conflito:', err)
      }
    },
    [handleResolveConflict],
  )

  return {
    draftEntries,
    editingRows,
    setEditingRows,
    tempData,
    setTempData,
    getRowData,
    rowBeingEdited,
    setRowBeingEdited,
    taskLookupOpen,
    setTaskLookupOpen,
    handleSaveRow,
    handleDirectUpdateRow,
    handleDeleteEntry,
    handleDuplicateEntry,
    handleStartDuplicate: handleDuplicateEntry,
    handleAddNewEntry,
    handleCancelEdit,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleResolveConflict,
    handleConfirmRetryAmbiguousCreation,
    conflictRowBeingResolved,
    setConflictRowBeingResolved,
    handleOpenConflictResolution,
    handleCloseConflictResolution,
    handleResolveConflictAndClose,
  }
}
