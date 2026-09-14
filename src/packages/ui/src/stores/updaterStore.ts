import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UpdaterState =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export type ReleaseNote = string | { note?: string; [key: string]: unknown }

export interface UpdateInfoData {
  version?: string
  releaseDate?: string
  releaseNotes?: string | ReleaseNote[]
}

interface UpdaterStoreState {
  updaterState: UpdaterState
  version: string
  isPortable: boolean
  installPath: string
  allowBeta: boolean
  progress: number
  errorMessage: string
  updateInfo: UpdateInfoData | null
  showModal: boolean
  isInstalling: boolean

  // Notification & Snooze / Skip state
  skippedVersion: string | null
  remindLaterUntil: number | null

  // Actions
  setVersion: (version: string) => void
  setIsPortable: (isPortable: boolean) => void
  setInstallPath: (installPath: string) => void
  setAllowBeta: (allowBeta: boolean) => void
  setUpdaterState: (updaterState: UpdaterState) => void
  setProgress: (progress: number) => void
  setErrorMessage: (errorMessage: string) => void
  setUpdateInfo: (updateInfo: UpdateInfoData | null) => void
  setShowModal: (showModal: boolean) => void
  setIsInstalling: (isInstalling: boolean) => void
  skipCurrentUpdate: () => void
  remindMeLater: () => void
}

export const useUpdaterStore = create<UpdaterStoreState>()(
  persist(
    (set, get) => ({
      updaterState: 'idle',
      version: '',
      isPortable: false,
      installPath: '',
      allowBeta: false,
      progress: 0,
      errorMessage: '',
      updateInfo: null,
      showModal: false,
      isInstalling: false,

      skippedVersion: null,
      remindLaterUntil: null,

      setVersion: (version) => set({ version }),
      setIsPortable: (isPortable) => set({ isPortable }),
      setInstallPath: (installPath) => set({ installPath }),
      setAllowBeta: (allowBeta) => set({ allowBeta }),
      setUpdaterState: (updaterState) =>
        set((state) => ({
          updaterState,
          progress: updaterState === 'downloading' ? 0 : state.progress,
        })),
      setProgress: (progress) =>
        set((state) => ({
          progress: Math.max(
            state.progress,
            Math.min(100, Math.round(progress)),
          ),
        })),
      setErrorMessage: (errorMessage) => set({ errorMessage }),
      setUpdateInfo: (updateInfo) => set({ updateInfo }),
      setShowModal: (showModal) => set({ showModal }),
      setIsInstalling: (isInstalling) => set({ isInstalling }),

      skipCurrentUpdate: () => {
        const { updateInfo } = get()
        set({
          skippedVersion: updateInfo?.version || null,
          showModal: false,
        })
      },

      remindMeLater: () => {
        // Remind again after 24 hours
        set({
          remindLaterUntil: Date.now() + 24 * 60 * 60 * 1000,
          showModal: false,
        })
      },
    }),
    {
      name: 'mr-tick-updater-store',
      partialize: (state) => ({
        skippedVersion: state.skippedVersion,
        remindLaterUntil: state.remindLaterUntil,
        updateInfo: state.updateInfo,
        updaterState: state.updaterState === 'available' ? 'available' : 'idle',
      }),
    },
  ),
)
