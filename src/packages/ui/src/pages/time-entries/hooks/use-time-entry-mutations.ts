import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useOpenAPI } from '@/hooks'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'
import { AppDatabase } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

const cleanTaskId = (id?: string): string => {
  if (!id) return ''
  const trimmed = id.trim()
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
  return trimmed
}

export function useTimeEntryMutations(
  db: AppDatabase | null | undefined,
  memberIdsByConnection: Record<string, string>,
) {
  const queryClient = useQueryClient()
  const openAPI = useOpenAPI()
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

  const getRowData = useCallback((id: string) => {
    return tempDataRef.current[id]
  }, [])

  const handleStartDuplicate = useCallback((sourceRow: SuggestionRow) => {
    const draftId = `temp-draft-${Date.now()}`
    const draftRow: SuggestionRow = {
      ...sourceRow,
      id: draftId,
      sourceId: draftId,
      isDraft: true,
      timeStatus: 'finished',
      subRows: [],
    }

    setDraftEntries((prev) => [...prev, draftRow])
    setEditingRows((prev) => ({ ...prev, [draftId]: true }))
    setTempData((prev) => ({
      ...prev,
      [draftId]: {
        task: sourceRow.task,
        taskData: sourceRow.taskData,
        activity: sourceRow.activity,
        startDate: sourceRow.startDate,
        endDate: sourceRow.endDate,
        timeSpent: sourceRow.timeSpent,
        comments: sourceRow.comments,
      },
    }))
  }, [])

  const handleAddNewEntry = useCallback(
    (day: Date, parentTask?: { id: string }) => {
      const draftId = `temp-draft-${Date.now()}`
      const startOfDayIso = day.toISOString()

      const defaultConnId = Object.keys(memberIdsByConnection)[0] || ''
      const defaultUserId = memberIdsByConnection[defaultConnId] || 'local-user'

      const draftRow: SuggestionRow = {
        id: draftId,
        sourceId: draftId,
        _deleted: false,
        connectionInstanceId: defaultConnId,
        dataSourceId: '',
        syncStatus: 'local_only',
        lastPulledAt: null,
        lastPushedAt: null,
        lastReconciledAt: null,
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

        const { id, createdAt, ...revertableFields } = snapshot
        const reverted = await doc.patch({
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

        const changes =
          tempDataRef.current[rowUid] || tempDataRef.current[draft.id] || {}

        const sourceId = crypto.randomUUID()
        const now = new Date().toISOString()
        const resolvedTaskData = (changes.taskData || draft.taskData) as
          SyncTaskRxDBDTO | undefined
        const connId =
          changes.connectionInstanceId ||
          resolvedTaskData?.connectionInstanceId ||
          draft.connectionInstanceId ||
          Object.keys(memberIdsByConnection)[0] ||
          ''
        const dsId =
          changes.dataSourceId ||
          resolvedTaskData?.dataSourceId ||
          draft.dataSourceId ||
          'default'
        const memberId =
          memberIdsByConnection[connId] || draft.user?.id || 'local-user'

        const rawTaskId = changes.task?.id || draft.task?.id || ''
        const sanitizedTaskId = cleanTaskId(rawTaskId)

        const newEntry: SyncTimeEntryRxDBDTO = {
          id: `${connId}::${sourceId}`,
          sourceId,
          dataSourceId: dsId,
          connectionInstanceId: connId,
          syncStatus: 'local_only',
          lastPulledAt: null,
          lastPushedAt: null,
          lastReconciledAt: null,
          task: { id: sanitizedTaskId },
          taskData: resolvedTaskData,
          activity: { id: changes.activity?.id || draft.activity?.id || '' },
          user: { id: memberId },
          startDate: changes.startDate || draft.startDate || now,
          endDate: changes.endDate || draft.endDate || now,
          timeSpent: changes.timeSpent ?? draft.timeSpent ?? 0,
          comments: changes.comments ?? draft.comments ?? '',
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
      const rawChanges =
        tempDataRef.current[rowUid] || tempDataRef.current[docJson.id] || {}

      const changes = { ...rawChanges }
      if (changes.task?.id !== undefined) {
        changes.task = {
          ...changes.task,
          id: cleanTaskId(changes.task.id),
        }
      }

      const isSuggestion =
        docJson.timeStatus === 'suggestion' ||
        Boolean((docJson as unknown as Record<string, unknown>).isSuggestion)
      const nextTimeStatus = isSuggestion
        ? 'finished'
        : changes.timeStatus || docJson.timeStatus

      const updated = await doc.patch({
        ...changes,
        timeStatus: nextTimeStatus,
        updatedAt: new Date().toISOString(),
      })
      const updatedJson = updated.toMutableJSON()
      toast.success(
        isSuggestion ? 'Sugestão confirmada e salva!' : 'Alterações salvas',
      )

      // Sincroniza a store local e via IPC para todas as janelas
      const isCurrentActive =
        activeTimeEntry &&
        (activeTimeEntry.id === updatedJson.id || activeTimeEntry.id === rowUid)

      if (isCurrentActive) {
        if (updatedJson.timeStatus === 'finished') {
          clearActive()
        } else {
          setActive(updatedJson)
        }
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

      await queryClient.invalidateQueries({
        queryKey: ['time-entries-range'],
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
    ],
  )

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!db) return
      const doc = await db.timeEntries.findOne(id).exec()
      if (!doc) return

      const docJson = doc.toMutableJSON()
      await doc.remove()

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
        let doc = await db.timeEntries.findOne(row.id).exec()
        if (!doc && row.connectionInstanceId && row.sourceId) {
          doc = await db.timeEntries
            .findOne({
              selector: {
                connectionInstanceId: row.connectionInstanceId,
                sourceId: row.sourceId,
              },
            })
            .exec()
        }
        if (!doc) {
          toast.error('Sugestão não encontrada')
          return
        }

        const edited = tempDataRef.current[row.id] || {}

        const updated = await doc.patch({
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
          await doc.remove()
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

          const updatedDoc = await doc.patch({
            ...updates,
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

          await queryClient.invalidateQueries({
            queryKey: ['time-entries-range'],
          })

          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } catch (err) {
        console.error('Erro ao atualizar apontamento diretamente:', err)
      }
    },
    [db, queryClient, openAPI, activeTimeEntry, setActive],
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
    handleStartDuplicate,
    handleAddNewEntry,
    handleCancelEdit,
    handleAcceptSuggestion,
    handleDismissSuggestion,
  }
}
