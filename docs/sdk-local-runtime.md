# SDK e runtime local

O SDK compartilha contratos por capacidade com Application. O host fornece a implementação de `AddonContext.timeEntries` e `AddonContext.timer`, encaminhando comandos ao executor do workspace. A API do datasource remoto continua separada: pull/push acessa o provedor; a capacidade local preserva registros, sugestões, timer e estados de sincronização.

## Mudança de contrato

Esta mudança é intencionalmente incompatível com a API anterior. Addons devem atualizar o SDK, recompilar e ajustar suas chamadas. Não há adaptador legado para comandos sem workspace ou identidade. O changeset registra a intenção de nova versão; sua criação não publica o pacote.

Toda operação identifica `workspaceId`. Uma escrita recebe `LocalOperationIdentity`, com `commandId` da operação e `entryId` do apontamento. Crie esses identificadores antes da chamada e reutilize ambos ao repetir a mesma operação depois de timeout ou reload. Use um novo `commandId` para uma operação diferente. O host rejeita a reutilização de um comando com conteúdo diferente.

```ts
const operation = {
  commandId: crypto.randomUUID(),
  entryId: crypto.randomUUID(),
}

const created = await context.timeEntries.create(
  workspaceId,
  {
    taskId,
    connectionInstanceId,
    dataSourceId,
    activityId,
    timeSpentSeconds: 3600,
    comments: 'Documentação da tarefa',
  },
  operation,
)

if (created.isFailure()) return created.forwardFailure()
```

Os valores de contexto vêm da seleção/configuração explícita do addon. O host valida workspace, instância e datasource e preenche a identidade autenticada do membro. Um apontamento puramente local pode omitir conexão e datasource; ele não é enviado a um provedor. O host define a origem do addon, impedindo que o caller atribua a criação a outro addon.

Para timer, `start(workspaceId, payload, operation)` cria/inicia o apontamento. `pause`, `resume` e `stop` recebem workspace e uma identidade com o mesmo `entryId`, mas novos `commandId` para cada transição. `getActiveEntry(workspaceId)` lê o estado. O timer é persistido por journal; ticks e tray são projeções. `HostBridge.timer` não existe como autoridade de negócio.

## Resultado e recuperação

As capacidades retornam `Either<AppError, T>`. Falha local e falha de sincronização remota são estados diferentes. Um commit local não significa que o servidor aceitou o apontamento. Um timeout de transporte também não significa que a operação foi cancelada: repita o mesmo comando com os mesmos IDs para recuperar seu resultado, em vez de criar outro apontamento.

Os recibos persistidos reconhecem operações já aplicadas, inclusive após reconhecimento remoto do documento. Replays não repetem os eventos de commit. Se o caller precisa repetir depois de reiniciar seu próprio processo, ele deve persistir sua identidade de operação; o SDK não a inventa nem guarda por ele.

## Composição atual e limites

No desktop, o executor é um renderer oculto, com o mesmo documento/origem e perfil das janelas visíveis. Ele não monta React. RxDB e IndexedDB continuam no browser; Application contém a coordenação e regras portáveis, enquanto o adaptador browser implementa persistência e replicação.

As janelas visíveis mantêm leitores RxDB para reatividade. As escritas de apontamentos/timer/sugestões e as replicações passam pelo owner. Kanban e automações não fazem parte deste corte. Migrar o executor inteiro ao main ou servir React por REST requer outra composição de storage e um adaptador de leitura para a UI; esta entrega não implementa REST nem MCP.

O addon continua executando código no main e não recebe isolamento forte por sandbox. O SDK publicado empacota seus tipos compartilhados, sem exigir a instalação dos pacotes privados do monorepo.
