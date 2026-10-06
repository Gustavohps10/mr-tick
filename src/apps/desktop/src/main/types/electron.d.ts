export interface NativeOverlayType {
  applyOverlayStyles: (handle: Buffer) => boolean
  removeOverlayStyles?: (handle: Buffer) => void
  cleanupOverlay?: () => void
  isKeyboardInterceptionActive?: () => boolean
  setKeyEventListener: (
    callback: (data: { vkCode: number; key: string }) => void,
  ) => void
  startKeyboardInterception?: () => void
  stopKeyboardInterception?: () => void
  forceTopmost?: (handle: Buffer) => void
}

declare global {
  var nativeOverlayInstance: NativeOverlayType | null | undefined
  namespace Electron {
    interface BrowserWindow {
      windowType?: 'main' | 'widget' | string
    }
  }
}

declare module 'electron' {
  interface BrowserWindow {
    windowType?: 'main' | 'widget' | string
  }
}
