import { useQueryClient } from '@tanstack/react-query'
import { addSeconds, parseISO } from 'date-fns'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useOpenAPI } from '@/hooks'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import {
  RecordSyncStatus,
  SyncTimeEntryRxDBDTO,
} from '@/local-db/schemas/time-entries-sync-schema'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'
import { AppDatabase, useSyncStore } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

const cleanTaskId = (id?: string): string => {
  if (!id) return ''
  let trimmed = id.trim()
  if (
    trimmed === '# ticket' ||
    trimmed === '# Ticket' ||
    trimmed === 'sem-issue' ||
    trimmed === 'Tarefa' ||
    trimmed === 'Escolher tarefa' ||
    trimmed === 'Escolher...'
  ) {
    return ''
  }
  if (trimmed.startsWith('#')) {
    trimmed = trimmed.replace(/^#/, '')
  }
  if (trimmed.includes('::')) {
    const parts = trimmed.split('::')
    if (parts[1]) {
      trimmed = parts[1]
    }
  }
  return trimmed
}

export function useTimeEntryMutations(
  db: AppDatabase | null | undefined,
  memberIdsByConnection: Record<string, string>,
) {
  const queryClient = useQueryClient()
  const openAPI = useOpenAPI()
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

  // Stores original document snapshots before direct edits, enabling revert on cancel
  const originalSnapshotsRef = useRef<Record<string, SyncTimeEntryRxDBDTO>>({})

  useEffect(() => {
    if (!openAPI?.events?.on) return

    const unsub = openAPI.events.on<SyncTimeEntryRxDBDTO>(
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

        delete originalSnapshotsRef.current[targetId]
        Object.keys(originalSnapshotsRef.current).forEach((k) => {
          if (k.endsWith(targetId)) {
            delete originalSnapshotsRef.current[k]
          }
        })
      },
    )

    return () => unsub?.()
  }, [openAPI])

  const getRowData = useCallback((id: string) => {
    return tempDataRef.current[id]
  }, [])

  const handleDuplicateEntry = useCallback(
    (sourceRow: SuggestionRow) => {
      const draftId = `temp-draft-${crypto.randomUUID()}`

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
      const draftId = `temp-draft-${Date.now()}`
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

  const handleCancelEdit = useCallback(
    async (rowId: string) => {
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

      // 4. Revert persisted changes using original snapshot
      const snapshot = originalSnapshotsRef.current[rowId]
      if (!snapshot || !db) return

      try {
        const doc = await db.timeEntries.findOne(rowId).exec()
        if (!doc) return

        const revertableFields: Partial<SyncTimeEntryRxDBDTO> = { ...snapshot }
        delete revertableFields.id
        delete revertableFields.createdAt
        const reverted = await doc.incrementalPatch({
          ...revertableFields,
          updatedAt: new Date().toISOString(),
        })
        const revertedJson = reverted.toMutableJSON()

        // Sync store and IPC
        const isCurrentActive =
          activeTimeEntry &&
          (activeTimeEntry.id === revertedJson.id ||
            activeTimeEntry.id === rowId)

        if (isCurrentActive) {
          setActive(revertedJson)
        }

        openAPI.events?.emit?.('time-entry:sync', revertedJson)

        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
      } catch (err) {
        console.error('Erro ao reverter edição:', err)
      } finally {
        // Clean up snapshot
        delete originalSnapshotsRef.current[rowId]
        Object.keys(originalSnapshotsRef.current).forEach((k) => {
          if (k.endsWith(rowId) || rowId.endsWith(k)) {
            delete originalSnapshotsRef.current[k]
          }
        })
      }
    },
    [db, queryClient, openAPI, activeTimeEntry, setActive],
  )

  const handleSaveRow = useCallback(
    async (rowUid: string) => {
      if (!db) return

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

        const id = crypto.randomUUID()
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
        } else if (draft.startDate) {
          resolvedStartDate = draft.startDate
        }

        let resolvedTimeSpent = 0
        if (changes.timeSpent !== undefined) {
          resolvedTimeSpent = changes.timeSpent
        } else if (draft.timeSpent !== undefined) {
          resolvedTimeSpent = draft.timeSpent
        }

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

        let resolvedComments = ''
        if (changes.comments !== undefined) {
          resolvedComments = changes.comments
        } else if (draft.comments !== undefined) {
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
        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
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
        changes.timeSpent !== undefined ? changes.timeSpent : docJson.timeSpent
      if (finalTimeSpent <= 0) {
        toast.error('A duração do apontamento deve ser maior que 0')
        return
      }

      const isSuggestion = docJson.timeStatus === 'suggestion'
      let nextTimeStatus = docJson.timeStatus
      if (isSuggestion) nextTimeStatus = 'finished'
      if (!isSuggestion && changes.timeStatus)
        nextTimeStatus = changes.timeStatus

      let finalTaskId = ''
      if (changes.task?.id !== undefined) finalTaskId = changes.task.id
      if (changes.task?.id === undefined && docJson.task?.id)
        finalTaskId = docJson.task.id

      let finalActivityId = ''
      if (changes.activity?.id !== undefined)
        finalActivityId = changes.activity.id
      if (changes.activity?.id === undefined && docJson.activity?.id)
        finalActivityId = docJson.activity.id

      const targetConnId = changes.connectionInstanceId
        ? changes.connectionInstanceId
        : docJson.connectionInstanceId

      const isRemoteCandidate = Boolean(
        finalTaskId &&
        targetConnId &&
        targetConnId !== '0' &&
        finalActivityId &&
        finalActivityId.trim() !== '',
      )
      let nextSyncStatus: RecordSyncStatus = isRemoteCandidate
        ? 'pending_push'
        : 'local_only'
      if (docJson.syncStatus === 'conflict') {
        nextSyncStatus = 'conflict'
      }

      if (
        changes.connectionInstanceId &&
        changes.connectionInstanceId !== docJson.connectionInstanceId
      ) {
        changes.remoteId = null
      }

      const updated = await doc.incrementalPatch({
        ...changes,
        timeStatus: nextTimeStatus,
        syncStatus: nextSyncStatus,
        syncError: null,
        updatedAt: new Date().toISOString(),
      })
      const updatedJson = updated.toMutableJSON()
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
        (activeTimeEntry.id === updatedJson.id || activeTimeEntry.id === rowUid)

      if (isCurrentActive) {
        if (updatedJson.timeStatus === 'finished') clearActive()
        if (updatedJson.timeStatus !== 'finished') setActive(updatedJson)
      }

      openAPI.events?.emit?.('time-entry:sync', updatedJson)

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

      // Clean up snapshot on successful save
      delete originalSnapshotsRef.current[rowUid]
      delete originalSnapshotsRef.current[docJson.id]

      queryClient.setQueriesData<SyncTimeEntryRxDBDTO[]>(
        { queryKey: ['time-entries-range'] },
        (previous) => {
          if (!previous) return previous
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

      await queryClient.invalidateQueries({
        queryKey: ['time-entries-range'],
        refetchType: 'all',
      })
    },
    [
      db,
      memberIdsByConnection,
      queryClient,
      openAPI,
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
        openAPI.events?.emit?.('time-entry:sync', null)
      }

      toast.success('Registro removido')
      await queryClient.invalidateQueries({
        queryKey: ['time-entries-range'],
      })
    },
    [db, queryClient, openAPI, activeTimeEntry, clearActive],
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
        toast.success('Sugestão confirmada e adicionada aos apontamentos!')

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
        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
        openAPI.events?.emit?.('time-entry:sync', updatedJson)
      } catch (err) {
        console.error('Erro ao aceitar sugestao:', err)
        toast.error('Erro ao aceitar sugestão')
      }
    },
    [db, queryClient, openAPI],
  )

  const handleDismissSuggestion = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(id).exec()
        if (doc) {
          await doc.getLatest().remove()
          toast.info('Sugestão descartada')
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
          await queryClient.invalidateQueries({
            queryKey: ['time-entries-range'],
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
          // Capture original snapshot before the first edit
          if (!originalSnapshotsRef.current[rowId]) {
            originalSnapshotsRef.current[rowId] = doc.toMutableJSON()
          }

          let targetTaskId = ''
          if (updates.task?.id !== undefined) {
            targetTaskId = updates.task.id
          } else if (doc.task?.id) {
            targetTaskId = doc.task.id
          }

          const targetConnectionId = updates.connectionInstanceId
            ? updates.connectionInstanceId
            : doc.connectionInstanceId

          const isCandidate = Boolean(
            targetTaskId && targetConnectionId && targetConnectionId !== '0',
          )
          let nextSyncStatus: RecordSyncStatus = isCandidate
            ? 'pending_push'
            : 'local_only'
          if (doc.syncStatus === 'conflict') {
            nextSyncStatus = 'conflict'
          }

          if (
            updates.connectionInstanceId &&
            updates.connectionInstanceId !== doc.connectionInstanceId
          ) {
            updates.remoteId = null
          }

          const updatedDoc = await doc.incrementalPatch({
            ...updates,
            syncStatus: nextSyncStatus,
            syncError: null,
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updatedDoc.toMutableJSON()

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

          await queryClient.invalidateQueries({
            queryKey: ['time-entries-range'],
            refetchType: 'all',
          })

          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } catch (err) {
        console.error('Erro ao atualizar apontamento diretamente:', err)
        toast.error('Erro ao atualizar apontamento')
      }
    },
    [db, queryClient, openAPI, activeTimeEntry, setActive],
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
      try {
        const doc = await db.timeEntries.findOne(rowId).exec()
        if (!doc) {
          toast.error('Apontamento não encontrado para resolução de conflito')
          return
        }

        const docData = doc.toMutableJSON()
        const conflictData = docData.conflictData

        if (resolution === 'local') {
          const serverData = conflictData?.server
          const updatedDoc = await doc.incrementalModify((d) => {
            d.syncStatus = 'pending_push'
            d.conflictData = undefined
            d.updatedAt = new Date().toISOString()
            if (serverData?.updatedAt) {
              d.lastPulledAt = serverData.updatedAt
            }
            return d
          })
          const updatedJson = updatedDoc.toMutableJSON()
          toast.success('Versão local selecionada. Sincronizando...')
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
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
          if (forceSync) {
            await forceSync(docData.connectionInstanceId, 'push')
          }
          await queryClient.refetchQueries({
            queryKey: ['time-entries-range'],
            type: 'active',
          })
          return
        }

        const serverData = conflictData?.server
        if (serverData) {
          const updatedDoc = await doc.incrementalModify((d) => {
            d.syncStatus = 'synced'
            d.conflictData = undefined
            d.lastPulledAt = new Date().toISOString()

            if (serverData.startDate !== undefined) {
              d.startDate = serverData.startDate
            }
            if (serverData.endDate !== undefined) {
              d.endDate = serverData.endDate
            }
            if (serverData.timeSpent !== undefined) {
              d.timeSpent = serverData.timeSpent
            }
            if (serverData.comments !== undefined) {
              d.comments = serverData.comments
            }
            if (serverData.updatedAt !== undefined) {
              d.updatedAt = serverData.updatedAt
            }
            if (serverData.task?.id) {
              d.task = { id: serverData.task.id }
            }
            if (serverData.activity?.id) {
              d.activity = {
                id: serverData.activity.id,
                name: serverData.activity.name,
              }
            }
            return d
          })
          const updatedJson = updatedDoc.toMutableJSON()
          toast.success('Versão remota aplicada com sucesso!')
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
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
          await queryClient.refetchQueries({
            queryKey: ['time-entries-range'],
            type: 'active',
          })
          return
        }

        await doc.incrementalModify((d) => {
          d.syncStatus = 'synced'
          d.conflictData = undefined
          return d
        })
        toast.success('Versão remota solicitada. Puxando dados...')
        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
        if (forceSync) {
          await forceSync(docData.connectionInstanceId, 'pull')
        }
      } catch (err) {
        console.error('Erro ao resolver conflito:', err)
        toast.error('Erro ao resolver conflito de sincronização')
      }
    },
    [db, queryClient, openAPI, forceSync],
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
    conflictRowBeingResolved,
    setConflictRowBeingResolved,
    handleOpenConflictResolution,
    handleCloseConflictResolution,
    handleResolveConflictAndClose,
  }
}
