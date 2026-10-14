import React from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'

import {
  addonMatchesCategory,
  AddonsManagerView,
  OFFICIAL_CATEGORIES,
  type OfficialCategoryItem,
  SafeAddonLogo,
  type SidebarSection,
} from './addons-manager-view'

export {
  addonMatchesCategory,
  OFFICIAL_CATEGORIES,
  type OfficialCategoryItem,
  SafeAddonLogo,
  type SidebarSection,
}

export interface AddonsManagerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddonsManagerModal({
  open,
  onOpenChange,
}: AddonsManagerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[90vw] flex-row gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        <AddonsManagerView hideSidebar={false} />
      </DialogContent>
    </Dialog>
  )
}
