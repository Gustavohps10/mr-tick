# SDK: Observadores Configuráveis e Formulários Declarativos

Este guia documenta os contratos públicos do `@mr-tick/sdk` para o desenvolvimento de **Observadores Configuráveis** (*Configurable Observers*), como o repositório externo `discord-addon` e fixtures neutras de automação.

Os observadores são extensões com a capability `watcher` que capturam sinais do ambiente de trabalho (chamadas de voz, presenças em salas, commits ou eventos externos) e os convertem em **sugestões locais de apontamento**, preservando a soberania do usuário e a integridade do Core.

Para consultar os contratos fundamentais de lifecycle e escopo do SDK, veja também [SDK Core Capabilities](sdk-core-capabilities.md) e o [README do SDK](../src/apps/sdk/README.md).

---

## 1. Princípios Arquiteturais e Modelo de Execução

1. **Soberania do Usuário (Local-First):** O observador nunca grava apontamentos remotos diretamente nem inicia o timer sem consentimento. Ele produz **sugestões locais**, permitindo que o usuário revise, edite ou confirme antes do envio.
2. **Desacoplamento de Provedor:** O Core e os observadores operam exclusivamente através das interfaces agnósticas do SDK. A vinculação de tarefas e autoria independe de o backend ser Redmine, Jira ou um provedor simulado de testes.
3. **Contratos Funcionais:** Todas as operações que possam falhar retornam `Either<AppError, T>`. Lançamento de exceções não tratadas é terminantemente proibido.
4. **Isolamento de Origem e Destino no Mesmo Workspace:** Nesta versão, a tarefa de destino apontada pelo observador deve pertencer obrigatoriamente ao **mesmo workspace** da conexão observadora (podendo ser conexões distintas dentro desse workspace). Sugestões *cross-workspace* são rejeitadas.

---

## 2. Configurações Declarativas de Settings (`contributions.settings`)

Os observadores expõem suas configurações através da API canônica `context.contributions.settings.register`:

```typescript
context.contributions.settings.register(
  () => getSchema(),
  {
    optionsProviders: {
      'floors-provider': (request) => resolveFloors(request),
      'rooms-provider': (request) => resolveRooms(request),
    },
    operationalListProviders: {
      'unassigned-sessions-provider': async (request) => resolveUnassignedSessions(request),
    },
    operationalActionHandlers: {
      'assign-task': async (request) => handleAssignTask(request),
      'dismiss-session': async (request) => handleDismissSession(request),
    },
    onValidate: (request) => handleValidateSettings(request),
    onApply: (ctx) => handleApplySettings(ctx),
  },
)
```

### 2.1. Coleções de Regras (`AddonSettingsCollectionField`)

Regras repetíveis (ex: alocações de salas, canais monitorados) utilizam o tipo `collection`:

```typescript
const rulesCollection: AddonSettingsCollectionField = {
  id: 'channelRules',
  type: 'collection',
  label: 'Regras de Canais de Voz',
  itemLabel: 'Regra de Canal',
  enabledFieldId: 'active', // Opcional: vincula a um campo booleano que comanda o toggle do item
  allowReorder: true,
  allowDuplicate: true,
  fields: [
    {
      id: 'channelId',
      type: 'select',
      label: 'Canal de Voz',
      required: true,
      source: {
        kind: 'dynamic',
        providerId: 'channels-provider',
        dependsOn: [
          {
            base: 'parent',
            address: { path: [{ kind: 'field', fieldId: 'guildId' }] },
          },
        ],
      },
    },
    {
      id: 'targetTask',
      type: 'task-reference',
      label: 'Tarefa de Destino',
      required: true,
    },
    {
      id: 'active',
      type: 'boolean',
      label: 'Regra Ativa',
      defaultValue: true,
    },
  ],
}
```

> [!NOTE]
> **Identificadores em Coleções:**
> O addon é livre para nomear seus campos internos como desejar, inclusive utilizando identificadores como `enabled` ou `order`. O Core **não reserva nem presume** esses nomes sem declaração explícita no schema.
> A propriedade `enabledFieldId` é **opcional** e destina-se a coleções que possuem um toggle de ativação/desativação por item. Coleções puras de mapeamento não precisam declarar `enabledFieldId`.

---

### 2.2. Resolução Contextual de Dependências (`dependsOn`)

Campos dinâmicos (`select` ou `multi-select`) que dependem de seleções prévias declaram sua dependência usando `base: 'parent'` ou `base: 'root'`:

- **`base: 'parent'`:** Resolve o endereço relativo ao objeto ou escopo imediato que contém o campo. Isso inclui tanto um item individual de uma `collection` quanto um `group` aninhado, garantindo isolamento entre itens distintos.
- **`base: 'root'`:** Resolve a partir do snapshot completo de valores do escopo ativo (para campos globais de configuração).

```typescript
// No handler do provider dinâmico:
function resolveRooms(
  request: AddonResolveOptionsRequest,
): Either<AppError, AddonResolveOptionsResponse> {
  // Extrai o valor do campo pai imediato 'floor' resolvido pelo runtime da UI
  const floorValue = request.dependencies.find((dep) => {
    const last = dep.address.path[dep.address.path.length - 1]
    return last?.kind === 'field' && last.fieldId === 'floor'
  })?.value

  if (!floorValue) {
    return Either.success({
      availability: 'empty',
      options: [],
      reason: 'Selecione um Andar para listar as salas disponíveis.',
      hasMore: false,
    })
  }

  return Either.success({
    availability: 'available',
    options: [
      { label: 'Sala 101 - Foco Individual', value: 'room-101' },
      { label: 'Sala 102 - Daily e Alinhamento', value: 'room-102' },
    ],
    hasMore: false,
  })
}
```

---

### 2.3. Seletor de Tarefa de Destino (`task-reference`)

O campo `task-reference` permite ao usuário escolher uma tarefa associada a uma conexão no mesmo workspace:

```typescript
export interface AddonTaskReferenceValue {
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly taskId: string
  readonly metadataValues?: Record<string, string | number | boolean>
}
```

> [!IMPORTANT]
> **Regra de Mesmo Workspace:**
> O `workspaceId` da tarefa de destino deve ser estritamente igual ao `workspaceId` da conexão do observador. Conexões distintas são suportadas desde que pertençam ao mesmo workspace.
> O observador nunca deve inventar tarefas com IDs vazios (`""`). Quando um sinal observado não tiver correspondência com as regras ativas, o evento deve ser registrado como pendência na lista operacional.

---

### 2.4. Lista Operacional e Ações Manuais (`operational-list`)

Quando um sinal não possui regra correspondente ou quando a autoria não pode ser resolvida imediatamente, o addon registra o evento em sua lista operacional de pendências:

```typescript
const pendingList: AddonSettingsOperationalListField = {
  id: 'pendingAllocations',
  type: 'operational-list',
  label: 'Sessões Não Identificadas',
  providerId: 'unassigned-sessions-provider',
  actions: [
    {
      id: 'assign-task',
      label: 'Associar Tarefa e Aceitar',
      variant: 'default',
      fields: [
        {
          id: 'targetTask',
          type: 'task-reference',
          label: 'Tarefa de Destino',
          required: true,
        },
      ],
    },
    {
      id: 'dismiss',
      label: 'Descartar',
      variant: 'destructive',
    },
  ],
}
```

---

## 3. Armazenamento Host Canônico (`context.host.storage`)

Para persistir pendências, journals de eventos e identificadores entre reinicializações do aplicativo, o addon utiliza exclusivamente a API canônica `context.host.storage`.

> [!WARNING]
> **Proibição de I/O Direto de Arquivo:**
> É expressamente proibido ao addon utilizar `node:fs` para manter arquivos paralelos ou bancos de dados próprios. Todo o armazenamento persistente deve transitar por `context.host.storage`.

### 3.1. Chaves Granulares e Paginação por Cursor

Cada registro operacional deve ser persistido sob sua chave individual (ex: `session:${itemId}`). É proibido agregar coleções inteiras em um único JSON monolítico:

```typescript
// 1. Gravar registro individual
await context.host.storage.set(
  scope,
  `session:${session.itemId}`,
  JSON.stringify(session),
)

// 2. Consultar por chave específica
const res = await context.host.storage.get(scope, `session:${session.itemId}`)

// 3. Listar de forma paginada por prefixo (paginação baseada em cursor)
const page = await context.host.storage.list(scope, {
  prefix: 'session:',
  limit: 20,
  cursor: nextCursor,
})

// 4. Excluir ao resolver ou descartar
await context.host.storage.delete(scope, `session:${session.itemId}`)
```

O host implementa esta interface sobre **SQLite nativo** no Core, realizando filtros por prefixo e paginação por cursor diretamente no banco SQL (Regra 34). A API não expõe offsets numéricos, operando com `hasMore` e `nextCursor`.

---

## 4. Ciclo de Vida, Validação e Monotonia de Revisão (`onApply`)

É fundamental distinguir **Saved** de **Applied**:
- **`onValidate` e Save:** A interface valida o schema e grava os dados no repositório de settings do host.
- **`onApply`:** O runtime invoca o addon para aplicar as novas regras ativas. O addon só deve atualizar seu estado interno e confirmar a revisão se a sincronização em runtime for bem-sucedida.

```typescript
// Helper de endereço canônico para compor a identidade completa de cada escopo
function getScopeKey(scope: AddonVaultScope): string {
  switch (scope.kind) {
    case 'workspace':
      return `workspace:${scope.workspaceId}`
    case 'connection':
      return `connection:${scope.workspaceId}:${scope.connectionInstanceId}`
    case 'capability':
      return `capability:${scope.workspaceId}:${scope.connectionInstanceId}:${scope.capabilityId}`
    case 'addon':
      return 'addon'
  }
}

// Mantém as revisões aplicadas chaveadas pela identidade COMPLETA de cada escopo
// (dois workspaces possuem o mesmo kind 'workspace', mas identidades e revisões independentes)
private readonly appliedRevisions = new Map<string, number>()

onApply: (ctx: AddonSettingsApplyContext): Either<AppError, void> => {
  const scopeKey = getScopeKey(ctx.scope)
  const currentAppliedRevision = this.appliedRevisions.get(scopeKey) ?? 0

  // Rejeita revisões estritamente obsoletas para a identidade completa deste escopo
  if (ctx.revision <= currentAppliedRevision) {
    return Either.success()
  }

  // Sincroniza regras internas primeiro
  const syncResult = this.syncAppliedRules(ctx.values)
  if (syncResult.isFailure()) {
    // Retorna o erro original; a revisão aplicada deste escopo NÃO é atualizada
    return syncResult.forwardFailure()
  }

  // Confirma aplicação com sucesso após validação do runtime para o escopo
  this.appliedRevisions.set(scopeKey, ctx.revision)
  return Either.success()
}
```

- **Reaplicação (`reapplySettings`):** O Core pode solicitar a reaplicação da mesma revisão SALVA (inclusive se estiver em estado *saved-but-failed*, permitindo reprocessamento após reconexão ou troca de workspace ativo).
- **Sem Atomicidade Falsa:** Se ocorrer falha em `onApply`, o erro original é retornado à UI para que o usuário seja informado de que a configuração foi salva mas não pôde ser ativada no runtime.

---

## 5. Criação Canônica de Sugestões e Resolução de Autoria

Para emitir uma sugestão local ao final de uma sessão observada, o addon deve congelar o intervalo observado e resolver a tarefa, metadados e autoria na conexão de destino:

```typescript
// 1. Resolver autor OBRIGATORIAMENTE via membersProvider da conexão de destino
const authorResult = await context.core.members.getCurrentUser({
  workspaceId: targetTask.workspaceId,
  connectionInstanceId: targetTask.connectionInstanceId,
})

if (authorResult.isFailure()) {
  // NUNCA criar sugestão sem autor; mantenha a captura como pendência na lista operacional
  return authorResult.forwardFailure()
}

// 2. Resolver tarefa na conexão de destino
const taskResult = await context.core.tasks.get(targetTask)
if (taskResult.isFailure()) {
  return taskResult.forwardFailure()
}

// 3. Resolver metadados e localizar explicitamente a atividade na conexão de destino
const metadataResult = await context.core.metadata.get(targetTask)
if (metadataResult.isFailure()) {
  return metadataResult.forwardFailure()
}

const activity = metadataResult.success.values.activities.find(
  (item) => item.id === targetActivityId,
)
if (!activity) {
  return Either.failure(AppError.ValidationError('ACTIVITY_NOT_FOUND'))
}

// 4. Emitir sugestão com intervalo observado congelado, identidade de operação estável e metadata de provenance
const result = await context.core.timeEntries.createSuggestion(
  targetTask.workspaceId,
  {
    connectionInstanceId: targetTask.connectionInstanceId,
    dataSourceId: taskResult.success.dataSourceId,
    taskId: targetTask.taskId,
    userId: authorResult.success.id,
    userName: authorResult.success.name,
    activityId: activity.id,
    activityName: activity.name,
    comments: `Sessão observada: #${channelName} (${session.durationMinutes} min)`,
    timeSpentSeconds: session.durationSeconds,
    startDate: session.startedAt, // Intervalo congelado na captura, NUNCA Date.now() em retry
    endDate: session.endedAt,
    source: 'addon',
    addonSource: {
      id: 'mistertick-discord',
      name: 'Discord Presence Addon',
      metadata: {
        channelId: session.channelId,
        guildId: session.guildId,
        ruleId: session.matchedRuleId,
        appliedRevision: session.appliedRevision,
      },
    },
  },
  {
    commandId: session.operationId.commandId,
    entryId: session.operationId.entryId,
  },
)
```

> [!IMPORTANT]
> **Resolução de Autoria e Provenance:**
> A autoria do apontamento deve ser **sempre** o usuário conectado no DataSource de destino (`core.members.getCurrentUser`), e **nunca** a identidade da conta do observador (ex: ID numérico do Discord). Se o membro não estiver autenticado, a emissão da sugestão é bloqueada.
>
> Para a implementação de referência completa e tipada com validações de mesmo workspace, desacoplamento de clock e testes de idempotência, consulte [`CoreSuggestionAddon.ts`](../src/apps/sdk/src/examples/CoreSuggestionAddon.ts).

---

## 6. Prevenção de Sobreposição (*Overlap Detection*)

Ao aceitar uma sugestão, a UI e o Core consultam a existência de sobreposição temporal com outros apontamentos ou com o **timer ativo** antes de confirmar a gravação. O observador apenas emite a sugestão; a orquestração e confirmação de sobreposição pertencem à camada de interface e ao runtime local.

- **Aceite Canônico Exclusivo:** O aceite de sugestões ocorre **exclusivamente** via ação `acceptSuggestion`. É proibido transicionar o status de uma sugestão para `finished` via edição direta de registro (`editRecord`) — o Core aplica um guard central no runtime bloqueando essa transição com `SUGGESTION_REQUIRES_EXPLICIT_ACCEPTANCE`.
- **Consulta de Sobreposição (Host / Renderer):** Antes de solicitar a transição ou abrir o diálogo de confirmação, a UI/Core consulta o runtime local através da API canônica de requisição:

```typescript
// Consulta realizada pelo host/renderer via ILocalRuntimeAPI.request:
const response = await runtime.request({
  action: 'detectOverlaps',
  workspaceId: targetTask.workspaceId,
  start: suggestion.startDate,
  end: suggestion.endDate,
  excludeEntryId: suggestion.id,
})

if (response.ok && response.value.overlap && response.value.overlap.hasOverlap) {
  const { conflictToken, conflicts } = response.value.overlap
  // Apresenta o diálogo de confirmação com as faixas em conflito
  // O aceite subsequente em acceptSuggestion exige o envio explícito do conflictToken
}
```

- **Revisão e Confirmação de Token:** O aceite com sobreposição exige o envio explícito do `conflictToken` obtido na resposta do runtime. Se os apontamentos subjacentes forem alterados concorrentemente antes da confirmação, o token torna-se obsoleto (*stale*), exigindo nova consulta e reavaliação pelo usuário.

---

## 7. Fluxo de Desenvolvimento, Teste e Publicação

- **Repositórios Externos:** Addons independentes como o `discord-addon` residem em seus próprios repositórios e utilizam o portal local (`portal:../metric/src/apps/sdk`) durante o desenvolvimento.
- **Fixtures Internas:** Addons de teste como `fake-watcher-for-tests` e `datasource-alpha-for-tests` residem em `src/dev-addons/` no monorepo e são vinculados no ambiente de testes Electron via junctions no diretório isolado do worker.
- **Sem Bump Manual:** É terminantemente proibido editar campos `"version"` em `package.json` ou manipular `CHANGELOG.md` manualmente. A publicação e controle semântico seguem estritamente o pipeline de **Changesets** (`.changeset/`) e a CLI do Mr. Tick.
