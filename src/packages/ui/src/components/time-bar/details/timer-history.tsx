// components/time-bar/details/timer-history.tsx
'use client'

import {
  addSeconds,
  differenceInSeconds,
  format,
  isAfter,
  parseISO,
  setHours,
  setMinutes,
  subSeconds,
} from 'date-fns'
import {
  Check,
  Clock,
  Database,
  History,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import React, { memo, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useOpenAPI } from '@/hooks'
import { cn } from '@/lib/utils'
import { useSyncStore } from '@/stores/syncStore'
import { JournalEntry, useTimeEntryStore } from '@/stores/timeEntryStore'

type TimelineBlock =
  | { type: 'start'; entry: JournalEntry; index: number }
  | { type: 'adjustment'; entry: JournalEntry; index: number }
  | { type: 'stop'; entry: JournalEntry; index: number }
  | { type: 'pause-ongoing'; paused: JournalEntry; pauseIndex: number }
  | {
      type: 'pause-block'
      paused: JournalEntry
      resumed: JournalEntry
      pauseIndex: number
      resumeIndex: number
      durationSeconds: number
    }

function formatDuration(totalSeconds: number) {
  const absSeconds = Math.abs(totalSeconds)
  const h = Math.floor(absSeconds / 3600)
  const m = Math.floor((absSeconds % 3600) / 60)
  const s = absSeconds % 60

  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)

  return parts.join(' ')
}

function applyTimeToDate(dateString: string, timeString: string): string {
  const date = parseISO(dateString)
  const [hours, minutes] = timeString.split(':').map(Number)
  return setMinutes(setHours(date, hours), minutes).toISOString()
}

export interface TimerHistoryProps {
  entry?: any | null
  trigger?: React.ReactNode
}

export const TimerHistory = memo(
  ({ entry: propEntry, trigger }: TimerHistoryProps = {}) => {
    const openAPI = useOpenAPI()
    const db = useSyncStore((s) => s.db)
    const storeActiveEntry = useTimeEntryStore((s) => s.active)
    const setActive = useTimeEntryStore((s) => s.setActive)

    const activeEntry = propEntry !== undefined ? propEntry : storeActiveEntry
    const isStoreActive =
      activeEntry && storeActiveEntry && activeEntry.id === storeActiveEntry.id

    const [isOpen, setIsOpen] = useState(false)
    const [isAddingInline, setIsAddingInline] = useState(false)
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [inlineError, setInlineError] = useState<string | null>(null)
    const [addError, setAddError] = useState<string | null>(null)

    const [inlineStartTime, setInlineStartTime] = useState('')
    const [inlineEndTime, setInlineEndTime] = useState('')

    const [inlineAdjType, setInlineAdjType] = useState<'add' | 'subtract'>(
      'add',
    )
    const [inlineAdjMinutes, setInlineAdjMinutes] = useState('')
    const [inlineAdjNote, setInlineAdjNote] = useState('')

    const [addType, setAddType] = useState<'add' | 'subtract'>('add')
    const [addMinutes, setAddMinutes] = useState<string>('')
    const [addNote, setAddNote] = useState('')

    const timeline = useMemo(() => {
      if (!activeEntry || !activeEntry.journal) return []

      const blocks: TimelineBlock[] = []
      const journal = activeEntry.journal

      for (let i = 0; i < journal.length; i++) {
        const entry = journal[i]

        if (entry.event === 'started') {
          blocks.push({ type: 'start', entry, index: i })
        } else if (entry.event === 'adjusted') {
          blocks.push({ type: 'adjustment', entry, index: i })
        } else if (entry.event === 'stopped') {
          blocks.push({ type: 'stop', entry, index: i })
        } else if (entry.event === 'paused') {
          const next = journal[i + 1]
          if (next && next.event === 'resumed') {
            const duration = differenceInSeconds(
              parseISO(next.at),
              parseISO(entry.at),
            )
            blocks.push({
              type: 'pause-block',
              paused: entry,
              resumed: next,
              pauseIndex: i,
              resumeIndex: i + 1,
              durationSeconds: duration,
            })
            i++
          } else {
            blocks.push({
              type: 'pause-ongoing',
              paused: entry,
              pauseIndex: i,
            })
          }
        }
      }
      return blocks.reverse()
    }, [activeEntry])

    const isDeleteSafe = (block: TimelineBlock): boolean => {
      if (!activeEntry || !activeEntry.startDate) return false
      const currentStartDate = parseISO(activeEntry.startDate)
      const now = new Date()

      if (block.type === 'adjustment') {
        const newStartDate = addSeconds(
          currentStartDate,
          block.entry.secondsAtEvent,
        )
        return !isAfter(newStartDate, now)
      }

      if (block.type === 'pause-block') {
        const newStartDate = subSeconds(currentStartDate, block.durationSeconds)
        return !isAfter(newStartDate, now)
      }

      return true
    }

    const syncStoreAndElectron = async (
      newJournal: JournalEntry[],
      newStartDate: string,
      newStatus: 'running' | 'paused' | 'finished',
    ) => {
      if (!db || !activeEntry) return

      const doc = await db.timeEntries.findOne(activeEntry.id).exec()
      if (doc) {
        await doc.patch({
          journal: newJournal,
          startDate: newStartDate,
          timeStatus: newStatus,
          updatedAt: new Date().toISOString(),
        })
      }

      const updatedEntry = {
        ...activeEntry,
        journal: newJournal,
        startDate: newStartDate,
        timeStatus: newStatus,
      }

      if (isStoreActive) {
        setActive(updatedEntry)

        if (newStatus === 'running') {
          const elapsed = differenceInSeconds(
            new Date(),
            parseISO(newStartDate),
          )
          openAPI?.timer?.start({
            baseSeconds: activeEntry.timerConfig?.manualInitialSeconds ?? 0,
            elapsedSeconds: Math.max(0, elapsed),
            mode: activeEntry.timerConfig?.mode ?? 'countup',
          })
        }
      }

      openAPI?.events?.emit?.('time-entry:sync', updatedEntry)
    }

    const handleDelete = async (block: TimelineBlock) => {
      if (!activeEntry) return

      const newJournal = [...(activeEntry.journal || [])]
      const currentStartDate = parseISO(activeEntry.startDate!)
      let newStartDate = currentStartDate.toISOString()
      let newStatus: 'running' | 'paused' | 'finished' =
        (activeEntry.timeStatus as 'running' | 'paused' | 'finished') ||
        'paused'
      let delta = 0

      if (block.type === 'pause-block') {
        newJournal.splice(block.resumeIndex, 1)
        newJournal.splice(block.pauseIndex, 1)
        newStartDate = subSeconds(
          currentStartDate,
          block.durationSeconds,
        ).toISOString()
      } else if (block.type === 'pause-ongoing') {
        newJournal.splice(block.pauseIndex, 1)
        newStatus = 'running'
      } else if (block.type === 'adjustment') {
        newJournal.splice(block.index, 1)
        delta = -block.entry.secondsAtEvent
        newStartDate = subSeconds(currentStartDate, delta).toISOString()
      }

      if (isAfter(parseISO(newStartDate), new Date())) return

      if (activeEntry.timeStatus === 'paused' && block.type === 'adjustment') {
        const lastPauseIdx = newJournal
          .slice()
          .reverse()
          .findIndex((j: JournalEntry) => j.event === 'paused')
        if (lastPauseIdx !== -1) {
          const realIdx = newJournal.length - 1 - lastPauseIdx
          newJournal[realIdx] = {
            ...newJournal[realIdx],
            secondsAtEvent: Math.max(
              0,
              (newJournal[realIdx].secondsAtEvent || 0) + delta,
            ),
          }
        }
      }

      await syncStoreAndElectron(newJournal, newStartDate, newStatus)
    }

    const startInlineEditPause = (
      block: TimelineBlock & { type: 'pause-block' },
    ) => {
      setInlineError(null)
      setInlineStartTime(format(parseISO(block.paused.at), 'HH:mm'))
      setInlineEndTime(format(parseISO(block.resumed.at), 'HH:mm'))
      setEditingIndex(block.pauseIndex)
    }

    const handleInlineEditPauseSave = async (
      block: TimelineBlock & { type: 'pause-block' },
    ) => {
      if (!activeEntry) return

      const newJournal = [...(activeEntry.journal || [])]
      const currentStartDate = parseISO(activeEntry.startDate!)
      const newPausedAt = applyTimeToDate(block.paused.at, inlineStartTime)
      const newResumedAt = applyTimeToDate(block.resumed.at, inlineEndTime)
      const newDurationSeconds = differenceInSeconds(
        parseISO(newResumedAt),
        parseISO(newPausedAt),
      )

      if (newDurationSeconds < 0) {
        setInlineError('Fim não pode ser anterior ao início.')
        return
      }

      const durationDelta = newDurationSeconds - block.durationSeconds
      const newStartDate = addSeconds(
        currentStartDate,
        durationDelta,
      ).toISOString()

      if (isAfter(parseISO(newStartDate), new Date())) {
        setInlineError(
          `Erro: remoção de tempo excede o tempo atual registrado.`,
        )
        return
      }

      newJournal[block.pauseIndex] = {
        ...newJournal[block.pauseIndex],
        at: newPausedAt,
      }
      newJournal[block.resumeIndex] = {
        ...newJournal[block.resumeIndex],
        at: newResumedAt,
      }

      await syncStoreAndElectron(
        newJournal,
        newStartDate,
        (activeEntry.timeStatus as 'running' | 'paused' | 'finished') ||
          'paused',
      )
      setEditingIndex(null)
      setInlineError(null)
    }

    const startInlineEditAdj = (
      block: TimelineBlock & { type: 'adjustment' },
    ) => {
      setInlineError(null)
      setInlineAdjType(block.entry.secondsAtEvent > 0 ? 'add' : 'subtract')
      setInlineAdjMinutes(
        String(Math.floor(Math.abs(block.entry.secondsAtEvent) / 60)),
      )
      setInlineAdjNote(block.entry.note || '')
      setEditingIndex(block.index)
    }

    const handleInlineEditAdjSave = async (
      block: TimelineBlock & { type: 'adjustment' },
    ) => {
      if (!activeEntry) return

      const newJournal = [...(activeEntry.journal || [])]
      const currentStartDate = parseISO(activeEntry.startDate!)
      const oldSeconds = block.entry.secondsAtEvent
      const newMinutes = Number(inlineAdjMinutes)

      if (isNaN(newMinutes) || newMinutes <= 0) {
        setInlineError('Insira um tempo válido.')
        return
      }

      const newSeconds = (inlineAdjType === 'add' ? 1 : -1) * newMinutes * 60
      const delta = newSeconds - oldSeconds
      const newStartDate = subSeconds(currentStartDate, delta).toISOString()

      if (isAfter(parseISO(newStartDate), new Date())) {
        setInlineError(`Erro: ajuste excede o tempo atual registrado.`)
        return
      }

      newJournal[block.index] = {
        ...newJournal[block.index],
        secondsAtEvent: newSeconds,
        note: inlineAdjNote,
      }

      if (activeEntry.timeStatus === 'paused') {
        const lastPauseIdx = newJournal
          .slice()
          .reverse()
          .findIndex((j: JournalEntry) => j.event === 'paused')
        if (lastPauseIdx !== -1) {
          const realIdx = newJournal.length - 1 - lastPauseIdx
          newJournal[realIdx] = {
            ...newJournal[realIdx],
            secondsAtEvent: Math.max(
              0,
              (newJournal[realIdx].secondsAtEvent || 0) + delta,
            ),
          }
        }
      }

      await syncStoreAndElectron(
        newJournal,
        newStartDate,
        (activeEntry.timeStatus as 'running' | 'paused' | 'finished') ||
          'paused',
      )
      setEditingIndex(null)
      setInlineError(null)
    }

    const handleAddSave = async () => {
      if (!addMinutes || isNaN(Number(addMinutes)) || !activeEntry) return

      const minutes = Number(addMinutes)
      const secondsDelta = minutes * 60
      const newJournal = [...(activeEntry.journal || [])]
      const currentStartDate = parseISO(activeEntry.startDate!)
      let newStartDate = currentStartDate.toISOString()

      const isAdd = addType === 'add'
      const adjDelta = isAdd ? secondsDelta : -secondsDelta

      if (isAdd) {
        newStartDate = subSeconds(currentStartDate, secondsDelta).toISOString()
      } else {
        newStartDate = addSeconds(currentStartDate, secondsDelta).toISOString()
      }

      if (isAfter(parseISO(newStartDate), new Date())) {
        setAddError(`Erro: ajuste excede o tempo total registrado.`)
        return
      }

      if (activeEntry.timeStatus === 'paused') {
        const lastPauseIdx = newJournal
          .slice()
          .reverse()
          .findIndex((j: JournalEntry) => j.event === 'paused')
        if (lastPauseIdx !== -1) {
          const realIdx = newJournal.length - 1 - lastPauseIdx
          newJournal[realIdx] = {
            ...newJournal[realIdx],
            secondsAtEvent: Math.max(
              0,
              (newJournal[realIdx].secondsAtEvent || 0) + adjDelta,
            ),
          }
        }
      }

      newJournal.push({
        event: 'adjusted',
        at: new Date().toISOString(),
        secondsAtEvent: adjDelta,
        note: addNote || (isAdd ? 'Tempo adicionado' : 'Tempo removido'),
      })

      await syncStoreAndElectron(
        newJournal,
        newStartDate,
        (activeEntry.timeStatus as 'running' | 'paused' | 'finished') ||
          'paused',
      )

      setIsAddingInline(false)
      setAddMinutes('')
      setAddNote('')
      setAddError(null)
    }

    const renderTimelineBlock = (block: TimelineBlock) => {
      switch (block.type) {
        case 'start':
          return (
            <div className="flex items-center gap-2">
              <div className="bg-primary/20 flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                <Play className="text-primary h-2.5 w-2.5 fill-current" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-foreground text-[11px] font-medium">
                  Iniciado
                </span>
                <span className="text-muted-foreground text-[9px]">
                  {format(parseISO(block.entry.at), 'HH:mm:ss')}
                </span>
              </div>
            </div>
          )

        case 'stop':
          return (
            <div className="flex items-center gap-2">
              <div className="bg-destructive/20 flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                <div className="bg-destructive h-1.5 w-1.5 rounded-[1px]" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-foreground text-[11px] font-medium">
                  Parado
                </span>
                <span className="text-muted-foreground text-[9px]">
                  {format(parseISO(block.entry.at), 'HH:mm:ss')}
                </span>
              </div>
            </div>
          )

        case 'adjustment': {
          const isEditingAdj = editingIndex === block.index

          if (isEditingAdj) {
            return (
              <div className="bg-muted/40 border-border/50 relative z-10 flex flex-col gap-1.5 rounded-md border p-2 shadow-sm">
                <span className="text-foreground text-[11px] font-medium">
                  Editar Ajuste
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'h-6 w-6 shrink-0 transition-colors',
                      inlineAdjType === 'add'
                        ? 'border-green-500/20 bg-green-500/10 text-green-500'
                        : 'border-destructive/20 bg-destructive/10 text-destructive',
                    )}
                    onClick={() => {
                      setInlineAdjType((t) =>
                        t === 'add' ? 'subtract' : 'add',
                      )
                      setInlineError(null)
                    }}
                  >
                    {inlineAdjType === 'add' ? (
                      <Plus className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Min"
                    value={inlineAdjMinutes}
                    onChange={(e) => {
                      setInlineAdjMinutes(e.target.value)
                      setInlineError(null)
                    }}
                    className={cn(
                      'h-6 w-14 px-1.5 text-[11px]',
                      inlineError && 'border-destructive',
                    )}
                  />
                </div>
                <Input
                  placeholder="Motivo (opcional)"
                  value={inlineAdjNote}
                  onChange={(e) => setInlineAdjNote(e.target.value)}
                  className="h-6 px-1.5 text-[11px]"
                />
                {inlineError && (
                  <p className="text-destructive text-[9px] leading-tight font-medium">
                    {inlineError}
                  </p>
                )}
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setEditingIndex(null)}
                  >
                    <X className="text-muted-foreground h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={
                      !inlineAdjMinutes || Number(inlineAdjMinutes) <= 0
                    }
                    onClick={() => handleInlineEditAdjSave(block)}
                  >
                    <Check className="text-primary h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          }

          const isPositive = block.entry.secondsAtEvent > 0
          const canDelete = isDeleteSafe(block)

          return (
            <div
              onDoubleClick={() => startInlineEditAdj(block)}
              className="group hover:bg-muted/40 flex cursor-pointer items-start justify-between gap-2 rounded-md p-1 pr-1.5 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    isPositive
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-destructive/20 text-destructive',
                  )}
                >
                  {isPositive ? (
                    <Plus className="h-2.5 w-2.5" />
                  ) : (
                    <Minus className="h-2.5 w-2.5" />
                  )}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-foreground text-[11px] font-medium">
                    {isPositive ? 'Adicionado' : 'Removido'} (
                    {formatDuration(Math.abs(block.entry.secondsAtEvent))})
                  </span>
                  {block.entry.note && (
                    <span className="text-muted-foreground w-[140px] truncate text-[9px]">
                      {block.entry.note}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    startInlineEditAdj(block)
                  }}
                  className="h-5 w-5 shrink-0"
                >
                  <Pencil className="text-muted-foreground h-2.5 w-2.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-disabled={!canDelete}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (canDelete) handleDelete(block)
                  }}
                  className={cn(
                    'h-5 w-5 shrink-0',
                    canDelete
                      ? 'hover:text-destructive'
                      : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          )
        }

        case 'pause-ongoing':
          return (
            <div className="group hover:bg-muted/40 flex items-start justify-between gap-2 rounded-md p-1 pr-1.5 transition-colors">
              <div className="flex items-center gap-2">
                <div className="bg-muted-foreground/20 flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                  <Pause className="text-muted-foreground h-2.5 w-2.5 fill-current" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-foreground text-[11px] font-medium">
                    Pausado (Andamento)
                  </span>
                  <span className="text-muted-foreground text-[9px]">
                    Desde {format(parseISO(block.paused.at), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(block)}
                className="hover:text-destructive h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </Button>
            </div>
          )

        case 'pause-block': {
          const isEditingPause = editingIndex === block.pauseIndex

          if (isEditingPause) {
            return (
              <div className="bg-muted/40 border-border/50 relative z-10 flex flex-col gap-1.5 rounded-md border p-2 shadow-sm">
                <span className="text-foreground text-[11px] font-medium">
                  Editar Pausa
                </span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={inlineStartTime}
                    onChange={(e) => {
                      setInlineStartTime(e.target.value)
                      setInlineError(null)
                    }}
                    className={cn(
                      'h-6 w-[70px] px-1.5 text-[11px]',
                      inlineError && 'border-destructive',
                    )}
                  />
                  <span className="text-muted-foreground text-[10px]">até</span>
                  <Input
                    type="time"
                    value={inlineEndTime}
                    onChange={(e) => {
                      setInlineEndTime(e.target.value)
                      setInlineError(null)
                    }}
                    className={cn(
                      'h-6 w-[70px] px-1.5 text-[11px]',
                      inlineError && 'border-destructive',
                    )}
                  />
                </div>
                {inlineError && (
                  <p className="text-destructive text-[9px] leading-tight font-medium">
                    {inlineError}
                  </p>
                )}
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setEditingIndex(null)}
                  >
                    <X className="text-muted-foreground h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleInlineEditPauseSave(block)}
                  >
                    <Check className="text-primary h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          }

          const canDelete = isDeleteSafe(block)

          return (
            <div
              onDoubleClick={() => startInlineEditPause(block)}
              className="group hover:bg-muted/40 flex cursor-pointer items-start justify-between gap-2 rounded-md p-1 pr-1.5 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <div className="bg-muted-foreground/20 flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                  <Clock className="text-muted-foreground h-2.5 w-2.5" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-foreground text-[11px] font-medium">
                    Pausa ({formatDuration(block.durationSeconds)})
                  </span>
                  <span className="text-muted-foreground text-[9px]">
                    {format(parseISO(block.paused.at), 'HH:mm')} -{' '}
                    {format(parseISO(block.resumed.at), 'HH:mm')}
                  </span>
                </div>
              </div>
              <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    startInlineEditPause(block)
                  }}
                  className="h-5 w-5 shrink-0"
                >
                  <Pencil className="text-muted-foreground h-2.5 w-2.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-disabled={!canDelete}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (canDelete) handleDelete(block)
                  }}
                  className={cn(
                    'h-5 w-5 shrink-0',
                    canDelete
                      ? 'hover:text-destructive'
                      : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          )
        }
      }
    }

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {trigger ? (
            trigger
          ) : (
            <Button
              variant="ghost"
              size="icon"
              disabled={!activeEntry}
              className={cn(
                'text-muted-foreground hover:bg-muted/50 hover:text-foreground h-[18px] w-[18px] rounded p-0 transition-colors',
                !activeEntry && 'cursor-not-allowed opacity-50',
              )}
            >
              <History className="h-3 w-3" />
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={10}
          onInteractOutside={(e) => {
            if (isAddingInline || editingIndex !== null) e.preventDefault()
          }}
          className="bg-card w-[260px] overflow-hidden rounded-lg p-0 shadow-lg"
        >
          <div className="flex items-center justify-between p-2">
            <div className="text-foreground flex items-center gap-1.5 text-[13px] font-semibold">
              <Database className="text-primary h-3.5 w-3.5" />
              Histórico da Sessão
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-md"
              onClick={() => setIsOpen(false)}
            >
              <X className="text-muted-foreground hover:text-foreground h-3.5 w-3.5" />
            </Button>
          </div>

          <Separator />

          <div className="flex max-h-[260px] flex-col overflow-y-auto p-1.5">
            {!activeEntry || timeline.length === 0 ? (
              <div className="text-muted-foreground p-3 text-center text-[10px]">
                Nenhum histórico para esta sessão ainda.
              </div>
            ) : (
              <div className="relative pl-1">
                <div className="bg-border absolute top-2 bottom-2 left-2.5 w-[2px]" />
                <div className="relative flex flex-col gap-2.5">
                  {timeline.map((block, i) => (
                    <React.Fragment key={i}>
                      {renderTimelineBlock(block)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isAddingInline && (
            <div className="bg-muted/40 border-border/50 mx-1.5 mb-1.5 flex flex-col gap-1.5 rounded-md border p-2 shadow-sm">
              <span className="text-foreground text-[11px] font-medium">
                Novo Ajuste
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-6 w-6 shrink-0 transition-colors',
                    addType === 'add'
                      ? 'border-green-500/20 bg-green-500/10 text-green-500'
                      : 'border-destructive/20 bg-destructive/10 text-destructive',
                  )}
                  onClick={() => {
                    setAddType((t) => (t === 'add' ? 'subtract' : 'add'))
                    setAddError(null)
                  }}
                >
                  {addType === 'add' ? (
                    <Plus className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                </Button>
                <Input
                  type="number"
                  min="1"
                  placeholder="Minutos"
                  value={addMinutes}
                  onChange={(e) => {
                    setAddMinutes(e.target.value)
                    setAddError(null)
                  }}
                  className={cn(
                    'h-6 px-1.5 text-[11px]',
                    addError && 'border-destructive',
                  )}
                />
              </div>
              <Input
                placeholder="Motivo (opcional)"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                className="h-6 px-1.5 text-[11px]"
              />
              {addError && (
                <p className="text-destructive text-[9px] leading-tight font-medium">
                  {addError}
                </p>
              )}
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setIsAddingInline(false)}
                >
                  <X className="text-muted-foreground h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={!addMinutes || Number(addMinutes) <= 0}
                  onClick={handleAddSave}
                >
                  <Check className="text-primary h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {!isAddingInline && <Separator />}

          <div className="bg-muted/10 flex items-center justify-between p-1.5 px-2.5">
            <span className="text-muted-foreground text-[9px] font-medium">
              {timeline.length} {timeline.length === 1 ? 'bloco' : 'blocos'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingIndex(null)
                setAddError(null)
                setIsAddingInline(true)
              }}
              className="h-5 gap-1 px-1.5 text-[9px]"
            >
              <Plus className="h-2.5 w-2.5" /> Ajuste
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)

TimerHistory.displayName = 'TimerHistory'
