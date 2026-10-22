import type { ICoreRuntimeAPI } from '@mr-tick/application'
import type { IAddonEventsAPI, IRegistry } from '@mr-tick/sdk'
import type { ISystemEvents } from '@mr-tick/shared/transport'

export class AddonBindingLifetime {
  private active = true
  private generation = 1
  private readonly cleanups = new Set<() => void>()

  constructor(
    public readonly bindingKey: string,
    private readonly parentLifetime: AddonLifetime,
  ) {}

  public isActive(): boolean {
    return this.active && this.parentLifetime.isActive()
  }

  public getGeneration(): number {
    return this.generation
  }

  public isCurrentGeneration(generation: number): boolean {
    return this.isActive() && this.generation === generation
  }

  public startNextGeneration(): number {
    this.cleanups.forEach((cleanup) => cleanup())
    this.cleanups.clear()
    this.active = true
    this.generation += 1
    return this.generation
  }

  public track(cleanup: () => void): () => void {
    return this.trackForGeneration(this.generation, cleanup)
  }

  public trackForGeneration(
    expectedGeneration: number,
    cleanup: () => void,
  ): () => void {
    if (!this.isCurrentGeneration(expectedGeneration)) {
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

  public stop(): void {
    this.active = false
    this.cleanups.forEach((cleanup) => cleanup())
    this.cleanups.clear()
  }

  public stopIfGeneration(expectedGeneration: number): void {
    if (this.generation === expectedGeneration) {
      this.stop()
    }
  }

  public dispose(): void {
    this.stop()
  }

  public guardAsync<T>(
    operation: (generation: number) => Promise<T>,
  ): Promise<T | undefined> {
    const capturedGen = this.generation
    if (!this.isCurrentGeneration(capturedGen)) {
      return Promise.resolve(undefined)
    }
    return operation(capturedGen).then((result) => {
      if (!this.isCurrentGeneration(capturedGen)) {
        return undefined
      }
      return result
    })
  }

  public events(events: IAddonEventsAPI): IAddonEventsAPI {
    return new ScopedBindingEvents(events, this, this.generation)
  }

  public eventsForGeneration(
    events: IAddonEventsAPI,
    expectedGeneration: number,
  ): IAddonEventsAPI {
    return new ScopedBindingEvents(events, this, expectedGeneration)
  }
}

class ScopedBindingEvents implements IAddonEventsAPI {
  constructor(
    private readonly events: IAddonEventsAPI,
    private readonly bindingLifetime: AddonBindingLifetime,
    private readonly expectedGeneration: number,
  ) {}

  public on<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): () => void
  public on<T = void>(channel: string, handler: (data: T) => void): () => void
  public on(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): () => void {
    if (!this.bindingLifetime.isCurrentGeneration(this.expectedGeneration)) {
      return () => {}
    }
    const capturedGeneration = this.expectedGeneration
    const guardedHandler = (data: ISystemEvents[keyof ISystemEvents]) => {
      if (!this.bindingLifetime.isCurrentGeneration(capturedGeneration)) {
        return
      }
      handler(data)
    }
    return this.bindingLifetime.trackForGeneration(
      capturedGeneration,
      this.events.on(channel, guardedHandler),
    )
  }

  public emit<K extends keyof ISystemEvents>(
    event: K,
    payload: ISystemEvents[K],
  ): void
  public emit<T = void>(channel: string, payload?: T): void
  public emit(
    channel: string,
    payload?: ISystemEvents[keyof ISystemEvents],
  ): void {
    if (this.bindingLifetime.isCurrentGeneration(this.expectedGeneration)) {
      this.events.emit(channel, payload)
    }
  }
}

/** Tracks resources contributed through the host by addon and by binding. */
export class AddonLifetime {
  private active = true
  private readonly cleanups = new Set<() => void>()
  private readonly bindings = new Map<string, AddonBindingLifetime>()

  public isActive(): boolean {
    return this.active
  }

  public static buildBindingKey(
    workspaceId: string,
    connectionInstanceId: string,
    capabilityId?: string,
  ): string {
    if (capabilityId !== undefined && capabilityId.trim().length > 0) {
      return `${workspaceId}:${connectionInstanceId}:${capabilityId}`
    }
    return `${workspaceId}:${connectionInstanceId}`
  }

  public binding(
    workspaceId: string,
    connectionInstanceId: string,
    capabilityId?: string,
  ): AddonBindingLifetime {
    return this.getBinding(
      AddonLifetime.buildBindingKey(
        workspaceId,
        connectionInstanceId,
        capabilityId,
      ),
    )
  }

  public findScopedBinding(
    workspaceId: string,
    connectionInstanceId: string,
    capabilityId?: string,
  ): AddonBindingLifetime | undefined {
    return this.findBinding(
      AddonLifetime.buildBindingKey(
        workspaceId,
        connectionInstanceId,
        capabilityId,
      ),
    )
  }

  public getBinding(bindingKey: string): AddonBindingLifetime {
    const existing = this.bindings.get(bindingKey)
    if (existing !== undefined) {
      return existing
    }
    const created = new AddonBindingLifetime(bindingKey, this)
    this.bindings.set(bindingKey, created)
    return created
  }

  public findBinding(bindingKey: string): AddonBindingLifetime | undefined {
    return this.bindings.get(bindingKey)
  }

  public stopBinding(bindingKey: string): void {
    const existing = this.bindings.get(bindingKey)
    if (existing !== undefined) {
      existing.dispose()
      this.bindings.delete(bindingKey)
    }
  }

  public stopConnectionBindings(
    workspaceId: string,
    connectionInstanceId: string,
  ): void {
    const baseKey = `${workspaceId}:${connectionInstanceId}`
    const prefix = `${baseKey}:`
    for (const [key, binding] of Array.from(this.bindings.entries())) {
      if (key === baseKey || key.startsWith(prefix)) {
        binding.dispose()
        this.bindings.delete(key)
      }
    }
  }

  public stopWorkspaceCapabilityBindings(
    workspaceId: string,
    capabilityId: string,
  ): void {
    const wsPrefix = `${workspaceId}:`
    const capSuffix = `:${capabilityId}`
    for (const [key, binding] of this.bindings.entries()) {
      if (key.startsWith(wsPrefix) && key.endsWith(capSuffix)) {
        binding.stop()
      }
    }
  }

  public track(cleanup: () => void): () => void {
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

  public dispose(): void {
    this.active = false
    this.bindings.forEach((binding) => binding.dispose())
    this.bindings.clear()
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.clear()
  }

  public availability(runtime: ICoreRuntimeAPI): ICoreRuntimeAPI {
    return {
      getState: () => runtime.getState(),
      onStateChanged: (listener) => {
        if (!this.active) return () => {}
        return this.track(runtime.onStateChanged(listener))
      },
    }
  }

  public registry<T extends { id: string }>(
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

  public events(events: IAddonEventsAPI): IAddonEventsAPI {
    return new ScopedAddonEvents(events, this)
  }
}

class ScopedAddonEvents implements IAddonEventsAPI {
  constructor(
    private readonly events: IAddonEventsAPI,
    private readonly lifetime: AddonLifetime,
  ) {}

  public on<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): () => void
  public on<T = void>(channel: string, handler: (data: T) => void): () => void
  public on(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): () => void {
    if (!this.lifetime.isActive()) return () => {}
    return this.lifetime.track(this.events.on(channel, handler))
  }

  public emit<K extends keyof ISystemEvents>(
    event: K,
    payload: ISystemEvents[K],
  ): void
  public emit<T = void>(channel: string, payload?: T): void
  public emit(
    channel: string,
    payload?: ISystemEvents[keyof ISystemEvents],
  ): void {
    if (this.lifetime.isActive()) this.events.emit(channel, payload)
  }
}
