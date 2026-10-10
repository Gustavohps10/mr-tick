import type { ICoreRuntimeAPI } from '@mr-tick/application'
import type { IAddonEventsAPI, IRegistry } from '@mr-tick/sdk'
import type { ISystemEvents } from '@mr-tick/shared/transport'

/** Tracks only resources contributed through the host. Addons own their sockets. */
export class AddonLifetime {
  private active = true
  private readonly cleanups = new Set<() => void>()
  isActive(): boolean {
    return this.active
  }
  track(cleanup: () => void): () => void {
    if (!this.active) {
      cleanup()
      return () => {}
    }
    const dispose = () => {
      this.cleanups.delete(dispose)
      cleanup()
    }
    this.cleanups.add(dispose)
    return dispose
  }
  dispose(): void {
    this.active = false
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.clear()
  }
  availability(runtime: ICoreRuntimeAPI): ICoreRuntimeAPI {
    return {
      getState: () => runtime.getState(),
      onStateChanged: (listener) => {
        if (!this.active) return () => {}
        return this.track(runtime.onStateChanged(listener))
      },
    }
  }
  registry<T extends { id: string }>(
    addonId: string,
    registry: IRegistry<T>,
  ): IRegistry<T> {
    const ids = new Set<string>()
    return {
      register: (item) => {
        if (!this.active) return
        const id = `${addonId}:${item.id}`
        registry.register({ ...item, id })
        ids.add(id)
        this.track(() => {
          registry.unregister(id)
          ids.delete(id)
        })
      },
      unregister: (id) => {
        const qualified = `${addonId}:${id}`
        if (ids.delete(qualified)) registry.unregister(qualified)
      },
      getItems: () => registry.getItems().filter((item) => ids.has(item.id)),
    }
  }
  events(events: IAddonEventsAPI): IAddonEventsAPI {
    return new ScopedAddonEvents(events, this)
  }
}
class ScopedAddonEvents implements IAddonEventsAPI {
  constructor(
    private readonly events: IAddonEventsAPI,
    private readonly lifetime: AddonLifetime,
  ) {}
  on<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): () => void
  on<T = void>(channel: string, handler: (data: T) => void): () => void
  on(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): () => void {
    if (!this.lifetime.isActive()) return () => {}
    return this.lifetime.track(this.events.on(channel, handler))
  }
  emit<K extends keyof ISystemEvents>(event: K, payload: ISystemEvents[K]): void
  emit<T = void>(channel: string, payload?: T): void
  emit(channel: string, payload?: ISystemEvents[keyof ISystemEvents]): void {
    if (this.lifetime.isActive()) this.events.emit(channel, payload)
  }
}
