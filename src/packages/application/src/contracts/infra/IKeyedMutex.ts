/**
 * Serializa operações assíncronas que compartilham a mesma chave.
 *
 * Existe para fechar a janela "verifica-depois-age" (check-then-act) em
 * operações remotas que não são atômicas, como procurar um registro e criá-lo
 * quando ele não existe. Operações com chaves diferentes executam em paralelo.
 *
 * O escopo da exclusão é definido pela implementação (por exemplo, um único
 * processo). Ela NÃO substitui a idempotência do destino remoto, apenas evita
 * que a mesma operação concorra consigo mesma dentro do seu escopo.
 */
export interface IKeyedMutex {
  runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T>
}
