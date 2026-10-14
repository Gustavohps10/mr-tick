import { create } from 'zustand'

export type SettingsTab =
  | 'about'
  | 'general'
  | 'appearance'
  | 'updates'
  | 'license'
  | 'addons-browse'
  | 'addons-installed'
  | 'addons-updates'
  | 'addons-settings'

export interface SettingsModalState {
  isOpen: boolean
  activeTab: SettingsTab
  selectedAddonCategory: string | null
  openModal: (tab?: SettingsTab, addonCategory?: string | null) => void
  closeModal: () => void
  setActiveTab: (tab: SettingsTab) => void
  setSelectedAddonCategory: (category: string | null) => void
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  activeTab: 'about',
  selectedAddonCategory: null,
  openModal: (tab = 'about', addonCategory = null) =>
    set({
      isOpen: true,
      activeTab: tab,
      selectedAddonCategory: addonCategory,
    }),
  closeModal: () => set({ isOpen: false }),
  setActiveTab: (tab: SettingsTab) => set({ activeTab: tab }),
  setSelectedAddonCategory: (category: string | null) =>
    set({ selectedAddonCategory: category }),
}))
