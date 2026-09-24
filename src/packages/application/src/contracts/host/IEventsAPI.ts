import type { ISystemEvents } from '@mr-tick/shared/transport'

export interface IEventsAPI<TEvents extends object = ISystemEvents> {
  on<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): () => void
  on<T = void>(channel: string, handler: (data: T) => void): () => void

  once?<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void
  once?<T = void>(channel: string, handler: (data: T) => void): void

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void
  emit<T = void>(channel: string, payload?: T): void

  off?<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void
  off?<T = void>(channel: string, handler: (data: T) => void): void
}
