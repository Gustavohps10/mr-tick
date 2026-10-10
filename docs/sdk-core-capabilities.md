# SDK: consultas do Core, escopo e lifecycle

Esta entrega complementa [timer, apontamentos e sugestões](sdk-local-runtime.md). Os contratos públicos pertencem à Application e são reexportados pelo SDK; o addon importa somente `@mr-tick/sdk`. O host implementa adaptadores. O addon não recebe HostBridge, IPC, repositórios, configurações de outros addons ou documentos RxDB.

## Organização do contexto

`AddonContext` possui somente `core`, `contributions` e `host`:

- `core`: runtime, workspaces, connections, tasks, metadata, timer e timeEntries. Os contratos são definidos na Application; o SDK os reexporta.
- `contributions`: commands, menus, settings, dataSources e themes. São registros pertencentes ao addon.
- `host`: events, notifications, vault e oauth. São facilidades fornecidas pelo host.

As interfaces públicas dessas capacidades usam o padrão `I…API`. As pastas do SDK espelham os grupos em `contracts/core`, `contracts/contributions` e `contracts/host`, com cada capacidade em sua própria pasta. `IRegistry<T>` continua sendo o contrato genérico de registro, utilizado pelas APIs de contribuição.

O cofre é chamado `vault`: `IAddonVaultAPI` é o contrato público e `AddonScopedVault` sua implementação por addon/escopo. `ICredentialsVault` e `KeytarCredentialsVault` representam a porta e o backend do chaveiro. As chaves persistidas anteriores continuam válidas.

Para migrar: `context.timer` e `context.timeEntries` passam a `context.core.*`; registros passam a `context.contributions.*`; eventos, notificações e OAuth passam a `context.host.*`; `context.storage` passa a `context.host.vault`. Renomeie também os imports de interfaces; não há aliases do contrato antigo.

A identidade do addon permanece interna ao host: namespace, cofre e autoria são aplicados pelo contexto recebido. O addon consulta `core.connections` para obter a identidade do datasource da conexão selecionada.

## Capacidades disponíveis

| API | Resultado |
| --- | --- |
| `context.core.workspaces.list()` / `get(workspaceId)` | Identidade, nome e estado dos workspaces |
| `context.core.connections.list(workspaceId)` / `get(scope)` | Workspace, instância, datasource e estado; sem credenciais/configuração |
| `context.core.tasks.get(reference)` | Snapshot local da tarefa; referência contém workspace, conexão e ID puro da origem |
| `context.core.tasks.list({ workspaceId, connectionInstanceId, limit, search? })` | Até 100 tarefas, ordenadas pelo ID da origem ascendente; `hasMore` informa truncamento |
| `context.core.metadata.get(scope)` | Atividades, estados e demais metadados locais; `lastPulledAt` indica a última leitura remota |
| `context.core.runtime.getState()` / `onStateChanged(listener)` | Disponibilidade do executor e unsubscribe |

As capacidades de dados retornam `Either<AppError, T>`. `CoreTask` usa datas ISO 8601, não expõe chaves compostas nem estado interno da replicação. `search` procura um trecho literal do título ou ID, sem distinguir maiúsculas/minúsculas. `limit` é obrigatório, inteiro, de 1 a 100. Não há paginação do histórico nesta entrega.

O cache já aberto pelo runtime é a única fonte dessas consultas. A leitura não abre storage, chama providers, conecta datasource nem dispara `forceSync`. O estado de conexão descreve a configuração persistida, não a saúde atual do provedor. Uma conexão desconectada ainda pode ter dados locais. A leitura não promete que o cache está atualizado. Workspace novo pode exigir inicialização por um fluxo de configuração/sync existente antes de ficar disponível.

Falhas distintas: `WORKSPACE_NOT_FOUND` / `CONNECTION_NOT_FOUND` / `TASK_NOT_FOUND` (404), `CORE_CACHE_UNAVAILABLE` / `CORE_METADATA_UNAVAILABLE` (503), parâmetros inválidos (422), metadados duplicados (`CORE_METADATA_AMBIGUOUS`, 409) e erros de leitura preservados pelo adaptador. Uma coleção de tarefas disponível e vazia retorna uma página vazia; metadados disponíveis com listas vazias continuam sendo um snapshot válido.

## Vault e configurações

`context.host.vault.get(scope, key)`, `set(scope, key, value)` e `delete(scope, key)` recebem escopo explícito e retornam `Either`. O escopo é `{ kind: 'workspace', workspaceId }` ou `{ kind: 'addon' }`. O addon é sempre o proprietário definido pelo host; não existe parâmetro para acessar outro addon.

```ts
const scope: AddonVaultScope = { kind: 'workspace', workspaceId }
const saved = await context.host.vault.set(scope, 'channelId', channelId)
if (saved.isFailure()) return saved.forwardFailure()
const channel = await context.host.vault.get(scope, 'channelId')
if (channel.isFailure()) return channel.forwardFailure()
```

A seleção da UI não participa dessas chamadas. A tela de configurações passa o mesmo escopo na leitura, gravação e chave do cache da query. Ao trocar workspace, o formulário é remontado; uma gravação em andamento continua no escopo capturado antes da troca. Ações da tela recebem `workspaceId` explicitamente quando há workspace.

As chaves existentes `ws_<workspaceId>_config` são preservadas no chaveiro. O escopo global usa `addon_config`. Escritas de vault e configurações compartilham uma fila por addon/escopo para evitar perda em atualizações concorrentes. Registros inválidos retornam falha; não são sobrescritos ou apagados automaticamente. Valores escalares antigos de configurações são preservados. `get` retorna `null` para chave ausente e falha para valor existente que não seja string.

## Ativação e recuperação

`activate` registra providers e contribuições e retorna. Não aguarde prontidão dentro dele: o bootstrap do executor depende desses providers. `onStateChanged` informa imediatamente o estado atual e depois mudanças (`starting`, `ready`, `restarting`, `closed`). Um consumidor iniciado mais tarde recebe o estado atual; o listener não é um log durável.

```ts
activate(context: AddonContext): void {
  context.core.runtime.onStateChanged((state) => {
    if (state !== 'ready') return
    // Habilite seu consumidor. Evite duplicar servidores/jobs em cada recuperação.
  })
  // Registre aqui seu datasource, se houver.
}
```

`ready` significa que o executor aceita requisições, não que todos os providers terminaram o pull. Chamadas durante indisponibilidade retornam 503. Reload invalida as requisições pendentes da geração anterior; o addon precisa repetir consultas. Para repetir uma escrita, preserve a mesma identidade de operação e o mesmo conteúdo, conforme o contrato de timer/apontamentos. Sucesso local não significa confirmação remota.

Na desativação e em falha parcial de ativação, o host remove comandos, sidebar, temas, timerbar, settings, datasource e listeners registrados por aquele contexto, inclusive os listeners de disponibilidade. O addon deve fechar seus próprios sockets, cancelar jobs e liberar clientes em `deactivate`; o host não descobre recursos arbitrários. A disponibilidade não cancela automaticamente código assíncrono já iniciado pelo addon.

Comandos são registrados no namespace `<addonId>:<commandId>`. Dentro do addon, `commands.execute` recebe o ID local. A exceção explícita é o comando nativo `theme:set`, que resolve o ID local do tema no namespace do próprio addon. `executeAction` recebe addon e ID local da ação, resolvendo somente comandos desse proprietário. `executeCommand` recebe o ID qualificado; aliases antigos funcionam somente quando são unívocos. IDs idênticos entre addons não sobrescrevem handlers. Sidebar e temas recebem namespace pelo host; `getItems` da registry entregue ao addon retorna apenas suas contribuições. Seleção antiga de tema é resolvida quando seu proprietário é unívoco. Timerbar mantém a regra existente de um item por addon.

Eventos públicos garantidos: `timer:start`, `timer:pause`, `timer:resume`, `timer:stop`, `timer:update` e `workspace:changed`. São projeções transitórias. Não há promessa de tick por segundo, eventos de apontamentos, eventos de idle ou replay de eventos. Leia o estado explicitamente quando precisar recuperá-lo.

## Exemplo e compatibilidade

[CoreSuggestionAddon](../src/apps/sdk/src/examples/CoreSuggestionAddon.ts) mostra a consulta de tarefa/metadados e criação de sugestão com tarefa e atividade explicitamente escolhidas. Ele é verificado pelo typecheck. A fixture empacotada `datasource-fake` exercita o mesmo caminho pelo SDK distribuído no E2E, incluindo persistência real da sugestão.

Esta evolução rompe o contrato antigo do cofre e torna os registros de comandos/contribuições pertencentes ao addon. Recompile addons externos e declare o intervalo de SDK validado no manifesto. O CLI usa a versão do SDK distribuído para gerar a dependência e `requiredApiVersion`; não usa versões fixas antigas. O changeset prepara a publicação pelo CI, sem alterar versões manualmente.

Analytics, MCP, HTTP/REST, licenciamento Plus, sessões paralelas, CRUD de tarefas e migração de storage/main continuam fora desta entrega. Addons executam código confiável no main, sem sandbox nem autorização granular de dados. As capacidades são portas para evolução futura, não uma promessa de isolamento de código não confiável.
