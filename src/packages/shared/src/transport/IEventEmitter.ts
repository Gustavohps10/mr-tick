/**
 * Interface genérica para Emissores de Eventos.
 * O parâmetro TEvents deve ser um objeto onde as chaves são os nomes dos eventos
 * e os valores são os tipos dos payloads.
 */
import type { ISystemEvents } from './ISystemEvents'

export interface IEventEmitter<TEvents extends object = ISystemEvents> {
  on<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): () => void

  once<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void

  off<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void
}
