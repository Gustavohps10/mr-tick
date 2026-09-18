'use client'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  AddonTimerbarMenuItem,
  AddonTimerbarPopoverSubItem,
} from '@mr-tick/application'
import { differenceInSeconds, isSameDay, isValid, parseISO } from 'date-fns'
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2Icon,
  Coffee,
  FlaskConical,
  GripHorizontal,
  GripVertical,
  Info,
  MessageSquareDiff,
  Pause,
  PenTool,
  Play,
  Square,
  Users,
  X,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { RxDocument } from 'rxdb'
import { toast } from 'sonner'

import { TaskLookup } from '@/components/task-lookup'
import { TaskPopover } from '@/components/task-popover'
import { TimerDisplay } from '@/components/time-bar/timer-display'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useOpenAPI } from '@/hooks'
import {
  useCurrentWidgetPosition,
  useTimerSettings,
} from '@/hooks/use-timer-settings'
import { cn } from '@/lib/utils'
import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

import { TimerHistory } from './details/timer-history'
import { TimerSettings } from './details/timer-settings'
import { useActiveTimer } from './useActiveTimer'

const mockActivities: Array<{
  id: string
  name: string
  icon: React.ElementType
}> = [
  { id: 'dev', name: 'Desenvolvimento', icon: Code2Icon },
  { id: 'teste', name: 'Teste', icon: FlaskConical },
  { id: 'design', name: 'Design', icon: PenTool },
  { id: 'meeting', name: 'Meeting', icon: Users },
  { id: 'break', name: 'Break', icon: Coffee },
]

const STORAGE_KEY = 'mr-tick:widget:block-order'
const FREE_DRAG_STORAGE_KEY = 'mr-tick:widget:free-offset'

type WidgetPosition = 'top' | 'bottom' | 'left' | 'right'
type FreeOffset = { x: number; y: number }
type FreeOffsets = Record<WidgetPosition, FreeOffset>

const DEFAULT_FREE_OFFSETS: FreeOffsets = {
  top: { x: 0, y: 0 },
  bottom: { x: 0, y: 0 },
  left: { x: 0, y: 0 },
  right: { x: 0, y: 0 },
}

function loadFreeOffsets(): FreeOffsets {
  if (typeof window === 'undefined') return DEFAULT_FREE_OFFSETS
  try {
    const raw = window.localStorage.getItem(FREE_DRAG_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      return { ...DEFAULT_FREE_OFFSETS, ...parsed }
    }
  } catch {}
  return DEFAULT_FREE_OFFSETS
}

const getDragBoundaryElement = (element: HTMLElement): HTMLElement | null =>
  element.closest<HTMLElement>('[data-widget-drag-boundary]') ??
  element.parentElement

const clamp = (val: number, min: number, max: number) => {
  const actualMin = Math.min(min, max)
  const actualMax = Math.max(min, max)
  return Math.max(actualMin, Math.min(actualMax, val))
}

// ---------------------------------------------------------------------------
// 1. CONTEXT API
// ---------------------------------------------------------------------------
type UltimateTimeTrackerContextType = {
  isVertical: boolean
  widgetPosition: WidgetPosition
  isExpanded: boolean
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
  widgetHandleRef: React.RefObject<HTMLDivElement | null>

  taskId: string
  setTaskId: React.Dispatch<React.SetStateAction<string>>
  selectedTask: SyncTaskRxDBDTO | null
  setSelectedTask: React.Dispatch<React.SetStateAction<SyncTaskRxDBDTO | null>>
  isTaskLookupOpen: boolean
  setIsTaskLookupOpen: React.Dispatch<React.SetStateAction<boolean>>
  activities: Array<{ id: string; name: string; icon: React.ElementType }>
  handleSelectTask: (task: SyncTaskRxDBDTO) => void
  description: string
  setDescription: React.Dispatch<React.SetStateAction<string>>
  selectedActivity: string
  setSelectedActivity: React.Dispatch<React.SetStateAction<string>>
  manualInitialSeconds: number
  setManualInitialSeconds: React.Dispatch<React.SetStateAction<number>>

  isEditingVertical: boolean
  setIsEditingVertical: React.Dispatch<React.SetStateAction<boolean>>
  timerDirection: 'up' | 'down'
  isRunning: boolean
  isIdle: boolean

  handleStart: () => void
  handlePause: () => void
  handleStop: () => void
  handleDirectLog: () => void

  selectedConnectionId: string
  setSelectedConnectionId: React.Dispatch<React.SetStateAction<string>>
  syncConnections: any[]
  dbTodaySeconds: number

  timerError: string | null
  setTimerError: React.Dispatch<React.SetStateAction<string | null>>
}

export const UltimateTimeTrackerContext =
  createContext<UltimateTimeTrackerContextType | null>(null)

export const useOptionalTrackerContext = () => {
  return useContext(UltimateTimeTrackerContext)
}

export const useTrackerContext = () => {
  const context = useContext(UltimateTimeTrackerContext)
  if (!context) {
    throw new Error(
      'UltimateTimeTracker compound components must be used within <UltimateTimeTracker>',
    )
  }
  return context
}

// ---------------------------------------------------------------------------
// 2. ROOT COMPONENT
// ---------------------------------------------------------------------------
export const UltimateTimeTracker = ({
  children,
}: {
  children?: React.ReactNode
}) => {
  const [taskId, setTaskId] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<SyncTaskRxDBDTO | null>(null)
  const [isTaskLookupOpen, setIsTaskLookupOpen] = useState(false)
  const [description, setDescription] = useState<string>('')
  const [selectedActivity, setSelectedActivity] = useState<string>('dev')
  const [manualInitialSeconds, setManualInitialSeconds] = useState<number>(0)
  const [timerError, setTimerError] = useState<string | null>(null)
  const [activities, setActivities] =
    useState<Array<{ id: string; name: string; icon: React.ElementType }>>(
      mockActivities,
    )
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const syncConnections = useConnectionsWithSync()

  useEffect(() => {
    if (!selectedConnectionId && syncConnections.length > 0) {
      setSelectedConnectionId(syncConnections[0].connectionId)
    }
  }, [syncConnections, selectedConnectionId])

  const [isEditingVertical, setIsEditingVertical] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const [freeOffsets, setFreeOffsets] =
    useState<FreeOffsets>(DEFAULT_FREE_OFFSETS)

  const { timerDirection, setTimerDirection } = useTimerSettings()
  const [widgetPosition] = useCurrentWidgetPosition()
  const db = useSyncStore((s) => s.db)
  const openAPI = useOpenAPI()
  const setActive = useTimeEntryStore((s) => s.setActive)

  // Carrega dinamicamente as atividades do metadata baseado na Task / Conexões ativas
  useEffect(() => {
    if (!db) return

    let isMounted = true

    const loadMetadataActivities = async () => {
      try {
        let docs: RxDocument<SyncMetadataRxDBDTO>[] = []

        const connId =
          selectedTask?.connectionInstanceId || selectedConnectionId
        if (connId) {
          docs = await db.metadata
            .find({
              selector: {
                connectionInstanceId: {
                  $eq: connId,
                },
              },
            })
            .exec()
        }

        if (docs.length === 0) {
          docs = await db.metadata.find().exec()
        }

        const loaded: Array<{
          id: string
          name: string
          icon: React.ElementType
        }> = []

        docs.forEach((doc) => {
          const json = doc.toMutableJSON ? doc.toMutableJSON() : doc
          json.activities?.forEach((act: any) => {
            if (!loaded.some((a) => a.id === act.id)) {
              const IconComp = (LucideIcons as any)[act.icon] || Code2Icon
              loaded.push({
                id: act.id,
                name: act.name,
                icon: IconComp,
              })
            }
          })
        })

        if (isMounted && loaded.length > 0) {
          setActivities(loaded)
          if (!loaded.some((a) => a.id === selectedActivity)) {
            setSelectedActivity(loaded[0].id)
          }
        }
      } catch (err) {
        console.error('[METADATA] Erro ao carregar atividades:', err)
      }
    }

    loadMetadataActivities()

    return () => {
      isMounted = false
    }
  }, [db, selectedTask, selectedConnectionId])

  useEffect(() => {
    const isWidgetWindow = window.location.hash.includes('/widgets/')
    if (!isWidgetWindow) return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.matches?.('input, textarea')) {
        openAPI.modules.system.startKeyboardInterception?.()
      }
    }

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.matches?.('input, textarea')) {
        openAPI.modules.system.stopKeyboardInterception?.()
      }
    }

    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)

    // Ouve os caracteres interceptados pelo C++
    const cleanupKeyListener = openAPI.events.on<{
      vkCode: number
      key: string
    }>('widget:raw-key-input', (data) => {
      const activeEl = document.activeElement as
        HTMLInputElement | HTMLTextAreaElement | null
      if (!activeEl || !['INPUT', 'TEXTAREA'].includes(activeEl.tagName)) return

      if (data.vkCode === 8) {
        // Backspace
        const start = activeEl.selectionStart ?? activeEl.value.length
        const end = activeEl.selectionEnd ?? activeEl.value.length
        if (start === end && start > 0) {
          activeEl.setRangeText('', start - 1, start, 'end')
        } else {
          activeEl.setRangeText('', start, end, 'end')
        }
        activeEl.dispatchEvent(new Event('input', { bubbles: true }))
      } else if (data.vkCode === 13) {
        // Enter
        activeEl.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
          }),
        )
      } else if (data.vkCode === 27) {
        // Escape
        activeEl.blur()
      } else if (data.key) {
        // Insere o caractere digitado na posição do cursor
        const start = activeEl.selectionStart ?? activeEl.value.length
        const end = activeEl.selectionEnd ?? activeEl.value.length
        activeEl.setRangeText(data.key, start, end, 'end')
        activeEl.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    return () => {
      window.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('focusout', handleFocusOut)
      cleanupKeyListener?.()
    }
  }, [])

  const activeEntry = useTimeEntryStore((s) => s.active)

  const [dbTodaySeconds, setDbTodaySeconds] = useState(0)

  useEffect(() => {
    if (!db?.timeEntries) return

    const now = new Date()

    const sub = db.timeEntries.find().$.subscribe((docs) => {
      let totalSecs = 0
      docs.forEach((doc) => {
        const item = doc.toMutableJSON ? doc.toMutableJSON() : doc
        if (item._deleted) return

        const entryDate = item.startDate
          ? parseISO(item.startDate)
          : item.createdAt
            ? parseISO(item.createdAt)
            : null

        if (!entryDate || !isValid(entryDate) || !isSameDay(entryDate, now)) {
          return
        }

        const isActive =
          activeEntry &&
          item.connectionInstanceId === activeEntry.connectionInstanceId &&
          item.sourceId === activeEntry.sourceId

        if (isActive) return

        let secs = 0
        if (typeof item.timeSpent === 'number' && item.timeSpent > 0) {
          secs =
            item.timeSpent < 100
              ? Math.round(item.timeSpent * 3600)
              : Math.round(item.timeSpent)
        } else if (item.startDate && item.endDate) {
          secs = Math.max(
            0,
            differenceInSeconds(
              parseISO(item.endDate),
              parseISO(item.startDate),
            ),
          )
        }
        totalSecs += secs
      })
      setDbTodaySeconds(totalSecs)
    })

    return () => sub.unsubscribe()
  }, [db, activeEntry?.connectionInstanceId, activeEntry?.sourceId])
  const playCurrentTimeEntry = useTimeEntryStore((s) => s.playCurrentTimeEntry)
  const pauseCurrentTimeEntry = useTimeEntryStore(
    (s) => s.pauseCurrentTimeEntry,
  )
  const stopCurrentTimeEntry = useTimeEntryStore((s) => s.stopCurrentTimeEntry)
  const createNewTimeEntry = useTimeEntryStore((s) => s.createNewTimeEntry)

  useEffect(() => {
    setFreeOffsets(loadFreeOffsets())
  }, [])

  const prevActiveRef = useRef(activeEntry)

  useEffect(() => {
    if (activeEntry) {
      if (activeEntry.task?.id !== undefined)
        setTaskId(activeEntry.task?.id || '')
      if (activeEntry.taskData !== undefined)
        setSelectedTask(activeEntry.taskData || null)
      if (activeEntry.comments !== undefined)
        setDescription(activeEntry.comments || '')
      if (activeEntry.activity?.id) setSelectedActivity(activeEntry.activity.id)
      if (activeEntry.connectionInstanceId)
        setSelectedConnectionId(activeEntry.connectionInstanceId)
      if (activeEntry.timerConfig?.mode) {
        setTimerDirection(
          activeEntry.timerConfig.mode === 'countup' ? 'up' : 'down',
        )
      }
      if (activeEntry.timerConfig?.manualInitialSeconds !== undefined) {
        setManualInitialSeconds(activeEntry.timerConfig.manualInitialSeconds)
      }
    } else if (prevActiveRef.current) {
      setTaskId('')
      setSelectedTask(null)
      setDescription('')
      setManualInitialSeconds(0)
    }
    prevActiveRef.current = activeEntry
  }, [activeEntry, setTimerDirection])

  const isRunning = activeEntry?.timeStatus === 'running'
  const isIdle = !activeEntry
  const isVertical = widgetPosition === 'left' || widgetPosition === 'right'

  const cardRef = useRef<HTMLDivElement | null>(null)
  const widgetHandleRef = useRef<HTMLDivElement | null>(null)

  const currentOffsetRef = useRef<FreeOffset>({ x: 0, y: 0 })
  const freeOffsetsRef = useRef<FreeOffsets>(DEFAULT_FREE_OFFSETS)
  const isDraggingWidgetRef = useRef(false)

  // -- INÍCIO DA LÓGICA DE BLINDAGEM DE HOVER / IPC OTIMIZADA --
  useEffect(() => {
    const isWidgetWindow = window.location.hash.includes('/widgets/')
    if (!isWidgetWindow) return

    let isCurrentlyIgnored = true

    const setIgnoreState = (shouldIgnore: boolean) => {
      if (shouldIgnore === isCurrentlyIgnored) return
      isCurrentlyIgnored = shouldIgnore

      // Passar sempre { forward: true } quando for ignorar para o Chromium continuar recebendo o mousemove
      openAPI.modules.system.setIgnoreMouseEvents({
        body: { ignore: shouldIgnore, forward: true },
      })
    }

    const handlePointerEnter = (e: PointerEvent) => {
      if (isDraggingWidgetRef.current) return
      setIgnoreState(false)
    }

    const handlePointerLeave = (e: PointerEvent) => {
      if (isDraggingWidgetRef.current) return

      // Verifica se o cursor realmente saiu para o espaço vazio e não para um popover/portal
      const related = e.relatedTarget as HTMLElement | null
      const isMovingToInteractiveUI = Boolean(
        related?.closest(
          '[data-widget-card], [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="tooltip"]',
        ),
      )

      if (!isMovingToInteractiveUI) {
        setIgnoreState(true)
      }
    }

    const cardElement = cardRef.current
    if (cardElement) {
      cardElement.addEventListener('pointerenter', handlePointerEnter)
      cardElement.addEventListener('pointerleave', handlePointerLeave)
    }

    // Monitora portals do Radix UI (Popovers/Tooltips) abertos dinamicamente no body
    const observer = new MutationObserver(() => {
      const overlays = document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="tooltip"]',
      )
      overlays.forEach((el) => {
        el.removeEventListener('pointerenter', handlePointerEnter as any)
        el.removeEventListener('pointerleave', handlePointerLeave as any)
        el.addEventListener('pointerenter', handlePointerEnter as any)
        el.addEventListener('pointerleave', handlePointerLeave as any)
      })
    })

    observer.observe(document.body, { childList: true, subtree: true })

    // Estado inicial: janela ignora cliques até o mouse entrar
    setIgnoreState(true)

    return () => {
      if (cardElement) {
        cardElement.removeEventListener('pointerenter', handlePointerEnter)
        cardElement.removeEventListener('pointerleave', handlePointerLeave)
      }
      observer.disconnect()
    }
  }, [])
  // -- FIM DA LÓGICA DE BLINDAGEM DE HOVER / IPC OTIMIZADA --

  const dragStateRef = useRef<{
    initialRect: DOMRect
    parentRect: DOMRect
    initialClientX: number
    initialClientY: number
    animationFrameId: number | null
  } | null>(null)

  useEffect(() => {
    freeOffsetsRef.current = freeOffsets
    currentOffsetRef.current = freeOffsets[
      widgetPosition as WidgetPosition
    ] ?? { x: 0, y: 0 }
  }, [freeOffsets, widgetPosition])

  useLayoutEffect(() => {
    const element = cardRef.current
    if (!element || isDraggingWidgetRef.current) return

    const offset = freeOffsets[widgetPosition as WidgetPosition] ?? {
      x: 0,
      y: 0,
    }
    const newX = isVertical ? 0 : offset.x
    const newY = isVertical ? offset.y : 0

    element.style.transform = `translate3d(${newX}px, ${newY}px, 0)`
  }, [freeOffsets, widgetPosition, isVertical])

  useEffect(() => {
    const element = cardRef.current
    const dragHandle = widgetHandleRef.current
    if (!element || !dragHandle) return

    const getClampedDelta = (
      initialRect: DOMRect,
      parentRect: DOMRect,
      rawDx: number,
      rawDy: number,
    ) => {
      const padding = 8
      const minDx = parentRect.left - initialRect.left + padding
      const maxDx = parentRect.right - initialRect.right - padding
      const minDy = parentRect.top - initialRect.top + padding
      const maxDy = parentRect.bottom - initialRect.bottom - padding

      return {
        dx: clamp(rawDx, minDx, maxDx),
        dy: clamp(rawDy, minDy, maxDy),
      }
    }

    const scheduleTransform = (offset: FreeOffset) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      if (dragState.animationFrameId !== null) {
        cancelAnimationFrame(dragState.animationFrameId)
      }

      dragState.animationFrameId = requestAnimationFrame(() => {
        element.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`

        if (dragStateRef.current) {
          dragStateRef.current.animationFrameId = null
        }
      })
    }

    let activePointerId: number | null = null

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return
      const dragState = dragStateRef.current
      if (!dragState) return

      const rawDx = event.clientX - dragState.initialClientX
      const rawDy = event.clientY - dragState.initialClientY

      const { dx, dy } = getClampedDelta(
        dragState.initialRect,
        dragState.parentRect,
        rawDx,
        rawDy,
      )

      const currentOffset = currentOffsetRef.current
      const nextOffset: FreeOffset = isVertical
        ? { x: 0, y: currentOffset.y + dy }
        : { x: currentOffset.x + dx, y: 0 }

      scheduleTransform(nextOffset)
    }

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)

      if (
        activePointerId !== null &&
        dragHandle.hasPointerCapture(activePointerId)
      ) {
        dragHandle.releasePointerCapture(activePointerId)
      }
      activePointerId = null

      const dragState = dragStateRef.current
      if (!dragState) {
        isDraggingWidgetRef.current = false
        return
      }

      if (dragState.animationFrameId !== null) {
        cancelAnimationFrame(dragState.animationFrameId)
      }

      const rawDx = event.clientX - dragState.initialClientX
      const rawDy = event.clientY - dragState.initialClientY

      const { dx, dy } = getClampedDelta(
        dragState.initialRect,
        dragState.parentRect,
        rawDx,
        rawDy,
      )

      const previousOffset = currentOffsetRef.current
      const nextOffset: FreeOffset = isVertical
        ? { x: 0, y: previousOffset.y + dy }
        : { x: previousOffset.x + dx, y: 0 }

      const nextOffsets: FreeOffsets = {
        ...freeOffsetsRef.current,
        [widgetPosition as WidgetPosition]: nextOffset,
      }

      currentOffsetRef.current = nextOffset
      freeOffsetsRef.current = nextOffsets

      element.style.transform = `translate3d(${nextOffset.x}px, ${nextOffset.y}px, 0)`
      element.style.transition = ''
      element.classList.remove('z-30', 'shadow-xl')

      dragStateRef.current = null
      isDraggingWidgetRef.current = false

      if (!element.matches(':hover')) {
        openAPI.modules.system.setIgnoreMouseEvents({
          body: { ignore: true, forward: true },
        })
      }

      setFreeOffsets(nextOffsets)

      window.localStorage.setItem(
        FREE_DRAG_STORAGE_KEY,
        JSON.stringify(nextOffsets),
      )
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return

      const target = event.target as HTMLElement
      if (
        target.closest(
          'button, input, select, [role="button"], [data-no-drag], a, textarea',
        )
      ) {
        return
      }

      activePointerId = event.pointerId
      dragHandle.setPointerCapture(activePointerId)

      const initialRect = element.getBoundingClientRect()
      const boundary = getDragBoundaryElement(element)
      const parentRect = boundary
        ? boundary.getBoundingClientRect()
        : ({
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
          } as DOMRect)

      dragStateRef.current = {
        initialRect,
        parentRect,
        initialClientX: event.clientX,
        initialClientY: event.clientY,
        animationFrameId: null,
      }

      isDraggingWidgetRef.current = true
      element.style.transition = 'none'
      element.classList.add('z-30', 'shadow-xl')

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', finishDrag)
      window.addEventListener('pointercancel', finishDrag)

      event.preventDefault()
    }

    dragHandle.addEventListener('pointerdown', onPointerDown)

    return () => {
      dragHandle.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)

      if (dragStateRef.current?.animationFrameId !== null) {
        cancelAnimationFrame(dragStateRef.current?.animationFrameId ?? -1)
      }
      dragStateRef.current = null
      isDraggingWidgetRef.current = false
    }
  }, [isVertical, widgetPosition])

  useEffect(() => {
    const element = cardRef.current
    if (!element) return

    let animationFrameId: number | null = null

    const clampCurrentOffsetToViewport = () => {
      animationFrameId = null

      if (isDraggingWidgetRef.current) return

      const rect = element.getBoundingClientRect()
      const boundary = getDragBoundaryElement(element)
      if (!boundary) return

      const pRect = boundary.getBoundingClientRect()
      const current = currentOffsetRef.current

      const baseLeft = rect.left - current.x
      const baseTop = rect.top - current.y

      const minX = pRect.left - baseLeft
      const maxX = pRect.right - (baseLeft + rect.width)
      const minY = pRect.top - baseTop
      const maxY = pRect.bottom - (baseTop + rect.height)

      const nextOffset: FreeOffset = {
        x: isVertical ? 0 : clamp(current.x, minX, maxX),
        y: isVertical ? clamp(current.y, minY, maxY) : 0,
      }

      if (nextOffset.x === current.x && nextOffset.y === current.y) {
        return
      }

      const nextOffsets: FreeOffsets = {
        ...freeOffsetsRef.current,
        [widgetPosition as WidgetPosition]: nextOffset,
      }

      currentOffsetRef.current = nextOffset
      freeOffsetsRef.current = nextOffsets

      setFreeOffsets(nextOffsets)

      window.localStorage.setItem(
        FREE_DRAG_STORAGE_KEY,
        JSON.stringify(nextOffsets),
      )
    }

    let timeoutId: ReturnType<typeof setTimeout>
    const scheduleClamp = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (animationFrameId !== null) return
        animationFrameId = requestAnimationFrame(clampCurrentOffsetToViewport)
      }, 150)
    }

    window.addEventListener('resize', scheduleClamp)
    const observer = new ResizeObserver(scheduleClamp)
    observer.observe(element)

    scheduleClamp()

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', scheduleClamp)
      observer.disconnect()

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isVertical, widgetPosition])

  const handleSelectTask = useCallback(
    async (task: SyncTaskRxDBDTO) => {
      setSelectedTask(task)
      setTaskId(task.id)
      const connId = task.connectionInstanceId || selectedConnectionId
      if (connId) {
        setSelectedConnectionId(connId)
      }

      if (activeEntry && db) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: activeEntry.connectionInstanceId,
              sourceId: activeEntry.sourceId,
            },
          })
          .exec()
        if (doc) {
          const updated = await doc.patch({
            task: { id: task.id },
            taskData: task,
            connectionInstanceId: connId,
            dataSourceId: task.dataSourceId || activeEntry.dataSourceId,
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updated.toMutableJSON()
          setActive(updatedJson)
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } else {
        openAPI.events?.emit?.('tracker:draft-sync', {
          taskId: task.id,
          selectedTask: task,
          selectedConnectionId: connId,
        })
      }
    },
    [activeEntry, db, selectedConnectionId, openAPI, setActive],
  )

  const handleTaskIdChange = useCallback(
    async (newTaskId: string) => {
      setTaskId(newTaskId)
      if (activeEntry && db) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: activeEntry.connectionInstanceId,
              sourceId: activeEntry.sourceId,
            },
          })
          .exec()
        if (doc) {
          const updated = await doc.patch({
            task: { id: newTaskId },
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updated.toMutableJSON()
          setActive(updatedJson)
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } else {
        openAPI.events?.emit?.('tracker:draft-sync', { taskId: newTaskId })
      }
    },
    [activeEntry, db, openAPI, setActive],
  )

  const handleDescriptionChange = useCallback(
    async (desc: string) => {
      setDescription(desc)
      if (activeEntry && db) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: activeEntry.connectionInstanceId,
              sourceId: activeEntry.sourceId,
            },
          })
          .exec()
        if (doc) {
          const updated = await doc.patch({
            comments: desc,
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updated.toMutableJSON()
          setActive(updatedJson)
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } else {
        openAPI.events?.emit?.('tracker:draft-sync', { description: desc })
      }
    },
    [activeEntry, db, openAPI, setActive],
  )

  const handleActivityChange = useCallback(
    async (actId: string) => {
      setSelectedActivity(actId)
      if (activeEntry && db) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: activeEntry.connectionInstanceId,
              sourceId: activeEntry.sourceId,
            },
          })
          .exec()
        if (doc) {
          const updated = await doc.patch({
            activity: { id: actId },
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updated.toMutableJSON()
          setActive(updatedJson)
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } else {
        openAPI.events?.emit?.('tracker:draft-sync', {
          selectedActivity: actId,
        })
      }
    },
    [activeEntry, db, openAPI, setActive],
  )

  const handleConnectionChange = useCallback(
    async (connId: string) => {
      setSelectedConnectionId(connId)
      if (activeEntry && db) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: activeEntry.connectionInstanceId,
              sourceId: activeEntry.sourceId,
            },
          })
          .exec()
        if (doc) {
          const updated = await doc.patch({
            connectionInstanceId: connId,
            updatedAt: new Date().toISOString(),
          })
          const updatedJson = updated.toMutableJSON()
          setActive(updatedJson)
          openAPI.events?.emit?.('time-entry:sync', updatedJson)
        }
      } else {
        openAPI.events?.emit?.('tracker:draft-sync', {
          selectedConnectionId: connId,
        })
      }
    },
    [activeEntry, db, openAPI, setActive],
  )

  useEffect(() => {
    if (!openAPI?.events?.on) return

    const unsub = openAPI.events.on<any>('tracker:draft-sync', (data) => {
      if (!data) return
      if (data.taskId !== undefined) setTaskId(data.taskId)
      if (data.selectedTask !== undefined) setSelectedTask(data.selectedTask)
      if (data.description !== undefined) setDescription(data.description)
      if (data.selectedActivity !== undefined)
        setSelectedActivity(data.selectedActivity)
      if (data.selectedConnectionId !== undefined)
        setSelectedConnectionId(data.selectedConnectionId)
    })

    return () => unsub?.()
  }, [openAPI])

  const handleStart = useCallback(async () => {
    if (!db) return
    setTimerError(null)
    if (activeEntry && activeEntry.timeStatus === 'paused') {
      await playCurrentTimeEntry(db)
      return
    }

    const mode = timerDirection === 'up' ? 'countup' : 'countdown'
    const connectionInstanceId =
      selectedTask?.connectionInstanceId ||
      selectedConnectionId ||
      'default-conn'
    const dataSourceId =
      selectedTask?.dataSourceId ||
      syncConnections.find((c) => c.connectionId === connectionInstanceId)
        ?.dataSourceId ||
      'default'

    await createNewTimeEntry(db, {
      taskId,
      activityId: selectedActivity,
      dataSourceId,
      connectionInstanceId,
      type: timerDirection === 'up' ? 'increasing' : 'decreasing',
      comments: description,
      mode,
      manualInitialSeconds,
    })
  }, [
    db,
    activeEntry,
    timerDirection,
    taskId,
    selectedTask,
    selectedActivity,
    description,
    manualInitialSeconds,
    playCurrentTimeEntry,
    createNewTimeEntry,
    selectedConnectionId,
    syncConnections,
  ])

  const handlePause = useCallback(async () => {
    if (!db) return
    await pauseCurrentTimeEntry(db)
  }, [db, pauseCurrentTimeEntry])

  const handleStop = useCallback(async () => {
    if (!db) return
    await stopCurrentTimeEntry(db)
    setManualInitialSeconds(0)
    setTaskId('')
    setSelectedTask(null)
    setDescription('')
    setIsEditingVertical(false)
  }, [db, stopCurrentTimeEntry])

  const handleDirectLog = useCallback(async () => {
    if (!db) return
    if (manualInitialSeconds <= 0) {
      setTimerError('Não é permitido apontamento zerado.')
      return
    }
    if (manualInitialSeconds + dbTodaySeconds > 86400) {
      setTimerError('O total de horas no dia não pode exceder 24h.')
      return
    }
    setTimerError(null)

    const connectionInstanceId =
      selectedTask?.connectionInstanceId ||
      selectedConnectionId ||
      'default-conn'
    const dataSourceId =
      selectedTask?.dataSourceId ||
      syncConnections.find((c) => c.connectionId === connectionInstanceId)
        ?.dataSourceId ||
      'default'

    await createNewTimeEntry(db, {
      taskId,
      activityId: selectedActivity,
      dataSourceId,
      connectionInstanceId,
      type: 'manual',
      comments: description,
      mode: timerDirection === 'up' ? 'countup' : 'countdown',
      manualInitialSeconds,
    })

    toast.success('Lançamento direto efetuado com sucesso!')
    setManualInitialSeconds(0)
    setTaskId('')
    setSelectedTask(null)
    setDescription('')
  }, [
    db,
    selectedTask,
    selectedConnectionId,
    syncConnections,
    createNewTimeEntry,
    taskId,
    selectedActivity,
    description,
    timerDirection,
    manualInitialSeconds,
    dbTodaySeconds,
  ])

  const addonBlocks = useAddonBlocks()

  const content = children || (
    <>
      <UltimateTimeTracker.Handle />
      <UltimateTimeTracker.Blocks>
        <UltimateTimeTracker.Block id="task">
          <UltimateTimeTracker.TaskBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="timer">
          <UltimateTimeTracker.TimerBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="today">
          <UltimateTimeTracker.TodayBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="actions">
          <UltimateTimeTracker.ActionsBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="tools">
          <UltimateTimeTracker.ToolsBlock />
        </UltimateTimeTracker.Block>

        {addonBlocks}
      </UltimateTimeTracker.Blocks>
      <UltimateTimeTracker.InlineInput />
      <UltimateTimeTracker.Expander />
    </>
  )

  const contextValue: UltimateTimeTrackerContextType = {
    isVertical,
    widgetPosition,
    isExpanded,
    setIsExpanded,
    widgetHandleRef,
    taskId,
    setTaskId: handleTaskIdChange as any,
    selectedTask,
    setSelectedTask,
    isTaskLookupOpen,
    setIsTaskLookupOpen,
    activities,
    handleSelectTask,
    description,
    setDescription: handleDescriptionChange as any,
    selectedActivity,
    setSelectedActivity: handleActivityChange as any,
    manualInitialSeconds,
    setManualInitialSeconds,
    isEditingVertical,
    setIsEditingVertical,
    timerDirection,
    isRunning,
    isIdle,
    handleStart,
    handlePause,
    handleStop,
    handleDirectLog,
    selectedConnectionId,
    setSelectedConnectionId: handleConnectionChange as any,
    syncConnections,
    dbTodaySeconds,
    timerError,
    setTimerError,
  }

  return (
    <UltimateTimeTrackerContext.Provider value={contextValue}>
      <Card
        ref={cardRef}
        data-widget-card="true"
        data-orientation={isVertical ? 'vertical' : 'horizontal'}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className={cn(
          'group border-border/60 bg-card pointer-events-auto relative inline-flex w-fit items-center rounded-lg border shadow-md transition-transform duration-150 ease-out select-none',
          isVertical ? 'h-fit w-16 flex-col items-center gap-1' : ' ',
        )}
      >
        <CardContent
          className={cn(
            'flex w-full transition-all',
            isVertical
              ? 'h-full min-h-0 [scrollbar-width:none] flex-col items-center justify-start gap-3 overflow-x-hidden overflow-y-auto px-0 pt-2 pb-8 [&::-webkit-scrollbar]:hidden'
              : 'flex-row items-center gap-2 py-2 pl-1',
          )}
        >
          {content}
        </CardContent>
      </Card>
      <TaskLookup
        open={isTaskLookupOpen}
        onOpenChange={setIsTaskLookupOpen}
        onSelect={handleSelectTask}
      />
    </UltimateTimeTrackerContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// 3. COMPOUND COMPONENTS (Módulos que compõem o Tracker)
// ---------------------------------------------------------------------------

UltimateTimeTracker.Handle = function TrackerHandle() {
  const { isVertical, widgetHandleRef } = useTrackerContext()

  return (
    <div
      ref={widgetHandleRef}
      className={cn(
        'text-muted-foreground/30 hover:text-muted-foreground global-drag-handle flex shrink-0 cursor-grab touch-none items-center justify-center transition-colors select-none active:cursor-grabbing',
        isVertical ? 'w-full py-1.5' : 'h-full px-2',
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      title="Arraste para mover"
    >
      {isVertical ? (
        <GripHorizontal className="h-4 w-4" />
      ) : (
        <GripVertical className="h-4 w-4" />
      )}
    </div>
  )
}

function DragHandle({ isVertical, listeners, attributes }: any) {
  return (
    <div
      {...listeners}
      {...attributes}
      data-no-drag
      className={cn(
        'group/handle hover:text-primary flex cursor-grab items-center justify-center transition-colors active:cursor-grabbing',
        isVertical ? 'w-full py-1' : 'h-full px-0.5',
      )}
    >
      <div
        className={cn(
          'bg-border/80 group-hover/handle:bg-primary rounded-full transition-colors',
          isVertical ? 'h-[2px] w-4' : 'h-4 w-[2px]',
        )}
      />
    </div>
  )
}

function SortableItem({
  id,
  isVertical,
  children,
}: {
  id: string
  isVertical: boolean
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  } as React.CSSProperties

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/block relative flex shrink-0 items-center justify-center select-none',
        isVertical ? 'w-full flex-col gap-0.5' : 'h-full flex-row gap-1',
      )}
    >
      <DragHandle
        listeners={listeners}
        attributes={attributes}
        isVertical={isVertical}
      />
      {children}
    </div>
  )
}

interface TrackerBlockProps {
  id: string
  isHidden?: boolean
  children?: React.ReactNode
}

UltimateTimeTracker.Blocks = function TrackerBlocks({
  children,
}: {
  children: React.ReactNode
}) {
  const { isVertical, isExpanded } = useTrackerContext()
  const { hiddenBlocks } = useTimerSettings()

  const childrenArray = React.Children.toArray(children)

  const isTrackerBlock = (
    child: React.ReactNode,
  ): child is React.ReactElement<TrackerBlockProps> => {
    return (
      React.isValidElement<TrackerBlockProps>(child) &&
      child.props !== null &&
      typeof child.props === 'object' &&
      'id' in child.props
    )
  }

  const blockChildren = childrenArray.filter(isTrackerBlock)
  const childIds = blockChildren.map((c) => c.props.id)

  const [blocksOrder, setBlocksOrder] = useState<string[]>(() => {
    let saved: string[] = []
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) saved = JSON.parse(raw)
    } catch {}

    const savedValid = saved.filter((id) => childIds.includes(id))
    const missing = childIds.filter((id) => !savedValid.includes(id))
    return [...savedValid, ...missing]
  })

  useEffect(() => {
    setBlocksOrder((prev) => {
      const valid = prev.filter((id) => childIds.includes(id))
      const missing = childIds.filter((id) => !valid.includes(id))
      if (missing.length === 0 && valid.length === prev.length) return prev
      return [...valid, ...missing]
    })
  }, [childIds.join(',')])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocksOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const newOrder = arrayMove(items, oldIndex, newIndex)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder))
        }
        return newOrder
      })
    }
  }

  const visibleChildIds = blockChildren
    .filter((c) => !c.props.isHidden)
    .map((c) => c.props.id)

  let visibleBlocks = blocksOrder.filter((id) => visibleChildIds.includes(id))
  if (!isExpanded) {
    visibleBlocks = visibleBlocks.filter((id) => !hiddenBlocks.includes(id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[
        restrictToParentElement,
        isVertical ? restrictToVerticalAxis : restrictToHorizontalAxis,
      ]}
    >
      <SortableContext
        items={visibleBlocks}
        strategy={
          isVertical
            ? verticalListSortingStrategy
            : horizontalListSortingStrategy
        }
      >
        {visibleBlocks.map((id) => {
          const child = blockChildren.find((c) => c.props.id === id)
          return child || null
        })}
      </SortableContext>
    </DndContext>
  )
}

UltimateTimeTracker.Block = function TrackerBlock({
  id,
  isHidden,
  children,
}: TrackerBlockProps) {
  const { isVertical } = useTrackerContext()
  if (isHidden) return null

  return (
    <SortableItem id={id} isVertical={isVertical}>
      {children}
    </SortableItem>
  )
}

UltimateTimeTracker.Expander = function Expander() {
  const { isVertical, isExpanded, setIsExpanded } = useTrackerContext()
  const { hiddenBlocks } = useTimerSettings()

  if (hiddenBlocks.length === 0) return null

  return (
    <div
      data-no-drag
      onClick={() => setIsExpanded(!isExpanded)}
      className={cn(
        'bg-muted/40 hover:bg-muted/80 text-muted-foreground hover:text-foreground z-10 flex shrink-0 cursor-pointer items-center justify-center pt-1 transition-all active:scale-95',
        isVertical
          ? 'absolute bottom-0 left-0 h-5 w-full rounded-b-md'
          : 'absolute top-0 right-0 h-full w-5 rounded-r-md',
      )}
      title={isExpanded ? 'Recolher itens' : 'Expandir itens'}
    >
      {isVertical ? (
        isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )
      ) : isExpanded ? (
        <ChevronLeft className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </div>
  )
}
UltimateTimeTracker.InlineInput = function TrackerInlineInput() {
  return null
}

// ---------------------------------------------------------------------------
// 4. BLOCOS DE UI INTERNOS (Consumindo Context)
// ---------------------------------------------------------------------------

UltimateTimeTracker.TaskBlock = function TaskBlock() {
  const {
    isVertical,
    taskId,
    setTaskId,
    selectedTask,
    selectedActivity,
    setSelectedActivity,
    isEditingVertical,
    setIsEditingVertical,
    description,
    setDescription,
    widgetPosition,
    setIsTaskLookupOpen,
    activities,
    selectedConnectionId,
    setSelectedConnectionId,
    syncConnections,
  } = useTrackerContext()

  const selectedAct =
    activities.find((a) => a.id === selectedActivity) ||
    activities[0] ||
    mockActivities[0]
  const ActivityIcon = selectedAct.icon

  const [committedTaskId, setCommittedTaskId] = React.useState(taskId)
  const [committedTask, setCommittedTask] = React.useState(selectedTask)

  React.useEffect(() => {
    setCommittedTaskId(taskId)
    setCommittedTask(selectedTask)
  }, [selectedTask])

  React.useEffect(() => {
    if (!isEditingVertical) {
      setCommittedTaskId(taskId)
      setCommittedTask(selectedTask)
    }
  }, [isEditingVertical, taskId, selectedTask])

  const handleBlurInput = useCallback(() => {
    setCommittedTaskId(taskId)
    setCommittedTask(selectedTask)
  }, [taskId, selectedTask])

  const formattedLabel = React.useMemo(() => {
    if (!committedTaskId) return null
    const formattedId = /^\d+$/.test(committedTaskId)
      ? `#${committedTaskId}`
      : committedTaskId
    return {
      short: formattedId,
      full: committedTask?.title
        ? `${formattedId} - ${committedTask.title}`
        : formattedId,
    }
  }, [committedTaskId, committedTask])

  const popoverSide = isVertical
    ? widgetPosition === 'left'
      ? 'right'
      : 'left'
    : widgetPosition === 'bottom'
      ? 'top'
      : 'bottom'

  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center gap-0.5"
      data-no-drag
    >
      <TaskPopover
        open={isEditingVertical}
        onOpenChange={setIsEditingVertical}
        side={popoverSide}
        sideOffset={12}
        trigger={
          <div className="relative cursor-pointer">
            <Button
              variant={isEditingVertical ? 'secondary' : 'ghost'}
              size="icon"
              className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 rounded-full transition-colors"
              title={formattedLabel?.full || 'Detalhes da Tarefa'}
            >
              {isEditingVertical ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <MessageSquareDiff className="h-3.5 w-3.5" />
              )}
            </Button>
            {(() => {
              const conn = syncConnections.find(
                (c: any) => c.connectionId === selectedConnectionId,
              )
              if (conn?.addon?.logo) {
                return (
                  <div className="bg-background border-border/50 pointer-events-none absolute -top-0.5 -right-0.5 rounded-full border p-[2px] shadow-sm">
                    <img
                      src={conn.addon.logo}
                      className="h-2 w-2 object-contain"
                      alt=""
                    />
                  </div>
                )
              }
              return null
            })()}
          </div>
        }
      />

      {formattedLabel && (
        <span
          onClick={() => setIsEditingVertical(true)}
          title={formattedLabel.full}
          className="text-primary/90 hover:text-primary max-w-[64px] cursor-pointer truncate text-center font-mono text-[10px] leading-none font-semibold tracking-tight transition-colors"
        >
          {formattedLabel.short}
        </span>
      )}
    </div>
  )
}

UltimateTimeTracker.TimerBlock = function TimerBlock() {
  const {
    isVertical,
    timerDirection,
    manualInitialSeconds,
    setManualInitialSeconds,
    dbTodaySeconds,
    timerError,
    setTimerError,
  } = useTrackerContext()
  const activeEntry = useTimeEntryStore((s) => s.active)
  const liveActiveSeconds = useActiveTimer()

  const hasError = Boolean(timerError)

  return (
    <div
      data-no-drag
      className={cn(
        'flex shrink-0 items-center justify-center',
        isVertical ? 'w-full flex-col' : 'flex-row',
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center',
          isVertical
            ? 'w-full flex-col items-center justify-center text-center opacity-90'
            : 'flex-row items-center gap-1.5',
        )}
      >
        <TimerDisplay
          orientation={isVertical ? 'vertical' : 'horizontal'}
          editable
          mode={timerDirection === 'up' ? 'countup' : 'countdown'}
          initialValue={manualInitialSeconds}
          onInitialSecondsChange={(secs) => {
            setManualInitialSeconds(secs)
            if (secs > 0) setTimerError(null)
          }}
          onError={setTimerError}
          hasError={hasError}
          status={activeEntry?.timeStatus}
          seconds={
            activeEntry?.timeStatus === 'paused'
              ? timerDirection === 'up'
                ? liveActiveSeconds
                : manualInitialSeconds - liveActiveSeconds
              : undefined
          }
          min={1}
          max={Math.max(0, 86400 - dbTodaySeconds)}
        />

        {timerError && (
          <TooltipProvider>
            <Tooltip defaultOpen open>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'text-destructive hover:text-destructive/80 animate-in fade-in zoom-in flex cursor-pointer items-center justify-center rounded-full transition-all duration-200',
                    isVertical ? 'mt-1' : 'ml-1',
                  )}
                  onClick={() => setTimerError(null)}
                  title="Clique para fechar aviso"
                >
                  <AlertCircle className="text-destructive h-4 w-4 animate-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side={isVertical ? 'right' : 'bottom'}
                sideOffset={6}
                className="bg-destructive text-destructive-foreground border-destructive/40 animate-in fade-in zoom-in-95 z-50 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium shadow-xl select-none"
              >
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>{timerError}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

UltimateTimeTracker.TodayBlock = function TodayBlock() {
  const { isVertical, dbTodaySeconds } = useTrackerContext()
  const activeEntry = useTimeEntryStore((s) => s.active)
  const liveActiveSeconds = useActiveTimer()

  const totalTodaySeconds =
    dbTodaySeconds + (activeEntry ? liveActiveSeconds : 0)

  const formatTodayTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600)
    const m = Math.floor((totalSecs % 3600) / 60)
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`
  }

  return (
    <div
      data-no-drag
      className={cn(
        'flex shrink-0 items-center justify-center',
        isVertical ? 'flex-col gap-0.5' : 'gap-1',
      )}
    >
      <span
        className={cn(
          'text-muted-foreground text-[10px] font-bold tracking-wider uppercase',
          isVertical && 'opacity-70',
        )}
      >
        Hoje{isVertical ? '' : ':'}
      </span>
      <span className="text-muted-foreground font-mono text-[11px] tracking-tight tabular-nums">
        {formatTodayTime(totalTodaySeconds)}
      </span>
    </div>
  )
}

UltimateTimeTracker.ActionsBlock = function ActionsBlock() {
  const {
    isVertical,
    isIdle,
    isRunning,
    handleStart,
    handlePause,
    handleStop,
    handleDirectLog,
  } = useTrackerContext()
  const { logOption } = useTimerSettings()

  return (
    <div
      data-no-drag
      className={cn(
        'flex shrink-0 items-center justify-center',
        isVertical ? 'flex-col gap-1.5' : 'gap-1.5',
      )}
    >
      {isIdle ? (
        logOption === 'none' ? (
          <Button
            variant="default"
            className="h-10 w-10 shrink-0 rounded-lg p-0 shadow-md transition-transform active:scale-95"
            onClick={handleStart}
            title="Iniciar cronômetro ao vivo"
          >
            <Play className="h-4 w-4 fill-current" />
          </Button>
        ) : logOption === 'manual' ? (
          <div className="flex h-10 w-[42px] shrink-0 items-center justify-center gap-[1px]">
            <Button
              variant="default"
              className="h-10 w-[31px] shrink-0 rounded-l-lg rounded-r-none p-0 shadow-md transition-transform active:scale-95"
              onClick={handleStart}
              title="Iniciar cronômetro ao vivo"
            >
              <Play className="ml-[6px] h-4 w-4 fill-current" />
            </Button>
            <Button
              variant="default"
              style={{ padding: '5px' }}
              className="bg-primary/90 hover:bg-primary/80 flex h-10 w-[10px] shrink-0 items-center justify-center rounded-l-none rounded-r-lg opacity-90 shadow-md transition-transform hover:opacity-100 active:scale-95"
              onClick={handleDirectLog}
              title="Apontamento Manual"
            >
              <ChevronRight
                style={{ width: '12px' }}
                className="h-[7px] w-[7px] stroke-[2.5] opacity-50"
              />
            </Button>
          </div>
        ) : (
          <div className="flex h-10 w-[42px] shrink-0 items-center justify-center gap-[1px]">
            <Button
              variant="default"
              className="h-10 w-[31px] shrink-0 rounded-l-lg rounded-r-none p-0 shadow-md transition-transform active:scale-95"
              onClick={handleStart}
              title="Iniciar cronômetro ao vivo"
            >
              <Play className="ml-[6px] h-4 w-4 fill-current" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="default"
                  style={{ padding: '5px' }}
                  className="bg-primary/90 hover:bg-primary/80 flex h-10 w-[10px] shrink-0 items-center justify-center rounded-l-none rounded-r-lg opacity-90 shadow-md transition-transform hover:opacity-100 active:scale-95"
                >
                  <ChevronRight
                    style={{ width: '12px' }}
                    className="h-[7px] w-[7px] stroke-[2.5] opacity-50"
                  />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                side={isVertical ? 'right' : 'bottom'}
                align="end"
                className="flex w-48 flex-col gap-0.5 p-1"
              >
                <Button
                  variant="ghost"
                  className="h-8 justify-start text-xs"
                  onClick={handleStart}
                >
                  <LucideIcons.Hourglass className="mr-2 h-3.5 w-3.5 opacity-70" />
                  Iniciar Timer
                </Button>

                <Button
                  variant="ghost"
                  className="h-8 justify-start text-xs"
                  onClick={handleDirectLog}
                >
                  <LucideIcons.List className="mr-2 h-3.5 w-3.5 opacity-70" />
                  Apontamento Manual
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )
      ) : (
        <div
          className={cn('flex items-center gap-1.5', isVertical && 'flex-col')}
        >
          <Button
            variant={isRunning ? 'outline' : 'default'}
            className="h-10 w-10 shrink-0 rounded-lg p-0 shadow-sm transition-transform active:scale-95"
            onClick={isRunning ? handlePause : handleStart}
          >
            {isRunning ? (
              <Pause className="text-primary h-4 w-4 fill-current" />
            ) : (
              <Play
                className={cn(
                  'ml-0.5 h-4 w-4 fill-current',
                  isVertical ? 'text-primary-foreground' : 'text-primary',
                )}
              />
            )}
          </Button>
          <Button
            variant="destructive"
            className={cn(
              'shrink-0 transition-transform active:scale-95',
              isVertical
                ? 'h-7 w-7 rounded-lg p-0 opacity-90 hover:opacity-100'
                : 'h-10 w-10 rounded-lg p-0',
            )}
            onClick={handleStop}
          >
            <Square
              className={cn(
                'fill-current',
                isVertical ? 'h-3 w-3' : 'h-3.5 w-3.5',
              )}
            />
          </Button>
        </div>
      )}
    </div>
  )
}

function renderAddonIcon(
  icon?: string,
  fallbackIcon: React.ElementType = LucideIcons.Puzzle,
) {
  if (!icon) {
    const Fallback = fallbackIcon
    return <Fallback className="h-3.5 w-3.5 shrink-0" />
  }

  if (
    icon.startsWith('data:image/') ||
    icon.startsWith('http://') ||
    icon.startsWith('https://') ||
    icon.startsWith('mr-tick-app://')
  ) {
    return (
      <img
        src={icon}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
      />
    )
  }

  const iconRecord = LucideIcons as unknown as Record<string, React.ElementType>
  if (iconRecord[icon]) {
    const LucideComp = iconRecord[icon]
    return <LucideComp className="h-3.5 w-3.5 shrink-0" />
  }

  const Fallback = fallbackIcon
  return <Fallback className="h-3.5 w-3.5 shrink-0" />
}

function SystemAddonsButton({ isVertical }: { isVertical: boolean }) {
  const api = useOpenAPI()
  const [timerbarMenus, setTimerbarMenus] = useState<AddonTimerbarMenuItem[]>(
    [],
  )

  useEffect(() => {
    let isMounted = true

    async function loadTimerbarMenus() {
      try {
        const response = await api.integrations.addons.getTimerbarMenus()
        if (!isMounted) return
        if (!response?.isSuccess || !Array.isArray(response.data)) return
        setTimerbarMenus(response.data)
      } catch (err) {
        console.error('Erro ao carregar menus dos addons no sistema:', err)
      }
    }

    loadTimerbarMenus()

    const unsub = api.events?.on('addons:toast', (toastData: any) => {
      console.log('🔔 [UI] Toasts event received in renderer:', toastData)
      if (!toastData) return

      if (toastData.action === 'dismiss' && toastData.toastId) {
        toast.dismiss(toastData.toastId)
        return
      }
      const type = toastData.type ?? 'info'
      if (type === 'loading') {
        toast.loading(toastData.message, {
          id: toastData.toastId,
          description: toastData.title,
        })
      } else if (type === 'success') {
        toast.success(toastData.message, {
          id: toastData.toastId,
          description: toastData.title,
        })
      } else if (type === 'error') {
        toast.error(toastData.message, {
          id: toastData.toastId,
          description: toastData.title,
        })
      } else if (type === 'warning') {
        toast.warning(toastData.message, {
          id: toastData.toastId,
          description: toastData.title,
        })
      } else {
        toast.info(toastData.message, {
          id: toastData.toastId,
          description: toastData.title,
        })
      }
    })

    return () => {
      isMounted = false
      unsub?.()
    }
  }, [api])

  const handleCommandExecute = async (commandId: string, label: string) => {
    try {
      const res = await api.integrations.addons.executeCommand({
        body: { commandId },
      })
      if (!res?.isSuccess) {
        toast.error(`[Addon] Erro ao executar ${label}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`[Addon] Erro ao executar ${label}: ${message}`)
    }
  }

  return (
    <Popover>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md p-0"
                title="Addons do Sistema"
              >
                <LucideIcons.Puzzle className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side={isVertical ? 'right' : 'bottom'}>
            <p>Addons (Extensões do Sistema)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        side={isVertical ? 'right' : 'bottom'}
        align="end"
        className="flex w-64 flex-col gap-1 p-1.5"
      >
        <div className="text-muted-foreground border-border/50 mb-0.5 flex items-center gap-1.5 border-b px-2 py-1 pb-1.5 text-xs font-semibold">
          <LucideIcons.Puzzle className="text-primary h-3.5 w-3.5 shrink-0" />
          <span>Addons Ativos</span>
        </div>

        {timerbarMenus.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-center text-xs">
            Nenhum addon ativo no momento.
          </div>
        ) : (
          timerbarMenus.map((menu) => {
            if (menu.type === 'action') {
              return (
                <Button
                  key={menu.id}
                  variant="ghost"
                  className="flex h-8 w-full items-center justify-between px-2 text-xs font-normal"
                  onClick={() =>
                    handleCommandExecute(menu.id, menu.label ?? menu.id)
                  }
                >
                  <div className="mr-2 flex min-w-0 flex-1 items-center gap-2">
                    {renderAddonIcon(menu.icon)}
                    <span className="truncate">{menu.label ?? menu.id}</span>
                  </div>
                </Button>
              )
            }

            return (
              <div key={menu.id} className="flex flex-col gap-0.5">
                <div className="text-muted-foreground flex items-center gap-2 px-2 pt-1 pb-0.5 text-[11px] font-medium">
                  {renderAddonIcon(menu.icon)}
                  <span className="truncate">{menu.tooltip ?? menu.id}</span>
                </div>
                {menu.items?.map((sub: AddonTimerbarPopoverSubItem) => (
                  <Button
                    key={sub.id}
                    variant="ghost"
                    className="flex h-8 w-full items-center justify-between px-2 pl-4 text-xs font-normal"
                    onClick={() => handleCommandExecute(sub.id, sub.label)}
                  >
                    <div className="mr-2 flex min-w-0 flex-1 items-center gap-2">
                      {renderAddonIcon(sub.icon)}
                      <span className="truncate">{sub.label}</span>
                    </div>
                    {sub.shortcut && (
                      <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                        {sub.shortcut}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}

function AddonSingleTool({ menu }: { menu: AddonTimerbarMenuItem }) {
  const { isVertical } = useTrackerContext()
  const api = useOpenAPI()

  const handleCommandExecute = async (commandId: string, label: string) => {
    try {
      const res = await api.integrations.addons.executeCommand({
        body: { commandId },
      })
      if (!res?.isSuccess) {
        toast.error(`[Addon] Erro ao executar ${label}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`[Addon] Erro ao executar ${label}: ${message}`)
    }
  }

  if (menu.type === 'action') {
    return (
      <TooltipProvider key={menu.id} delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md p-0"
              onClick={() =>
                handleCommandExecute(menu.id, menu.label ?? menu.id)
              }
            >
              {renderAddonIcon(menu.icon)}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={isVertical ? 'right' : 'bottom'}>
            <p>{menu.tooltip ?? menu.label ?? menu.id}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (menu.type === 'popover') {
    return (
      <Popover key={menu.id}>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md p-0"
                >
                  {renderAddonIcon(menu.icon)}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side={isVertical ? 'right' : 'bottom'}>
              <p>{menu.tooltip ?? 'Opções do Addon'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent
          side={isVertical ? 'right' : 'bottom'}
          align="end"
          className="flex w-64 flex-col gap-0.5 p-1"
        >
          {menu.items?.map((sub: AddonTimerbarPopoverSubItem) => {
            return (
              <Button
                key={sub.id}
                variant="ghost"
                title={
                  sub.description
                    ? `${sub.label} - ${sub.description}`
                    : sub.label
                }
                className="flex h-8 w-full items-center justify-between px-2 text-xs font-normal"
                onClick={() => handleCommandExecute(sub.id, sub.label)}
              >
                <div className="mr-2 flex min-w-0 flex-1 items-center gap-2">
                  {renderAddonIcon(sub.icon)}
                  <span className="truncate" title={sub.label}>
                    {sub.label}
                  </span>
                </div>
                {sub.shortcut && (
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                    {sub.shortcut}
                  </span>
                )}
              </Button>
            )
          })}
        </PopoverContent>
      </Popover>
    )
  }

  return null
}

export function useAddonBlocks() {
  const api = useOpenAPI()
  const { enabledAddonIds } = useTimerSettings()
  const [timerbarMenus, setTimerbarMenus] = useState<AddonTimerbarMenuItem[]>(
    [],
  )

  useEffect(() => {
    let isMounted = true

    async function loadTimerbarMenus() {
      try {
        const response = await api.integrations.addons.getTimerbarMenus()
        if (!isMounted) return
        if (!response?.isSuccess || !Array.isArray(response.data)) return
        setTimerbarMenus(response.data)
      } catch (err) {
        console.error('Erro ao carregar menus da timerbar:', err)
      }
    }

    loadTimerbarMenus()
    return () => {
      isMounted = false
    }
  }, [api])

  const visibleMenus = timerbarMenus.filter((menu) =>
    (enabledAddonIds ?? []).includes(menu.id),
  )

  if (visibleMenus.length === 0) return []

  return visibleMenus.map((menu) => (
    <UltimateTimeTracker.Block key={menu.id} id={menu.id}>
      <AddonSingleTool menu={menu} />
    </UltimateTimeTracker.Block>
  ))
}

UltimateTimeTracker.ToolsBlock = function ToolsBlock() {
  const { isVertical } = useTrackerContext()
  return (
    <div
      data-no-drag
      className={cn(
        'flex shrink-0 items-center',
        isVertical ? 'flex-col gap-2.5' : 'gap-2.5',
      )}
    >
      {isVertical && <Separator className="w-8 opacity-50" />}

      <div
        role="group"
        aria-label="Configurações do timer"
        className={cn(
          'bg-muted/40 flex items-center gap-1 rounded-lg p-1',
          isVertical ? 'flex-col' : 'flex-row',
        )}
      >
        <TimerHistory />
        <TimerSettings />
        <SystemAddonsButton isVertical={isVertical} />
      </div>
    </div>
  )
}
