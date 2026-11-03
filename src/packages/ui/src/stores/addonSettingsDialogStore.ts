import type { AddonManifestViewModel } from '@mr-tick/shared/view-models'
import { create } from 'zustand'

interface AddonSettingsDialogState {
  isOpen: boolean
  addon: AddonManifestViewModel | null
  open: (addon: AddonManifestViewModel) => void
  close: () => void
}

export const useAddonSettingsDialogStore = create<AddonSettingsDialogState>(
  (set) => ({
    isOpen: false,
    addon: null,
    open: (addon) => set({ isOpen: true, addon }),
    close: () => set({ isOpen: false, addon: null }),
  }),
)
