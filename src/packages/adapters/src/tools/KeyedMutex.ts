import { IKeyedMutex } from '@mr-tick/application'

/**
 * Implementação em memória de {@link IKeyedMutex}.
 *
 * Mantém uma cadeia de promessas por chave: cada operação só começa quando a
 * anterior da mesma chave termina (com sucesso ou não). A cadeia é descartada
 * quando fica ociosa, então o mapa não cresce com o tempo.
 *
 * O escopo é o processo atual. Deve ser registrada como singleton para que
 * todas as janelas/escopos atendidos pelo mesmo processo compartilhem a fila.
 */
export class KeyedMutex implements IKeyedMutex {
  private readonly tails = new Map<string, Promise<void>>()

  public runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key)
    const execution = previous
      ? previous.then(operation, operation)
      : operation()

    const tail = execution.then(
      () => undefined,
      () => undefined,
    )
    this.tails.set(key, tail)

    tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })

    return execution
  }
}
