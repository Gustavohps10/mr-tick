import { format, parseISO } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  BarChart2,
  BookOpen,
  Boxes,
  Briefcase,
  Bug,
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Code,
  Code2,
  Coffee,
  Compass,
  Cpu,
  Database,
  Eye,
  File,
  FileCode,
  FileText,
  Flame,
  FlaskConical,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  GraduationCap,
  Handshake,
  Hash,
  HelpCircle,
  History,
  Inbox,
  Laptop,
  Layers,
  LifeBuoy,
  ListTodo,
  MessageSquare,
  MinusCircle,
  Monitor,
  Package,
  Palette,
  Play,
  Rocket,
  Search,
  SearchCode,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  Terminal,
  TerminalSquare,
  TestTube,
  Timer,
  UserCog,
  Users,
  Workflow,
  Wrench,
  Zap,
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
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  BarChart2,
  BookOpen,
  Boxes,
  Briefcase,
  Bug,
  Bugfix: Bug,
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Code,
  Code2,
  Coding: Code,
  CodeReview: GitMerge,
  Coffee,
  Compass,
  Cpu,
  Database,
  Design: Palette,
  Dev: Code,
  Development: Code,
  Eye,
  File,
  FileCode,
  FileText,
  Flame,
  FlaskConical,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  GraduationCap,
  Handshake,
  Hash,
  HelpCircle,
  History,
  Inbox,
  Laptop,
  Layers,
  LifeBuoy,
  ListTodo,
  Meeting: Users,
  MessageSquare,
  MinusCircle,
  Monitor,
  Package,
  Palette,
  Play,
  Review: Eye,
  Rocket,
  Search,
  SearchCode,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  Terminal,
  TerminalSquare,
  Testing: TestTube,
  TestTube,
  Timer,
  UserCog,
  Users,
  Workflow,
  Wrench,
  Zap,
}

export function getActivityIcon(
  iconName?: string | null,
): ElementType | undefined {
  if (!iconName) return undefined
  if (activityIconMap[iconName]) return activityIconMap[iconName]

  const normalized = iconName.trim()
  if (activityIconMap[normalized]) return activityIconMap[normalized]

  const pascalName = normalized
    .split(/[-_\s]+/)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join('')

  if (activityIconMap[pascalName]) return activityIconMap[pascalName]

  const lowerIcon = normalized.toLowerCase()
  const matchedKey = Object.keys(activityIconMap).find(
    (key) => key.toLowerCase() === lowerIcon,
  )
  if (matchedKey && activityIconMap[matchedKey])
    return activityIconMap[matchedKey]

  return undefined
}

export function hasNoTask(item?: Partial<SuggestionRow> | null): boolean {
  if (!item) return true
  const pureId = extractPureTaskId(item.task?.id)
  return pureId === ''
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
    // 1. Running timers always at the top of the group
    if (a.timeStatus === 'running' && b.timeStatus !== 'running') return -1
    if (a.timeStatus !== 'running' && b.timeStatus === 'running') return 1

    // 2. Paused timers second (top priority)
    if (a.timeStatus === 'paused' && b.timeStatus !== 'paused') return -1
    if (a.timeStatus !== 'paused' && b.timeStatus === 'paused') return 1

    // 3. Unassigned tasks at the top
    const aNoTask = hasNoTask(a)
    const bNoTask = hasNoTask(b)
    if (aNoTask && !bNoTask) return -1
    if (!aNoTask && bNoTask) return 1

    // 4. Date descending
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

      // 3. Unassigned tasks AT THE TOP
      const aNoTask = hasNoTask(a)
      const bNoTask = hasNoTask(b)
      if (aNoTask && !bNoTask) return -1
      if (!aNoTask && bNoTask) return 1

      // 4. Date descending
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
    const pureId = extractPureTaskId(item.task?.id)
    const key = `${dayKey}-${pureId || 'no-task'}`
    counts[key] = (counts[key] || 0) + 1
  }

  const groups: Record<string, SuggestionRow> = {}
  const result: SuggestionRow[] = []

  for (const item of data) {
    const dateIso = getItemDateIso(item)
    const dayKey = format(parseISO(dateIso), 'yyyy-MM-dd')
    const pureId = extractPureTaskId(item.task?.id)
    const key = `${dayKey}-${pureId || 'no-task'}`

    if (counts[key] <= 1) {
      result.push({ ...item, subRows: [] })
      continue
    }

    if (!groups[key]) {
      groups[key] = {
        ...item,
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
  }

  // Sort subRows inside each group:
  // Running first, paused second, unassigned at top
  result.forEach((row) => {
    if (!row.subRows || row.subRows.length === 0) return
    row.subRows = sortSubRows(row.subRows)
    const hasRunning = row.subRows.some((s) => s.timeStatus === 'running')
    if (hasRunning) {
      row.timeStatus = 'running'
      return
    }
    const hasPaused = row.subRows.some((s) => s.timeStatus === 'paused')
    if (hasPaused) {
      row.timeStatus = 'paused'
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

    // 3. Entries/groups WITHOUT task go AT THE TOP
    const aNoTask = hasNoTask(a)
    const bNoTask = hasNoTask(b)
    if (aNoTask && !bNoTask) return -1
    if (!aNoTask && bNoTask) return 1

    // 4. Date descending
    const aDate = new Date(getItemDateIso(a)).getTime()
    const bDate = new Date(getItemDateIso(b)).getTime()
    return bDate - aDate
  })
}

export function extractPureTaskId(rawId?: string | null): string {
  if (!rawId) return ''
  const trimmed = rawId.trim()
  if (!trimmed) return ''

  let pureId = trimmed
  if (pureId.includes('::')) {
    const parts = pureId.split('::')
    if (parts[1]) pureId = parts[1]
  }

  if (pureId.startsWith('#')) {
    pureId = pureId.slice(1).trim()
  }

  return pureId
}

export const cleanTaskId = extractPureTaskId
