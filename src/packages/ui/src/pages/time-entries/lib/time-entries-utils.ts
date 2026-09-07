import { format, parseISO } from 'date-fns'
import {
  BarChart2,
  Briefcase,
  CalendarCheck,
  CheckCircle,
  ClipboardCheck,
  Code,
  FileText,
  FlaskConical,
  GraduationCap,
  Handshake,
  LifeBuoy,
  Palette,
  SearchCode,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react'
import type { ElementType } from 'react'

import { Row } from '@/components/time-entries-table/columns'

export interface SuggestionRow extends Row {
  isSuggestion?: boolean
  isDraft?: boolean
}

export const decimalToHMS = (decimalHours: number): string => {
  const totalSeconds = Math.round(decimalHours * 3600)
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const formatSecondsToHMDisplay = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export const formatHours = (decimalHours: number): string => {
  const totalSeconds = Math.round((decimalHours || 0) * 3600)
  return formatSecondsToHMDisplay(totalSeconds)
}

export const activityIconMap: Record<string, ElementType> = {
  Palette,
  Code,
  BarChart2,
  CalendarCheck,
  CheckCircle,
  FlaskConical,
  SearchCode,
  Settings,
  Wrench,
  LifeBuoy,
  Handshake,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Users,
  Briefcase,
  ShieldCheck,
}

export function hasNoTask(item?: Partial<SuggestionRow> | null): boolean {
  if (!item) return true
  const taskId = item.task?.id
  return (
    !taskId ||
    taskId.trim() === '' ||
    taskId === '# ticket' ||
    taskId === '# Ticket' ||
    taskId === 'sem-issue' ||
    taskId === 'Tarefa'
  )
}

export function getItemDateIso(item?: Partial<SuggestionRow> | null): string {
  if (!item) return new Date().toISOString()
  const raw = item.startDate || item.createdAt
  if (raw) {
    try {
      const parsed = parseISO(raw)
      if (!isNaN(parsed.getTime())) {
        return raw
      }
    } catch {
      // fallback
    }
  }
  return new Date().toISOString()
}

export function sortSubRows(items: SuggestionRow[]): SuggestionRow[] {
  return [...items].sort((a, b) => {
    // 1. Drafts always at the very bottom/end of the group
    if (a.isDraft && !b.isDraft) return 1
    if (!a.isDraft && b.isDraft) return -1

    // 2. Running timers always at the top of the group
    if (a.timeStatus === 'running' && b.timeStatus !== 'running') return -1
    if (a.timeStatus !== 'running' && b.timeStatus === 'running') return 1

    // 3. Paused timers second (top priority)
    if (a.timeStatus === 'paused' && b.timeStatus !== 'paused') return -1
    if (a.timeStatus !== 'paused' && b.timeStatus === 'paused') return 1

    // 4. Unassigned tasks at the top
    const aNoTask = hasNoTask(a)
    const bNoTask = hasNoTask(b)
    if (aNoTask && !bNoTask) return -1
    if (!aNoTask && bNoTask) return 1

    // 5. Date descending
    const aDate = new Date(getItemDateIso(a)).getTime()
    const bDate = new Date(getItemDateIso(b)).getTime()
    return bDate - aDate
  })
}

export function sortFlatEntries(data: SuggestionRow[]): SuggestionRow[] {
  return [...data]
    .map((item) => ({ ...item, subRows: [] }))
    .sort((a, b) => {
      // 1. Running timers always at the very top of all entries
      if (a.timeStatus === 'running' && b.timeStatus !== 'running') return -1
      if (a.timeStatus !== 'running' && b.timeStatus === 'running') return 1

      // 2. Paused timers next (same high priority at the top)
      if (a.timeStatus === 'paused' && b.timeStatus !== 'paused') return -1
      if (a.timeStatus !== 'paused' && b.timeStatus === 'paused') return 1

      // 3. Drafts always at the very bottom of the table
      if (a.isDraft && !b.isDraft) return 1
      if (!a.isDraft && b.isDraft) return -1

      // 4. Unassigned tasks AT THE TOP
      const aNoTask = hasNoTask(a)
      const bNoTask = hasNoTask(b)
      if (aNoTask && !bNoTask) return -1
      if (!aNoTask && bNoTask) return 1

      // 5. Date descending
      const aDate = new Date(getItemDateIso(a)).getTime()
      const bDate = new Date(getItemDateIso(b)).getTime()
      return bDate - aDate
    })
}

export function groupByIssue(data: SuggestionRow[]): SuggestionRow[] {
  const counts: Record<string, number> = {}
  for (const item of data) {
    const dateIso = getItemDateIso(item)
    const dayKey = format(parseISO(dateIso), 'yyyy-MM-dd')
    const key = `${dayKey}-${hasNoTask(item) ? 'sem-issue' : (item.task?.id ?? 'sem-issue')}`
    counts[key] = (counts[key] || 0) + 1
  }

  const groups: Record<string, SuggestionRow> = {}
  const result: SuggestionRow[] = []

  for (const item of data) {
    const dateIso = getItemDateIso(item)
    const dayKey = format(parseISO(dateIso), 'yyyy-MM-dd')
    const key = `${dayKey}-${hasNoTask(item) ? 'sem-issue' : (item.task?.id ?? 'sem-issue')}`

    if (counts[key] > 1) {
      if (!groups[key]) {
        groups[key] = {
          ...item,
          _id: key,
          id: key,
          startDate: dateIso,
          isSuggestion: false,
          timeStatus: 'finished',
          timeSpent: 0,
          comments: '',
          subRows: [],
        }

        result.push(groups[key])
      }

      if (!item.isSuggestion) {
        groups[key].timeSpent += item.timeSpent
      }
      groups[key].subRows?.push(item)
    } else {
      result.push({ ...item, subRows: [] })
    }
  }

  // Sort subRows inside each group:
  // Running first, paused second, unassigned at top, drafts at the very end
  result.forEach((row) => {
    if (row.subRows && row.subRows.length > 0) {
      row.subRows = sortSubRows(row.subRows)
      const hasRunning = row.subRows.some((s) => s.timeStatus === 'running')
      const hasPaused = row.subRows.some((s) => s.timeStatus === 'paused')
      if (hasRunning) {
        row.timeStatus = 'running'
      } else if (hasPaused) {
        row.timeStatus = 'paused'
      }
    }
  })

  // Sort top-level groups and standalone items:
  return result.sort((a, b) => {
    // 1. Running timers / groups with running timers always at the very top
    const aHasRunning =
      a.timeStatus === 'running' ||
      a.subRows?.some((s) => s.timeStatus === 'running')
    const bHasRunning =
      b.timeStatus === 'running' ||
      b.subRows?.some((s) => s.timeStatus === 'running')
    if (aHasRunning && !bHasRunning) return -1
    if (!aHasRunning && bHasRunning) return 1

    // 2. Paused timers / groups with paused timers next at top
    const aHasPaused =
      a.timeStatus === 'paused' ||
      a.subRows?.some((s) => s.timeStatus === 'paused')
    const bHasPaused =
      b.timeStatus === 'paused' ||
      b.subRows?.some((s) => s.timeStatus === 'paused')
    if (aHasPaused && !bHasPaused) return -1
    if (!aHasPaused && bHasPaused) return 1

    // 3. Standalone draft entries always at the bottom
    const aIsDraft = a.isDraft && (!a.subRows || a.subRows.length === 0)
    const bIsDraft = b.isDraft && (!b.subRows || b.subRows.length === 0)
    if (aIsDraft && !bIsDraft) return 1
    if (!aIsDraft && bIsDraft) return -1

    // 4. Entries/groups WITHOUT task go AT THE TOP
    const aNoTask = hasNoTask(a)
    const bNoTask = hasNoTask(b)
    if (aNoTask && !bNoTask) return -1
    if (!aNoTask && bNoTask) return 1

    // 5. Date descending
    const aDate = new Date(getItemDateIso(a)).getTime()
    const bDate = new Date(getItemDateIso(b)).getTime()
    return bDate - aDate
  })
}
