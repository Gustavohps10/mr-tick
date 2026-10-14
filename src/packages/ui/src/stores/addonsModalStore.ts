import { create } from 'zustand'

import { type SettingsTab, useSettingsModalStore } from './settingsModalStore'

interface AddonsModalState {
  isOpen: boolean
  openModal: (section?: 'browse' | 'installed' | 'updates' | 'settings') => void
  closeModal: () => void
  toggleModal: () => void
}

function resolveAddonsTab(section?: string): SettingsTab {
  if (section === 'installed' || section === 'settings')
    return 'addons-installed'
  if (section === 'updates') return 'addons-updates'
  return 'addons-browse'
}

export const useAddonsModalStore = create<AddonsModalState>((set) => ({
  isOpen: false,
  openModal: (section = 'browse') => {
    set({ isOpen: true })
    useSettingsModalStore.getState().openModal(resolveAddonsTab(section))
  },
  closeModal: () => {
    set({ isOpen: false })
    useSettingsModalStore.getState().closeModal()
  },
  toggleModal: () => {
    set((state) => {
      const next = !state.isOpen
      if (next) {
        useSettingsModalStore.getState().openModal('addons-browse')
        return { isOpen: true }
      }
      useSettingsModalStore.getState().closeModal()
      return { isOpen: false }
    })
  },
}))
