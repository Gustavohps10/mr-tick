export interface SidebarSubItem {
  id: string
  label: string
  href: string
  icon?: string
}

export interface SidebarMenuItem {
  id: string
  label: string
  href?: string
  icon?: string
  children?: SidebarSubItem[]
}
