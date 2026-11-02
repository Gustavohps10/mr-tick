'use client'

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertCircle,
  Circle,
  Clock,
  FilterX,
  FolderKanban,
  Hash,
  Layers,
  Loader2,
  Search,
  User,
  X,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import React, {
  ElementType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { MangoQuerySelector } from 'rxdb'
import { useDebounce } from 'use-debounce'

import { getTaskConnectionOption } from '@/components/task-connection-select'
import { TaskLookupTaskDetails } from '@/components/task-lookup-results'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import {
  resolveEntityMapping,
  useFieldMappings,
} from '@/hooks/use-field-mappings'
import { fetchAndPersistTasks } from '@/lib/tasks-enrichment'
import { cn } from '@/lib/utils'
import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import {
  cleanTaskId,
  extractPureTaskId,
} from '@/pages/time-entries/lib/time-entries-utils'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'

interface TaskLookupModalProps {
  trigger?: React.ReactNode
  onSelect: (task: SyncTaskRxDBDTO) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  currentUserId?: string | null
  memberIdsByConnection?: Record<string, string | null | undefined>
}

const PAGE_SIZE = 50
const ROW_HEIGHT = 64

const lucideCatalog: Record<string, ElementType> = LucideIcons.icons

const DynamicIcon = ({
  name,
  color,
  className,
}: {
  name?: string
  color?: string
  className?: string
}) => {
  if (!name || name === 'none' || name.trim() === '') return null
  const Icon = lucideCatalog[name]
  if (!Icon) return null
  return <Icon className={className} style={{ color }} />
}

export function TaskLookup({
  trigger,
  onSelect,
  open,
  onOpenChange,
  currentUserId = 'me',
  memberIdsByConnection: propMemberIdsByConnection,
}: TaskLookupModalProps) {
  const { mappings } = useFieldMappings()
  const db = useSyncStore((s) => s.db)
  const syncConnections = useConnectionsWithSync()
  const { workspace } = useWorkspace()
  const { dataSourceConnections: dsConnections } = useDataSourceConnections()

  const memberIdsByConnection = useMemo(() => {
    if (propMemberIdsByConnection) return propMemberIdsByConnection
    const map: Record<string, string | null | undefined> = {}

    syncConnections.forEach((conn) => {
      if (conn.member?.id) {
        map[conn.connectionId] = String(conn.member.id)
      }
    })

    workspace?.connections?.forEach((conn) => {
      if (conn.member?.id && !map[conn.id]) {
        map[conn.id] = String(conn.member.id)
      }
    })

    dsConnections.forEach((conn) => {
      if (conn.member?.id && !map[conn.connectionId]) {
        map[conn.connectionId] = String(conn.member.id)
      }
    })

    return map
  }, [
    propMemberIdsByConnection,
    syncConnections,
    workspace?.connections,
    dsConnections,
  ])

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch] = useDebounce(searchTerm, 300)

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [onlyMyTasks, setOnlyMyTasks] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  const availableConnections = useMemo(
    () =>
      dsConnections.map((connection) => ({
        ...getTaskConnectionOption({
          id: connection.connectionId,
          addon: connection.addon,
          identityName: connection.identity?.displayName,
          memberName: connection.member?.name,
        }),
        dataSourceId: connection.dataSourceId,
      })),
    [dsConnections],
  )

  // Lista de IDs de instâncias (connections) selecionadas
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>(
    [],
  )

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [internalOpen, setInternalOpen] = useState(false)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )

  const isModalOpen = open ?? internalOpen
  const setIsModalOpen = onOpenChange ?? setInternalOpen

  const { data: metadataDocs } = useQuery({
    queryKey: ['sync-metadata-all', db?.name],
    queryFn: async () => {
      if (!db) return []
      const docs = await db.metadata.find().exec()
      return docs.map((d) => d.toMutableJSON())
    },
    enabled: Boolean(isModalOpen && db),
  })

  const metaLookup = useMemo(() => {
    const statuses = new Map<string, SyncMetadataItem>()
    const priorities = new Map<string, SyncMetadataItem>()
    const roles = new Map<string, SyncMetadataItem>()

    metadataDocs?.forEach((doc) => {
      doc.taskStatuses?.forEach((s) => statuses.set(s.id, s))
      doc.taskPriorities?.forEach((p) => priorities.set(p.id, p))
      doc.participantRoles?.forEach((r) => roles.set(r.id, r))
    })

    return { statuses, priorities, roles }
  }, [metadataDocs])

  const effectiveConnectionIds = useMemo(() => {
    if (selectedConnectionIds.length > 0) {
      return selectedConnectionIds
    }
    return availableConnections.map((s) => s.id)
  }, [selectedConnectionIds, availableConnections])

  const singleSelectedConnection = useMemo(() => {
    if (selectedConnectionIds.length === 1) {
      return availableConnections.find(
        (conn) => conn.id === selectedConnectionIds[0],
      )
    }
    if (availableConnections.length === 1) {
      return availableConnections[0]
    }
    return undefined
  }, [selectedConnectionIds, availableConnections])

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: [
        'task-lookup',
        db?.name,
        debouncedSearch,
        statusFilter,
        priorityFilter,
        onlyMyTasks,
        sortOrder,
        effectiveConnectionIds.join(','),
      ],
      initialPageParam: 0,
      queryFn: async ({ pageParam = 0 }) => {
        if (!db) return []

        const andConditions: MangoQuerySelector<SyncTaskRxDBDTO>[] = [
          { _deleted: { $ne: true } },
        ]

        if (debouncedSearch) {
          andConditions.push({
            $or: [
              { title: { $regex: `.*${debouncedSearch}.*`, $options: 'i' } },
              { id: { $regex: `.*${debouncedSearch}.*`, $options: 'i' } },
            ],
          })
        }

        if (statusFilter !== 'all')
          andConditions.push({ 'status.id': statusFilter })
        if (priorityFilter !== 'all')
          andConditions.push({ 'priority.id': priorityFilter })

        if (effectiveConnectionIds.length > 0) {
          if (onlyMyTasks) {
            const myTasksOr = effectiveConnectionIds
              .map((connId) => {
                const memberId =
                  memberIdsByConnection?.[connId] ??
                  (currentUserId && currentUserId !== 'me'
                    ? currentUserId
                    : null)
                if (!memberId) return null
                return {
                  connectionInstanceId: connId,
                  $or: [
                    { participants: { $elemMatch: { id: String(memberId) } } },
                    { 'assignedTo.id': String(memberId) },
                  ],
                }
              })
              .filter((item) => item !== null)

            if (myTasksOr.length > 0) {
              andConditions.push({ $or: myTasksOr })
            } else {
              andConditions.push({
                connectionInstanceId: { $in: effectiveConnectionIds },
              })
            }
          } else {
            andConditions.push({
              connectionInstanceId: { $in: effectiveConnectionIds },
            })
          }
        }

        const selector: MangoQuerySelector<SyncTaskRxDBDTO> =
          andConditions.length > 0 ? { $and: andConditions } : {}

        const docs = await db.tasks
          .find({
            selector,
            limit: PAGE_SIZE,
            skip: pageParam * PAGE_SIZE,
            sort: [{ updatedAt: sortOrder }],
          })
          .exec()

        return docs.map((d) => d.toMutableJSON())
      },
      getNextPageParam: (lastPage, allPages) => {
        return lastPage.length === PAGE_SIZE ? allPages.length : undefined
      },
      enabled: isModalOpen && !!db,
    })

  const allTasks = useMemo(() => data?.pages.flat() ?? [], [data])

  const hostBridge = useHostBridge()
  const searchedTermsRef = useRef<Set<string>>(new Set())
  const [isSearchingRemote, setIsSearchingRemote] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isModalOpen || !db || !workspace?.id || !debouncedSearch.trim()) {
      return
    }

    const queryStr = debouncedSearch.trim()
    const pureId = extractPureTaskId(queryStr)
    const isPureNumeric = /^\d+$/.test(pureId)

    const targetConnections =
      effectiveConnectionIds.length > 0
        ? availableConnections.filter((c) =>
            effectiveConnectionIds.includes(c.id),
          )
        : availableConnections

    if (targetConnections.length === 0) return

    let needsRemoteSearch = false
    for (const conn of targetConnections) {
      const searchKey = `${conn.id}::${queryStr}`
      if (!searchedTermsRef.current.has(searchKey)) {
        needsRemoteSearch = true
        searchedTermsRef.current.add(searchKey)
      }
    }

    if (!needsRemoteSearch) return

    let isSubscribed = true
    setIsSearchingRemote(true)

    const promises = targetConnections.map((conn) =>
      fetchAndPersistTasks({
        hostBridge,
        db,
        workspaceId: workspace.id,
        connectionInstanceId: conn.id,
        dataSourceId: conn.dataSourceId,
        ids: isPureNumeric ? [pureId] : undefined,
        search: !isPureNumeric ? queryStr : undefined,
      }),
    )

    Promise.all(promises)
      .then((results) => {
        if (!isSubscribed) return
        setIsSearchingRemote(false)
        const totalFetched = results.reduce((acc, curr) => acc + curr.length, 0)
        if (totalFetched > 0) {
          queryClient.invalidateQueries({ queryKey: ['task-lookup'] })
        }
      })
      .catch(() => {
        if (!isSubscribed) return
        setIsSearchingRemote(false)
      })

    return () => {
      isSubscribed = false
    }
  }, [
    isModalOpen,
    db,
    workspace?.id,
    debouncedSearch,
    effectiveConnectionIds,
    availableConnections,
    hostBridge,
    queryClient,
  ])

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allTasks.length + 1 : allTasks.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    if (isModalOpen && scrollElement) rowVirtualizer.measure()
  }, [isModalOpen, scrollElement, rowVirtualizer])

  useEffect(() => {
    if (scrollElement) {
      rowVirtualizer.scrollToOffset(0)
      setSelectedIndex(0)
    }
  }, [
    debouncedSearch,
    statusFilter,
    priorityFilter,
    onlyMyTasks,
    sortOrder,
    scrollElement,
    rowVirtualizer,
  ])

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem || !hasNextPage || isFetchingNextPage) return
    if (lastItem.index >= allTasks.length - 1) fetchNextPage()
  }, [
    virtualItems,
    hasNextPage,
    isFetchingNextPage,
    allTasks.length,
    fetchNextPage,
  ])

  const handleSelect = useCallback(
    (task: SyncTaskRxDBDTO) => {
      if (!task) return
      onSelect(task)
      setIsModalOpen(false)
    },
    [onSelect, setIsModalOpen],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!allTasks.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(selectedIndex + 1, allTasks.length - 1)
      setSelectedIndex(next)
      rowVirtualizer.scrollToIndex(next, { align: 'center' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(selectedIndex - 1, 0)
      setSelectedIndex(prev)
      rowVirtualizer.scrollToIndex(prev, { align: 'center' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selectedTask = allTasks[selectedIndex]
      if (selectedTask) handleSelect(selectedTask)
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogPortal>
        <DialogOverlay className="pointer-events-auto bg-black/50 backdrop-blur-md transition-all" />
        <DialogContent
          onKeyDown={handleKeyDown}
          className="bg-card/95 border-border/40 pointer-events-auto flex h-[min(42rem,85vh)] max-h-[85vh] w-[95vw] max-w-3xl min-w-0 flex-col gap-0 overflow-hidden rounded-lg border p-0 shadow-2xl backdrop-blur-xl sm:max-w-3xl"
        >
          {/* Header Command Input Bar */}
          <DialogHeader className="border-border/30 space-y-0 border-b p-0">
            <div className="border-border/20 relative flex items-center border-b px-4 py-3">
              {isLoading || isSearchingRemote ? (
                <Loader2 className="text-primary h-5 w-5 shrink-0 animate-spin" />
              ) : singleSelectedConnection?.logo ? (
                <img
                  src={singleSelectedConnection.logo}
                  alt={singleSelectedConnection.label}
                  className="h-5 w-5 shrink-0 rounded-xs object-contain"
                />
              ) : (
                <Search className="text-muted-foreground/60 h-5 w-5 shrink-0" />
              )}
              <Input
                data-testid="task-lookup-modal-search-input"
                autoFocus
                placeholder={
                  singleSelectedConnection
                    ? `Pesquisar em ${singleSelectedConnection.label}...`
                    : 'Pesquisar por ID, título ou palavra-chave...'
                }
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="placeholder:text-muted-foreground/40 h-9 border-none bg-transparent px-3 text-base font-medium shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-muted-foreground hover:text-foreground rounded-sm p-1 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Toolbar */}
            <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
              {/* Left: DataSource Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedConnectionIds([])}
                  className={cn(
                    'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold transition-all select-none',
                    selectedConnectionIds.length === 0
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Layers className="h-3 w-3" />
                  <span>Todas as conexões</span>
                </button>

                {availableConnections.map((s) => {
                  const isSelected = selectedConnectionIds.includes(s.id)

                  const toggleConnection = () => {
                    if (isSelected) {
                      setSelectedConnectionIds((prev) =>
                        prev.filter((id) => id !== s.id),
                      )
                    } else {
                      setSelectedConnectionIds((prev) => [...prev, s.id])
                    }
                  }

                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={s.disabled}
                      title={s.description}
                      onClick={toggleConnection}
                      className={cn(
                        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-all select-none',
                        isSelected
                          ? 'border-primary/50 bg-primary/15 text-primary shadow-xs'
                          : 'border-border/40 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground',
                      )}
                    >
                      {s.logo ? (
                        <img
                          src={s.logo}
                          alt={s.label}
                          className="h-3.5 w-3.5 rounded-xs object-contain"
                        />
                      ) : (
                        <Hash className="h-3 w-3 opacity-60" />
                      )}
                      <span className="truncate">{s.label}</span>
                      {s.description && (
                        <span className="text-muted-foreground truncate font-normal">
                          {s.description}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Right: Dropdowns & Filters */}
              <div className="flex items-center gap-2">
                <button
                  data-testid="task-lookup-only-my-tasks-btn"
                  type="button"
                  onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                  className={cn(
                    'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition-all select-none',
                    onlyMyTasks
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/30 bg-background/40 text-muted-foreground opacity-70 hover:opacity-100',
                  )}
                >
                  <User className="h-3 w-3" />
                  <span>Minhas</span>
                </button>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    data-testid="task-lookup-status-filter"
                    className="bg-background/60 border-border/40 h-8 w-fit border px-2 text-xs font-semibold shadow-none focus:ring-0"
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all" className="text-xs font-medium">
                      Todos Status
                    </SelectItem>
                    {Array.from(metaLookup.statuses.values()).map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-xs font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={s.icon}
                            className="h-3.5 w-3.5 opacity-70"
                          />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={priorityFilter}
                  onValueChange={setPriorityFilter}
                >
                  <SelectTrigger className="bg-background/60 border-border/40 h-8 w-fit border px-2 text-xs font-semibold shadow-none focus:ring-0">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all" className="text-xs font-medium">
                      Todas Prioridades
                    </SelectItem>
                    {Array.from(metaLookup.priorities.values()).map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="text-xs font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={p.icon}
                            color={p.colors?.badge}
                            className="h-3.5 w-3.5"
                          />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={sortOrder}
                  onValueChange={(v) => {
                    if (v === 'desc' || v === 'asc') setSortOrder(v)
                  }}
                >
                  <SelectTrigger className="bg-background/60 border-border/40 h-8 w-fit border px-2 text-xs font-semibold shadow-none focus:ring-0">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 opacity-50" />
                      <SelectValue placeholder="Ordem" />
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="desc" className="text-xs font-medium">
                      Mais Recentes
                    </SelectItem>
                    <SelectItem value="asc" className="text-xs font-medium">
                      Mais Antigas
                    </SelectItem>
                  </SelectContent>
                </Select>

                {(statusFilter !== 'all' ||
                  priorityFilter !== 'all' ||
                  !onlyMyTasks ||
                  selectedConnectionIds.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all')
                      setPriorityFilter('all')
                      setOnlyMyTasks(true)
                      setSelectedConnectionIds([])
                    }}
                    title="Limpar todos os filtros"
                    className="text-muted-foreground hover:text-destructive flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors"
                  >
                    <FilterX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Virtual Task List */}
          <div
            ref={setScrollElement}
            className="scrollbar-thumb-muted/50 min-h-0 flex-1 scrollbar-thin overflow-y-auto"
          >
            {allTasks.length > 0 ? (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const isLoaderRow = virtualRow.index > allTasks.length - 1
                  const task = allTasks[virtualRow.index]
                  const isSelected = selectedIndex === virtualRow.index

                  if (!isLoaderRow && !task) return null

                  const pMeta = task?.priority?.id
                    ? metaLookup.priorities.get(task.priority.id)
                    : undefined

                  const pResolved = isLoaderRow
                    ? {}
                    : resolveEntityMapping(task?.priority, 'priority', mappings)
                  const sResolved = isLoaderRow
                    ? {}
                    : resolveEntityMapping(task?.status, 'status', mappings)
                  const tResolved = isLoaderRow
                    ? {}
                    : resolveEntityMapping(task?.tracker, 'tracker', mappings)

                  const priorityIcon = pResolved.icon
                  const priorityColor = pResolved.badgeColor
                  const statusColor = isLoaderRow
                    ? 'transparent'
                    : sResolved.badgeColor || '#888888'
                  const trackerIcon = tResolved.icon

                  const connObj = isLoaderRow
                    ? undefined
                    : availableConnections.find(
                        (c) => c.id === task?.connectionInstanceId,
                      )

                  return (
                    <div
                      key={virtualRow.key}
                      data-testid="task-lookup-row"
                      onClick={() => !isLoaderRow && task && handleSelect(task)}
                      onMouseEnter={() =>
                        !isLoaderRow && setSelectedIndex(virtualRow.index)
                      }
                      className={cn(
                        'border-border/20 absolute top-0 left-0 flex w-full cursor-pointer items-center justify-between gap-3 border-b px-4 transition-colors select-none',
                        isSelected
                          ? 'bg-primary/10 text-foreground border-l-primary border-l-2'
                          : 'hover:bg-muted/40 text-foreground/90',
                        isLoaderRow && 'pointer-events-none',
                      )}
                      style={{
                        height: `${ROW_HEIGHT}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        willChange: 'transform',
                      }}
                    >
                      {isLoaderRow ? (
                        <div className="flex w-full items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin opacity-30" />
                        </div>
                      ) : (
                        <>
                          {/* Priority Icon / Status Indicator */}
                          <div className="flex w-6 shrink-0 items-center justify-center">
                            {priorityIcon ? (
                              <DynamicIcon
                                name={priorityIcon}
                                color={priorityColor}
                                className="h-4 w-4"
                              />
                            ) : (
                              <Circle
                                className="h-2.5 w-2.5 fill-current opacity-70"
                                style={{ color: statusColor }}
                              />
                            )}
                          </div>

                          {/* Task Information */}
                          <div className="min-w-0 flex-1 py-1">
                            <TaskLookupTaskDetails
                              id={cleanTaskId(task.sourceId || task.id)}
                              title={task.title}
                              icon={
                                trackerIcon ? (
                                  <DynamicIcon
                                    name={trackerIcon}
                                    color={tResolved.badgeColor}
                                    className="size-4"
                                  />
                                ) : connObj?.logo ? (
                                  <img
                                    src={connObj.logo}
                                    alt=""
                                    className="size-4 rounded-xs object-contain"
                                  />
                                ) : undefined
                              }
                            />

                            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                              {task.projectName && (
                                <span className="text-foreground/70 flex max-w-[140px] items-center gap-1 truncate font-medium">
                                  <FolderKanban className="h-3 w-3 opacity-60" />
                                  {task.projectName}
                                </span>
                              )}

                              {task.status?.name && (
                                <span className="text-foreground/80 inline-flex items-center gap-1 font-semibold">
                                  {sResolved.icon ? (
                                    <DynamicIcon
                                      name={sResolved.icon}
                                      color={statusColor}
                                      className="h-3 w-3 shrink-0"
                                    />
                                  ) : (
                                    <Circle
                                      className="h-2 w-2 fill-current"
                                      style={{ color: statusColor }}
                                    />
                                  )}
                                  {task.status.name}
                                </span>
                              )}

                              {task.connectionInstanceId && (
                                <Badge
                                  variant="secondary"
                                  className="bg-muted/50 border-border/30 h-4 gap-1 border px-1.5 text-[9px] font-semibold"
                                >
                                  {connObj?.logo && (
                                    <img
                                      src={connObj.logo}
                                      alt=""
                                      className="h-2.5 w-2.5 rounded-xs object-contain"
                                    />
                                  )}
                                  <span>{connObj?.label}</span>
                                </Badge>
                              )}

                              {(() => {
                                const myId =
                                  memberIdsByConnection?.[
                                    task.connectionInstanceId
                                  ] ?? currentUserId
                                const myParticipant = task.participants?.find(
                                  (p) => p.id === String(myId ?? ''),
                                )
                                if (!myParticipant) return null

                                const roleMeta = myParticipant.role?.id
                                  ? metaLookup.roles.get(myParticipant.role.id)
                                  : null
                                const roleName = roleMeta?.name

                                return (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/40 text-primary h-4 gap-1 px-1.5 text-[9px] font-semibold"
                                  >
                                    <User className="h-2.5 w-2.5" /> Eu
                                    {roleName ? ` - ${roleName}` : ''}
                                  </Badge>
                                )
                              })()}
                            </div>
                          </div>

                          {/* Right Side: Selection Badge & Date */}
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {isSelected ? (
                              <Badge className="bg-primary text-primary-foreground h-4 px-2 text-[9px] font-bold">
                                ↵ Selecionar
                              </Badge>
                            ) : (
                              <span className="font-mono text-[10px] opacity-50">
                                {new Date(task.updatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : !isLoading ? (
              <div className="text-muted-foreground/50 flex flex-col items-center justify-center py-20">
                <AlertCircle className="mb-3 h-10 w-10 stroke-1" />
                <p className="text-xs font-semibold tracking-wider uppercase">
                  Nenhuma tarefa encontrada
                </p>
                <p className="mt-1 text-[11px] opacity-70">
                  Tente alterar os termos de busca ou filtros
                </p>
              </div>
            ) : null}
          </div>

          {/* Footer Navigation Bar */}
          <div className="bg-muted/40 text-muted-foreground border-border/30 flex items-center justify-between border-t px-4 py-2.5 text-[11px] font-medium">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-semibold">
                {allTasks.length}
              </span>
              <span className="opacity-70">tarefas encontradas</span>
            </div>
            <div className="flex items-center gap-4 text-[10px] opacity-75">
              <span className="flex items-center gap-1">
                <kbd className="bg-muted text-foreground border-border/50 rounded border px-1 py-0.5 font-mono text-[9px]">
                  ↑↓
                </kbd>{' '}
                Navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted text-foreground border-border/50 rounded border px-1 py-0.5 font-mono text-[9px]">
                  ↵
                </kbd>{' '}
                Escolher
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted text-foreground border-border/50 rounded border px-1 py-0.5 font-mono text-[9px]">
                  ESC
                </kbd>{' '}
                Fechar
              </span>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
