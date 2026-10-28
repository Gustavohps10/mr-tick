import type { AddonCapability } from '@mr-tick/sdk'
import { create } from 'zustand'

export type SettingsTab =
  | 'about'
  | 'general'
  | 'appearance'
  | 'updates'
  | 'license'
  | 'system-data'
  | 'addons-browse'
  | 'addons-installed'
  | 'addons-updates'
  | 'addons-settings'

export interface SettingsModalState {
  isOpen: boolean
  activeTab: SettingsTab
  selectedAddonCapability: AddonCapability | null
  openModal: (
    tab?: SettingsTab,
    addonCapability?: AddonCapability | null,
  ) => void
  closeModal: () => void
  setActiveTab: (tab: SettingsTab) => void
  setSelectedAddonCapability: (capability: AddonCapability | null) => void
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  activeTab: 'about',
  selectedAddonCapability: null,
  openModal: (tab = 'about', addonCapability = null) =>
    set({
      isOpen: true,
      activeTab: tab,
      selectedAddonCapability: addonCapability,
    }),
  closeModal: () => set({ isOpen: false }),
  setActiveTab: (tab: SettingsTab) => set({ activeTab: tab }),
  setSelectedAddonCapability: (capability: AddonCapability | null) =>
    set({ selectedAddonCapability: capability }),
}))
