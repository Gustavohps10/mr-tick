'use client'

import type { Separator } from 'fumadocs-core/page-tree'
import { SidebarSeparator } from 'fumadocs-ui/components/sidebar/base'

export function DocsSidebarSection({ item }: { item: Separator }) {
  return (
    <SidebarSeparator className="text-fd-muted-foreground mt-7 mb-2 flex items-center gap-2 px-2 text-[11px] leading-5 font-semibold tracking-widest uppercase first:mt-0">
      {item.icon}
      {item.name}
    </SidebarSeparator>
  )
}
