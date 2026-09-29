import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WidgetPosition = 'top' | 'bottom' | 'left' | 'right'
export type LogOption = 'none' | 'manual' | 'ask'

interface TimerSettingsState {
  timerDirection: 'up' | 'down'
  logOption: LogOption
  widgetPosition: WidgetPosition
  selectedDisplayId: number | null
  selectedWorkspaceId: string | null // <-- NOVO: Guarda o último workspace utilizado
  discordRpc: boolean
  antiBurnout: boolean
  activeWindowTracking: boolean
  hiddenBlocks: string[]
  enabledAddonIds: string[]
  startMinimized: boolean
  mainWindowWidgetPosition: WidgetPosition

  setTimerDirection: (val: 'up' | 'down') => void
  setLogOption: (val: LogOption) => void
  setWidgetPosition: (val: WidgetPosition) => void
  setMainWindowWidgetPosition: (val: WidgetPosition) => void
  setSelectedDisplayId: (val: number | null) => void
  setSelectedWorkspaceId: (val: string | null) => void // <-- NOVO
  setDiscordRpc: (val: boolean) => void
  setAntiBurnout: (val: boolean) => void
  setActiveWindowTracking: (val: boolean) => void
  setStartMinimized: (val: boolean) => void
  toggleHiddenBlock: (id: string) => void
  toggleAddonVisibility: (id: string) => void
}

export const useTimerSettings = create<TimerSettingsState>()(
  persist(
    (set) => ({
      timerDirection: 'up',
      logOption: 'ask',
      widgetPosition: 'bottom',
      selectedDisplayId: null,
      selectedWorkspaceId: null,
      discordRpc: false,
      antiBurnout: true,
      activeWindowTracking: false,
      hiddenBlocks: [],
      enabledAddonIds: [],
      startMinimized: false,
      mainWindowWidgetPosition: 'bottom',

      setTimerDirection: (val) => set({ timerDirection: val }),
      setLogOption: (val) => set({ logOption: val }),
      setWidgetPosition: (val) => set({ widgetPosition: val }),
      setMainWindowWidgetPosition: (val) =>
        set({ mainWindowWidgetPosition: val }),
      setSelectedDisplayId: (val) => set({ selectedDisplayId: val }),
      setSelectedWorkspaceId: (val) => set({ selectedWorkspaceId: val }),
      setDiscordRpc: (val) => set({ discordRpc: val }),
      setAntiBurnout: (val) => set({ antiBurnout: val }),
      setActiveWindowTracking: (val) => set({ activeWindowTracking: val }),
      setStartMinimized: (val) => set({ startMinimized: val }),

      toggleHiddenBlock: (id) =>
        set((state) => ({
          hiddenBlocks: state.hiddenBlocks.includes(id)
            ? state.hiddenBlocks.filter((b) => b !== id)
            : [...state.hiddenBlocks, id],
        })),

      toggleAddonVisibility: (id) =>
        set((state) => ({
          enabledAddonIds: (state.enabledAddonIds ?? []).includes(id)
            ? (state.enabledAddonIds ?? []).filter((b) => b !== id)
            : [...(state.enabledAddonIds ?? []), id],
        })),
    }),

    {
      name: 'mr-tick-timer-preferences',
    },
  ),
)

export const useCurrentWidgetPosition = () => {
  const isWidgetWindow =
    typeof window !== 'undefined' && window.location.hash.includes('/widgets/')
  const widgetPosition = useTimerSettings((s) =>
    isWidgetWindow ? s.widgetPosition : s.mainWindowWidgetPosition,
  )
  const setWidgetPosition = useTimerSettings((s) =>
    isWidgetWindow ? s.setWidgetPosition : s.setMainWindowWidgetPosition,
  )
  return [widgetPosition, setWidgetPosition] as const
}
