export type TimerbarItemType = 'action' | 'popover'

export interface TimerbarPopoverSubItem {
  id: string
  label: string
  icon?: string
  description?: string
  shortcut?: string
  danger?: boolean
}

export interface TimerbarActionItem {
  id: string
  type: 'action'
  label?: string
  icon: string
  tooltip?: string
}

export interface TimerbarPopoverItem {
  id: string
  type: 'popover'
  label?: string
  icon: string
  tooltip?: string
  items: TimerbarPopoverSubItem[]
}

export type TimerbarMenuItem = TimerbarActionItem | TimerbarPopoverItem
