import { create } from 'zustand'

export interface ConflictModalState {
  isOpen: boolean
  activeConflictId: string | null
  openConflictModal: (conflictId?: string) => void
  closeConflictModal: () => void
  setActiveConflictId: (conflictId: string | null) => void
}

export const useConflictModalStore = create<ConflictModalState>((set) => ({
  isOpen: false,
  activeConflictId: null,
  openConflictModal: (conflictId?: string) => {
    set({
      isOpen: true,
      activeConflictId: conflictId ? conflictId : null,
    })
  },
  closeConflictModal: () => {
    set({
      isOpen: false,
      activeConflictId: null,
    })
  },
  setActiveConflictId: (conflictId: string | null) => {
    set({
      activeConflictId: conflictId,
    })
  },
}))
