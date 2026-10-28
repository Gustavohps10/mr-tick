import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

export type TCard = {
  task: SyncTaskRxDBDTO
  metadata: SyncMetadataRxDBDTO
}

export type TColumn = {
  id: string
  title: string
  cards: TCard[]
  actions?: ColumnActionGroup[]
  position: number
  isLoading: boolean
  onChange?: (column: TColumn) => void
}

export type ColumnAction = {
  icon?: React.ReactNode
  label: string
  onClick: (column: TColumn) => void
}

export type ColumnActionGroup = {
  title?: string
  items: ColumnAction[]
}

export type TBoard = {
  columns: TColumn[]
  onReorder?: (beforeColumns: TColumn[], afterColumns: TColumn[]) => void
}

const cardKey = Symbol('card')
export type TCardData = {
  [cardKey]: true
  card: TCard
  columnId: string
  rect: DOMRect
}

export function getCardData({
  card,
  rect,
  columnId,
}: Omit<TCardData, typeof cardKey> & { columnId: string }): TCardData {
  return {
    [cardKey]: true,
    rect,
    card,
    columnId,
  }
}

export function isCardData(
  value: Record<string | symbol, unknown>,
): value is TCardData {
  return Boolean(value[cardKey])
}

export function isDraggingACard({
  source,
}: {
  source: { data: Record<string | symbol, unknown> }
}): boolean {
  return isCardData(source.data)
}

const cardDropTargetKey = Symbol('card-drop-target')
export type TCardDropTargetData = {
  [cardDropTargetKey]: true
  card: TCard
  columnId: string
}

export function isCardDropTargetData(
  value: Record<string | symbol, unknown>,
): value is TCardDropTargetData {
  return Boolean(value[cardDropTargetKey])
}

export function getCardDropTargetData({
  card,
  columnId,
}: Omit<TCardDropTargetData, typeof cardDropTargetKey> & {
  columnId: string
}): TCardDropTargetData {
  return {
    [cardDropTargetKey]: true,
    card,
    columnId,
  }
}

const columnKey = Symbol('column')
export type TColumnData = {
  [columnKey]: true
  column: TColumn
}

export function getColumnData({
  column,
}: Omit<TColumnData, typeof columnKey>): TColumnData {
  return {
    [columnKey]: true,
    column,
  }
}

export function isColumnData(
  value: Record<string | symbol, unknown>,
): value is TColumnData {
  return Boolean(value[columnKey])
}

export function isDraggingAColumn({
  source,
}: {
  source: { data: Record<string | symbol, unknown> }
}): boolean {
  return isColumnData(source.data)
}
