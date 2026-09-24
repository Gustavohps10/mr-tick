'use client'

import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { DragLocationHistory } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types'
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'
import { unsafeOverflowAutoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/unsafe-overflow/element'
import { Ellipsis, PlusIcon } from 'lucide-react'
import { memo, useContext, useEffect, useRef, useState } from 'react'
import invariant from 'tiny-invariant'

import { Loader } from '@/components/loader'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { Card, CardShadow } from './card'
import {
  getColumnData,
  isCardData,
  isCardDropTargetData,
  isColumnData,
  isDraggingACard,
  isDraggingAColumn,
  TCardData,
  TColumn,
} from './data'
import { blockBoardPanningAttr } from './data-attributes'
import { isShallowEqual } from './is-shallow-equal'
import { SettingsContext } from './settings-context'

type TColumnState =
  | {
      type: 'is-card-over'
      isOverChildCard: boolean
      dragging: DOMRect
    }
  | {
      type: 'is-column-over'
    }
  | {
      type: 'idle'
    }
  | {
      type: 'is-dragging'
    }

const stateStyles: { [Key in TColumnState['type']]: string } = {
  idle: 'cursor-grab',
  'is-card-over': 'outline outline-2 outline-primary',
  'is-dragging': '',
  'is-column-over': 'bg-slate-900',
}

const idle = { type: 'idle' } satisfies TColumnState

const CardList = memo(function CardList({ column }: { column: TColumn }) {
  return column.cards.map((card) => (
    <Card key={card.task.id} card={card} columnId={column.id} />
  ))
})

export function Column({ column }: { column: TColumn }) {
  const scrollableRef = useRef<HTMLDivElement | null>(null)
  const outerFullHeightRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const { settings } = useContext(SettingsContext)
  const [state, setState] = useState<TColumnState>(idle)
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [tempTitle, setTempTitle] = useState(column.title)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startEditing = () => {
    setTempTitle(column.title)
    setIsEditing(true)
  }

  const saveEditing = () => {
    setIsEditing(false)
    if (tempTitle !== column.title && column.onChange) {
      column.onChange({
        ...column,
        title: tempTitle,
      })
    }
  }

  const cancelEditing = () => {
    setTempTitle(column.title)
    setIsEditing(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveEditing()
    if (e.key === 'Escape') cancelEditing()
  }

  useEffect(() => {
    const outer = outerFullHeightRef.current
    const scrollable = scrollableRef.current
    const header = headerRef.current
    const inner = innerRef.current
    invariant(outer)
    invariant(scrollable)
    invariant(header)
    invariant(inner)

    const data = getColumnData({ column })

    function setIsCardOver({
      data,
      location,
    }: {
      data: TCardData
      location: DragLocationHistory
    }) {
      const innerMost = location.current.dropTargets[0]
      const isOverChildCard = Boolean(
        innerMost && isCardDropTargetData(innerMost.data),
      )

      const proposed: TColumnState = {
        type: 'is-card-over',
        dragging: data.rect,
        isOverChildCard,
      }

      setState((current) => {
        if (isShallowEqual(proposed, current)) {
          return current
        }
        return proposed
      })
    }

    return combine(
      draggable({
        element: header,
        getInitialData: () => data,
        onGenerateDragPreview({ source, location, nativeSetDragImage }) {
          const data = source.data
          invariant(isColumnData(data))
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element: header,
              input: location.current.input,
            }),
            render({ container }) {
              const rect = inner.getBoundingClientRect()
              const preview = inner.cloneNode(true)
              invariant(preview instanceof HTMLElement)
              preview.style.width = `${rect.width}px`
              preview.style.height = `${rect.height}px`

              container.appendChild(preview)
            },
          })
        },
        onDragStart() {
          setState({ type: 'is-dragging' })
        },
        onDrop() {
          setState(idle)
        },
      }),
      dropTargetForElements({
        element: outer,
        getData: () => data,
        canDrop({ source }) {
          return isDraggingACard({ source }) || isDraggingAColumn({ source })
        },
        getIsSticky: () => true,
        onDragStart({ source, location }) {
          if (isCardData(source.data)) {
            setIsCardOver({ data: source.data, location })
          }
        },
        onDragEnter({ source, location }) {
          if (isCardData(source.data)) {
            setIsCardOver({ data: source.data, location })
            return
          }
          if (
            isColumnData(source.data) &&
            source.data.column.id !== column.id
          ) {
            setState({ type: 'is-column-over' })
          }
        },
        onDropTargetChange({ source, location }) {
          if (isCardData(source.data)) {
            setIsCardOver({ data: source.data, location })
            return
          }
        },
        onDragLeave({ source }) {
          if (
            isColumnData(source.data) &&
            source.data.column.id === column.id
          ) {
            return
          }
          setState(idle)
        },
        onDrop() {
          setState(idle)
        },
      }),
      autoScrollForElements({
        canScroll({ source }) {
          if (!settings.isOverElementAutoScrollEnabled) {
            return false
          }

          return isDraggingACard({ source })
        },
        getConfiguration: () => ({
          maxScrollSpeed: settings.columnScrollSpeed,
        }),
        element: scrollable,
      }),
      unsafeOverflowAutoScrollForElements({
        element: scrollable,
        getConfiguration: () => ({
          maxScrollSpeed: settings.columnScrollSpeed,
        }),
        canScroll({ source }) {
          if (!settings.isOverElementAutoScrollEnabled) {
            return false
          }

          if (!settings.isOverflowScrollingEnabled) {
            return false
          }

          return isDraggingACard({ source })
        },
        getOverflow() {
          return {
            forTopEdge: {
              top: 1000,
            },
            forBottomEdge: {
              bottom: 1000,
            },
          }
        },
      }),
    )
  }, [column, settings])

  return (
    <div
      className="flex w-72 flex-shrink-0 flex-col select-none"
      ref={outerFullHeightRef}
    >
      <div
        className={`group bg-card flex max-h-full flex-col rounded-lg text-zinc-50 shadow-sm ${stateStyles[state.type]}`}
        ref={innerRef}
        {...{ [blockBoardPanningAttr]: true }}
      >
        <div
          className={`flex max-h-full flex-col ${
            state.type === 'is-column-over' ? 'invisible' : ''
          }`}
        >
          <div
            className="flex flex-row items-center justify-between px-3 py-2"
            ref={headerRef}
          >
            {!isEditing && (
              <div className="pl-2">
                <div
                  className="text-foreground hover:bg-background hover:border-primary/40 box-border cursor-text rounded-sm border-2 border-transparent px-2 pl-2 text-sm leading-tight font-semibold transition-colors transition-shadow select-none"
                  role="button"
                  aria-label="Column title (double click to edit)"
                  onDoubleClick={startEditing}
                >
                  {column.title} 
                </div>
              </div>
            )}
            {isEditing && (
              <div className="pl-2">
                <input
                  ref={inputRef}
                  className="text-foreground bg-background border-primary/40 ring-primary/40 box-border rounded-sm border-2 px-1 pl-2 text-sm leading-tight font-semibold ring-1 transition-all outline-none"
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onBlur={saveEditing}
                  onKeyDown={onKeyDown}
                  aria-label="Edit column title"
                />
              </div>
            )}
            {column.isLoading && <Loader />} 
            {!column.isLoading &&
              Array.isArray(column.actions) &&
              column.actions.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-foreground h-7 w-7 p-1"
                    >
                      <Ellipsis size={16} /> 
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent
                    align="end"
                    className="bg-popover w-48 rounded-md border p-1 shadow-md"
                  >
                    <div className="flex flex-col gap-1.5">
                      {column.actions.map((group, indexGroup) => (
                        <div key={indexGroup} className="flex flex-col gap-1">
                          {group.title && (
                            <div className="text-sidebar-foreground/70 flex h-5 items-center px-1.5 text-[10px] font-medium">
                              {group.title} 
                            </div>
                          )}

                          <div className="flex flex-col gap-[2px]">
                            {group.items.map((item, indexItem) => (
                              <button
                                key={indexItem}
                                className="hover:bg-accent hover:text-accent-foreground flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors"
                                onClick={() => item.onClick(column)}
                              >
                                <span className="flex items-center leading-none [&>svg]:size-4">
                                  {item.icon} 
                                </span>

                                <span className="text-muted-foreground leading-none tracking-tighter">
                                  {item.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
          </div>
          <div
            className="flex [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.600)_theme(colors.slate.700)] flex-col gap-y-3.5 overflow-y-auto px-3 py-3 [overflow-anchor:none]"
            ref={scrollableRef}
          >
            <CardList column={column} /> 
            {state.type === 'is-card-over' && !state.isOverChildCard ? (
              <div className="shrink-0 py-1">
                <CardShadow dragging={state.dragging} /> 
              </div>
            ) : null}
            <button className="text-muted-foreground hover:bg-primary/10 dark:hover:bg-primary/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
              <PlusIcon size={16} />  Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
