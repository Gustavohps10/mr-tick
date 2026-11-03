import { CheckSquare2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface TaskLookupPresentation {
  id: string
  title: string
  metadata?: ReactNode
  icon?: ReactNode
}

export function TaskLookupTaskDetails({
  id,
  title,
  metadata,
  icon,
}: TaskLookupPresentation) {
  let renderedIcon: ReactNode = icon

  if (!renderedIcon) {
    renderedIcon = (
      <CheckSquare2 className="text-muted-foreground/50 mt-0.5 size-4 shrink-0" />
    )
  }

  return (
    <span className="flex min-w-0 flex-1 items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{renderedIcon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground/90 line-clamp-2 text-xs leading-snug font-medium break-words">
          {title}
        </span>
        <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="font-mono text-[10px] opacity-80">{id}</span>
          {metadata}
        </span>
      </span>
    </span>
  )
}

export interface TaskLookupResultsProps<T> {
  tasks: readonly T[]
  getKey: (task: T) => string
  present: (task: T) => TaskLookupPresentation
  onSelect: (task: T) => void
  selectedKey?: string
  activeKey?: string
  listId?: string
  renderAction?: (task: T) => ReactNode
  getTestId?: (task: T) => string
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  footer?: ReactNode
}

/** Presentation only: data fetching and source identifiers belong to the caller. */
export function TaskLookupResults<T>({
  tasks,
  getKey,
  present,
  onSelect,
  selectedKey,
  activeKey,
  listId,
  renderAction,
  getTestId,
  loading = false,
  error,
  emptyMessage = 'Nenhuma tarefa encontrada.',
  footer,
}: TaskLookupResultsProps<T>) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Carregando tarefas"
        className="flex max-h-56 min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3"
      >
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (error)
    return (
      <p role="alert" className="text-destructive p-3 text-sm">
        {error}
      </p>
    )
  if (tasks.length === 0)
    return (
      <p
        role="status"
        className="text-muted-foreground p-6 text-center text-sm"
      >
        {emptyMessage}
      </p>
    )

  return (
    <div className="max-h-56 min-h-0 flex-1 scrollbar-thin overflow-y-auto overscroll-contain">
      <ul
        id={listId}
        role="listbox"
        aria-label="Tarefas"
        className="space-y-1 p-1"
      >
        {tasks.map((task) => {
          const key = getKey(task)
          const item = present(task)
          const selected = key === selectedKey

          return (
            <li
              key={key}
              className={cn(
                'group flex items-start gap-1 rounded-md transition-colors',
                selected && 'bg-primary/10 border-primary/25 border',
              )}
            >
              <button
                id={listId ? `${listId}-${key}` : undefined}
                role="option"
                aria-selected={
                  activeKey === undefined ? selected : key === activeKey
                }
                type="button"
                data-testid={getTestId?.(task)}
                onClick={() => onSelect(task)}
                className={cn(
                  'hover:bg-accent/60 focus-visible:ring-ring flex min-w-0 flex-1 items-start gap-2 rounded-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-1',
                  key === activeKey && 'bg-accent',
                )}
                title={item.title}
              >
                <TaskLookupTaskDetails {...item} />
              </button>
              {renderAction && (
                <div className="shrink-0 pt-1.5 pr-1">{renderAction(task)}</div>
              )}
            </li>
          )
        })}
      </ul>
      {footer}
    </div>
  )
}
