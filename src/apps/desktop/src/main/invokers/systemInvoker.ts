import { AppSettings, ISystemAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const systemInvoker: ISystemAPI = {
  getAppVersion: () => IpcInvoker.invoke('SYSTEM_VERSION'),
  getSdkVersion: () => IpcInvoker.invoke('SYSTEM_SDK_VERSION'),
  getEnvironment: () => IpcInvoker.invoke('SYSTEM_GET_ENVIRONMENT'),
  setIgnoreMouseEvents: (payload) =>
    IpcInvoker.invoke('WIDGET_SET_IGNORE_MOUSE', payload),
  getDisplays: () => IpcInvoker.invoke('SYSTEM_GET_DISPLAYS'),
  moveToDisplay: (input) => IpcInvoker.invoke('SYSTEM_MOVE_TO_DISPLAY', input),
  minimizeWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_MINIMIZE_WINDOW', { body: { windowType } }),
  maximizeWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_MAXIMIZE_WINDOW', { body: { windowType } }),
  unmaximizeWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_UNMAXIMIZE_WINDOW', { body: { windowType } }),
  closeWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_CLOSE_WINDOW', { body: { windowType } }),
  hideWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_HIDE_WINDOW', { body: { windowType } }),
  showWindow: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_SHOW_WINDOW', { body: { windowType } }),
  isMaximized: (windowType?: string) =>
    IpcInvoker.invoke('SYSTEM_IS_MAXIMIZED', { body: { windowType } }),
  getSettings: () => IpcInvoker.invoke('SYSTEM_GET_SETTINGS'),
  saveSettings: (settings: AppSettings) =>
    IpcInvoker.invoke('SYSTEM_SAVE_SETTINGS', { body: settings }),

  // --- MÉTODOS DE FOCO NATIVO / INTERCEPTAÇÃO ---
  forceTopmost: () => IpcInvoker.invoke('WIDGET_FORCE_TOPMOST'),

  startKeyboardInterception: () =>
    IpcInvoker.invoke('WIDGET_START_KEY_CAPTURE'),

  stopKeyboardInterception: () => IpcInvoker.invoke('WIDGET_STOP_KEY_CAPTURE'),
  toggleTheme: (payload) => IpcInvoker.invoke('SYSTEM_TOGGLE_THEME', payload),
}
