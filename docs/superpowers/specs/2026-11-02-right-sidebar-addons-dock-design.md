# Especificação Técnica: Trail Menu & Addons Dock no Layout do Workspace

- **Data:** 2026-11-02
- **Escopo:** `@mr-tick/desktop`, `@mr-tick/ui`, `@mr-tick/application`
- **Autor:** Gustavo Henrique & Antigravity

> **Nota de revisão (2026-11-02, Arquiteto de Solução; aprovada pelo Tech Lead):** as seções 1 a 5 preservam a intenção e as decisões já aprovadas. A **§6** consolida a revisão executável com base em inspeção do código real (`ef9846b`), na matriz de consumidores do QA e nas diretrizes de escopo recebidas. Onde houver conflito entre a redação original e a §6, prevalece a §6, com a divergência explicitada em §6.1. As decisões e os ajustes finais estão registrados em §6.11. Nenhum código de produção foi alterado por esta revisão.

---

## 1. Visão Geral e Intenção

Atualmente, o ecossistema Mr. Tick gerencia múltiplos addons e conexões (Redmine, Jira, Fake DB, etc.), porém a interface carecia de um ponto centralizado de controle e observabilidade operacional no layout principal:
1. **Falta de rastreabilidade de falhas no Main Process:** Se um addon no disco falhar durante o `import()`, possuir sintaxe inválida, não exportar a classe padrão ou fugir do contrato de capabilities, o `AddonLoader` apenas emitia logs no terminal do Node.js e retornava `false`. O usuário na UI ficava sem saber por que o addon não carregou.
2. **Acesso rápido a configurações:** Para abrir as configurações de um addon conectado, o usuário precisava navegar por menus profundos ou depender do dropdown do header.
3. **Filtro Global de Conexões:** Usuários com múltiplas contas/conexões (ex: 2 contas do Redmine ou instâncias do Jira) precisavam de um filtro universal que alterasse as consultas de apontamentos, métricas e tarefas de forma consistente عبر query params.
4. **Coexistência com a Ultimate Time Bar:** A barra de tempo flutuante do Mr. Tick pode ser ancorada livremente (topo, base, esquerda, direita). O novo Trail Menu deve ocupar uma coluna fixa e previsível na extremidade direita do grid do workspace sem colidir com a barra de tempo.

---

## 2. Decisões Arquiteturais Aprovadas

1. **Cardinalidade da Barra (Addon vs Conexão):**
   - Cada ícone na barra vertical direita representa um **Addon Instalado** (ex: Redmine, Jira, Discord, ou Addon com Falha de Carga).
   - O clique no ícone abre diretamente o modal de configuração do addon (`openAddonSettingsModal(addon.id)`).
   - Se o addon possuir múltiplas conexões, elas são gerenciadas dentro do modal e listadas na gaveta de diagnóstico.
   - O indicador de status do ícone reflete o pior estado entre suas conexões (se houver 1 erro 401 ou erro técnico, o ícone exibe o badge correspondente).
   - Addons que falharam no carregamento do Main Process aparecem na barra com ícone ⚠️ e abrem o detalhe do erro.

2. **Posicionamento no Grid do Workspace e Relação com a Ultimate Time Bar:**
   - A barra `AddonsTrailBar` (48px de largura) fica fixada na borda externa direita do layout do workspace.
   - Se a `UltimateTimeTracker` estiver configurada para ancorar à direita (`widgetPosition === 'right'`), ela se posiciona adjacente à esquerda do `AddonsTrailBar`, sem sobreposição de cliques.
   - O `AddonsDiagnosticsDrawer` desliza a partir da borda direita como um *Sheet/Drawer* em overlay suave (backdrop blur), sem comprimir ou desmontar o layout central.

3. **Padrão de Comunicação IPC (Push + Pull Reativo):**
   - O `AddonLoader` emite push reativo via `webContents.send('addons:failures-changed')` sempre que ocorrer um erro de import/contrato ou quando um addon for descarregado/recarregado.
   - O Renderer faz a busca inicial via `ipcRenderer.invoke('addons:get-failures')` e mantém o estado sincronizado via escuta de evento, sem nenhum tipo de timer artificial ou polling.

---

## 3. Detalhamento por Camada

### 3.1. Main Process (`src/apps/desktop/src/main/services/addons/loader/AddonLoader.ts`)

#### Novo Modelo de Falha de Carregamento:
> **Revisado na §6.3.** O DTO abaixo cobre apenas 4 causas declaradas e não reflete os caminhos reais de falha de `AddonLoader.loadAndActivateFromDisk`. A versão canônica (10 `reason`, `stage`, `folderPath` ≠ `entryPath`) está em §6.3 e substitui este bloco; os quatro nomes originais permanecem no conjunto final.

```typescript
export interface AddonLoadFailureDTO {
  addonId: string
  folderPath: string
  reason: 'IMPORT_FAILED' | 'INVALID_DEFAULT_EXPORT' | 'CONTRACT_VIOLATION' | 'INITIALIZATION_FAILED'
  technicalMessage: string
  timestamp: number
}
```

#### Alterações no `AddonLoader`:
- Adicionar propriedade `private readonly failedAddons = new Map<string, AddonLoadFailureDTO>()`.
- Em `loadAndActivateFromDisk`:
  - Se `import(fileUrl)` lançar exceção: registrar em `failedAddons` com `IMPORT_FAILED`.
  - Se a exportação padrão não for construtor nem instância válida de Addon: registrar em `failedAddons` com `INVALID_DEFAULT_EXPORT`.
  - Se `activateAddon` falhar: registrar com `INITIALIZATION_FAILED`.
  - Se carregar com sucesso: remover qualquer registro anterior de falha daquele `addonId`.
- Expor método público `public getFailedAddons(): AddonLoadFailureDTO[]` e canal IPC correspondente em `IpcChannels.ts` / `AddonsHandler.ts` (ex: `addons:get-failures`).

---

### 3.2. Renderer / UI (`src/packages/ui/src/`)

#### Novo Componente: `AddonsTrailDock` (`src/packages/ui/src/components/addons-trail-dock/`)
> **Revisado na §6.6.** Nome canônico: `AddonsTrailDock` (diretório) contendo `AddonsTrailBar.tsx` (barra de 48px) e `AddonsDiagnosticsDrawer.tsx` (overlay). O símbolo `openAddonSettingsModal` não existe no código atual; o mecanismo canônico está em §6.6.

- **`AddonsTrailBar.tsx`**: Coluna vertical estreita à direita contendo:
  - Botão superior de diagnóstico geral (📊) com tooltip explicativo.
  - Divisor sutil.
  - Lista vertical de ícones dos addons (com avatar/logo oficial ou fallback de emoji/iniciais).
  - Indicador de status (ponto verde para conectado, ponto âmbar para sincronizando, ponto vermelho/⚠️ para falha de autenticação ou erro de import do main process).
  - Clique no ícone de addon saudável: dispara `openAddonSettingsModal(addon.id)`.
  - Clique no ícone com falha: abre o painel de diagnóstico focado no erro.
- **`AddonsDiagnosticsDrawer.tsx`**: Painel lateral deslizante acionado pelo botão 📊:
  - **Seção de Falhas no Main Process:** Cards destacados em vermelho quando houver itens em `failedAddons`, exibindo a razão (`INVALID_DEFAULT_EXPORT`), o caminho do arquivo compilado e a mensagem técnica detalhada.
  - **Seção de Addons Saudáveis & Módulos:** Lista dos addons ativos com detalhamento de suas capacidades (`timeEntries`, `tasks`, `metadata`, `observers`) e status da última sincronização.
  - **Seção de Filtro Universal:** Checkboxes para ativar/desativar conexões específicas no workspace, com atalho para "Todas as Conexões".

#### Hook de Filtro Global: `useWorkspaceConnectionsFilter.ts`
- Lê e manipula o query param `connections` na rota do workspace (`useSearchParams`).
- Fornece `selectedConnectionIds: string[] | undefined` e função `toggleConnection(id: string)`.
- Exporta utilitário canônico para gerar o seletor RxDB correto para datasources.

---

## 4. Governança e Regras Técnicas (`metric/AGENTS.md`)

1. **Tipagem Estrita Absoluta:** Todos os DTOs (`AddonLoadFailureDTO`, `AddonCapabilityStatusDTO`) 100% tipados, sem `any` ou `unknown`.
2. **Proibição de Adivinhação de Erros:** Erros mapeados estruturadamente no `AddonLoader` com chaves semânticas (`reason`, `technicalMessage`), sem strings ad-hoc soltas com `switch/case` na UI.
3. **Early Return Obrigatório:** Estruturação sem `else`/`else if` nos manipuladores de clique e montagem de componentes.
4. **Respiração de Código:** Espaçamento com 1 linha antes e depois de blocos e declarações.

---

## 5. Critérios de Aceitação

> **Complementados na §6.8** com critérios objetivos por consumidor, IPC, loader e layout. Os critérios abaixo permanecem válidos como visão de produto.

1. **Visibilidade de Falhas:** Se um addon no disco tiver exportação padrão inválida ou erro de sintaxe, ele é listado no Trail Menu com ícone de alerta e detalhamento no painel de diagnóstico.
2. **1-Click Config:** Clicar no ícone de um addon ativo abre diretamente seu modal de configuração.
3. **Filtro Universal:** Marcar/desmarcar conexões no painel altera a URL com `?connections=...` e filtra os dados de apontamentos, métricas e tarefas de forma reativa.
4. **Integridade de Layout:** O Trail Menu fica ancorado à direita sem sobrepor nem empurrar indevidamente a área de trabalho central nem a Ultimate Time Bar.
5. **Build & Qualidade:** `yarn typecheck` e `yarn lint:fix` executados na raiz com 0 erros e testes unitários cobrindo o novo serviço e componentes.

---

## 6. Revisão de Arquitetura — Plano Executável

> Base conferida em `metric` `main` `ef9846b`. Linhas citadas são as observadas na inspeção e podem deslocar durante a implementação; os símbolos citados foram verificados no código.

### 6.1 Divergências entre a redação original e o código real

| # | Redação original | Código real | Decisão canônica |
|---|---|---|---|
| 1 | `AddonsTrailBar` (§2.2) vs `AddonsTrailDock` (§3.2) | nenhum dos dois existe | `AddonsTrailDock/` (diretório) com `AddonsTrailBar.tsx` e `AddonsDiagnosticsDrawer.tsx` |
| 2 | `AddonLoadFailureDTO` com 4 `reason` | `AddonLoader.loadAndActivateFromDisk` tem 8 saídas `return false` + `catch` único (`AddonLoader.ts:1372‑1562`) | 10 `reason` (os 4 originais preservados) + `stage` (§6.3) |
| 3 | `folderPath` descrito como “caminho do arquivo compilado” | `addonFolderPath` é a pasta; o arquivo é `targetEntry` (`:1409‑1430`) | DTO separa `folderPath` e `entryPath` |
| 4 | `invoke` + `webContents.send` sem protocolo | boot carrega addons antes de `openIpcRoutes` e da janela (`main/index.ts:865` vs `:1001`) | snapshot com `revision` (§6.4) |
| 5 | `selectedConnectionIds: string[] \| undefined` | `undefined` e `[]` indistinguíveis (`metrics.tsx:1440`; helpers com `length > 0`) | `ConnectionScope` de 3 estados (§6.2) |
| 6 | “filtra apontamentos, métricas e tarefas” | métricas, backlog e kanban não passam por `useTasksQuery` | 4 famílias de consumidores mapeadas (§6.5) |
| 7 | `openAddonSettingsModal(addon.id)` | símbolo inexistente; `AddonSettingsDialog` é estado local de `addons-manager-view.tsx:1133` | store + host único no `WorkspaceLayout` (§6.6) |
| 8 | sem regra de navegação | `handleRangeChange` apaga todos os searchParams; tabs de layout descartam query | merge + propagação de `location.search` (§6.5.5) |

### 6.2 Contrato canônico de escopo de conexões

#### 6.2.1 Gramática da URL (única e inequívoca)

| URL | Estado | Escopo resolvido |
|---|---|---|
| sem `connections` | `all` | todas as conexões do workspace |
| `connections=all` | `all` | idem (canonicaliza para ausência ao escrever) |
| `connections=none` | `none` | nenhum registro |
| `connections=` (vazio explícito) | `none` | nenhum registro (falha fechada) |
| `connections=A,B` | `ids [A,B]` | subconjunto |
| `connections=A,A,B` | `ids [A,B]` | dedupe + ordenação estável |
| `connections=A,desconhecido` | `ids [A]` após catálogo | no máximo A |
| `connections=desconhecido` | `none` | nunca vira “todas” |
| `connections=none,A` | `none` | mistura de sentinela = falha fechada |

Regras fixas:

1. `all` nunca significa “catálogo vazio”. Catálogo vazio + `all` não retorna dados, mas o estado continua `all`.
2. Enquanto o catálogo carrega, o estado bruto é preservado; a interseção com o catálogo ocorre depois (`isLoadingCatalog`).
3. O filtro é por workspace na URL; `connections` não é transportado para outro workspace.
4. Toda escrita é merge: `setSearchParams` preserva `from`, `to`, `dateRange` e demais chaves.
5. `undefined = todas` e `[] = nenhuma` permanecem apenas como leitura derivada (`selectedIds`), nunca como contrato de consulta. O contrato é o `ConnectionScope`.

#### 6.2.2 Tipos e helpers — dono único

Novo módulo `src/packages/ui/src/lib/connection-scope.ts`:

```ts
export type ConnectionSelection =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'ids'; ids: string[] }

export type ConnectionScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'subset'; ids: string[] }

parseConnectionsParam(raw: string | null): ConnectionSelection
resolveConnectionScope(selection, catalogIds: string[], isLoading): ConnectionScope
serializeConnectionScope(scope: ConnectionScope): string | null
connectionScopeKey(scope: ConnectionScope): string // 'all' | 'none' | 'ids:a|b'
isNoneScope(scope: ConnectionScope): boolean
```

Regra única de seletor, reutilizada por todos os consumidores:

| Escopo | Predicado de conexão | Leitura |
|---|---|---|
| `all` | nenhum | executa |
| `subset` | `connectionInstanceId: { $in: ids }` | executa |
| `none` | — | curto-circuito: não executa consulta e não assina; retorna vazio/zero no formato já existente da função |

Não se depende de `$in: []` (semântica ambígua). `none` é decidido antes da consulta.

#### 6.2.3 Hook

`src/packages/ui/src/hooks/use-workspace-connections-filter.ts`:

```ts
useWorkspaceConnectionsFilter(): {
  selection: ConnectionSelection
  scope: ConnectionScope
  isLoadingCatalog: boolean
  selectedIds: string[] | undefined // derivado: undefined = all, [] = none
  toggleConnection(id: string): void
  selectAll(): void
  selectNone(): void
  clear(): void
}
```

Catálogo: `useDataSourceConnections().dataSourceConnections` (`connectionId`, `DataSourceConnectionsContext.tsx:25‑35`). Nenhum estado local paralelo.

#### 6.2.4 Registros e IDs

1. O schema exige `connectionInstanceId` (`time-entries-sync-schema.ts:172‑174`, `tasks-sync-schema.ts:203‑206`, `metadata-sync-schema.ts:188‑191`). Não se inventa modelo local, sentinela ou migração.
2. `all` não adiciona predicado: eventual documento fora do schema apenas aparece em `all`, nunca em `subset`. Comportamento documentado, não feature.
3. ID desconhecido ou removido: interseção com catálogo; `subset` nunca amplia; `none` nunca vira `all`; a URL inválida não é reescrita silenciosamente durante o carregamento.

### 6.3 Falha de carga — DTO e classificação

`src/packages/shared/src/view-models/AddonLoadFailureViewModel.ts`:

```ts
export type AddonLoadFailureStage =
  | 'authorize'
  | 'apiVersion'
  | 'entry'
  | 'manifest'
  | 'contract'
  | 'import'
  | 'instantiate'
  | 'activate'

export type AddonLoadFailureReason =
  | 'AUTHORIZATION_FAILED'
  | 'API_VERSION_INCOMPATIBLE'
  | 'ENTRY_NOT_FOUND'
  | 'MANIFEST_INVALID'
  | 'CONTRACT_VIOLATION'
  | 'IMPORT_FAILED'
  | 'INVALID_DEFAULT_EXPORT'
  | 'INSTANTIATION_FAILED'
  | 'INITIALIZATION_FAILED'
  | 'UNEXPECTED_ERROR'

export interface AddonLoadFailureViewModel {
  addonId: string
  addonName?: string
  iconUrl?: string
  folderPath: string
  entryPath?: string // targetEntry real, distinto da pasta
  stage: AddonLoadFailureStage
  reason: AddonLoadFailureReason
  technicalMessage: string
  timestamp: number
}
```

Total: **10 `reason`**. Os quatro nomes da spec original são preservados (`IMPORT_FAILED`, `INVALID_DEFAULT_EXPORT`, `CONTRACT_VIOLATION`, `INITIALIZATION_FAILED`) e as causas adicionais justificadas são `AUTHORIZATION_FAILED`, `API_VERSION_INCOMPATIBLE`, `ENTRY_NOT_FOUND`, `MANIFEST_INVALID`, `INSTANTIATION_FAILED`, `UNEXPECTED_ERROR`.

Mapeamento nos pontos reais de `AddonLoader.loadAndActivateFromDisk`:

| Origem (linhas atuais) | Stage / Reason |
|---|---|
| `:1372‑1379` falha de autorização | `authorize` / `AUTHORIZATION_FAILED` |
| `:1398‑1406` API incompatível | `apiVersion` / `API_VERSION_INCOMPATIBLE` |
| `:1423‑1427` sem entry | `entry` / `ENTRY_NOT_FOUND` |
| `:1439‑1490` manifesto ilegível ou estrutura inválida | `manifest` / `MANIFEST_INVALID` |
| `:1451`, `:1467`, `:1484` validação de capabilities inválida | `manifest` / `CONTRACT_VIOLATION` |
| `:1526` `import(fileUrl)` | `import` / `IMPORT_FAILED` (try próprio) |
| `:1535‑1551` export não é construtor nem instância de Addon | `contract` / `INVALID_DEFAULT_EXPORT` |
| `new exportedCandidate()` lança | `instantiate` / `INSTANTIATION_FAILED` |
| `activateAddon` retorna falso ou lança | `activate` / `INITIALIZATION_FAILED` |
| `catch` residual `:1552` | stage corrente / `UNEXPECTED_ERROR` |

Regra de classificação: validação de capabilities é violação do contrato do addon (`CONTRACT_VIOLATION`), nunca `INITIALIZATION_FAILED`. `INITIALIZATION_FAILED` é reservado à falha de ativação. `MANIFEST_INVALID` é reservado a manifesto ilegível ou estrutura inválida, distinto de capabilities.

Exigência técnica: o `try` de `:1552` engloba todos os passos, portanto o `catch` sozinho não classifica. É obrigatório manter uma variável de stage atualizada antes de cada passo e um `try` dedicado ao `import`, para não rotular ativação como falha de import.

Ciclo de vida:

1. Sucesso em `activateAddon` remove a entrada do `addonId`.
2. `deactivateAddon` por update/desinstalação não cria falha; desinstalação remove a entrada.
3. Reload com sucesso limpa; reload com falha substitui. Uma entrada por `addonId`, com `timestamp` do último evento.

### 6.4 IPC — snapshot com revisão

Contrato em `IHostBridge` (`IAddonsAPI`, `IHostBridge.ts:388`):

```ts
getLoadFailures(): Promise<ViewModel<AddonLoadFailuresSnapshot>>

export interface AddonLoadFailuresSnapshot {
  revision: number
  failures: AddonLoadFailureViewModel[]
}
```

1. `AddonLoader` mantém `failedAddons` e uma `revision` monotônica; emite por callback injetado (`onLoadFailuresChanged`), sem importar `electron`.
2. O callback é **obrigatório na IoC**: parâmetro de construção obrigatório de `AddonLoader` (`main/index.ts:718`), registrado junto ao loader em `serviceProvider.include` (`main/index.ts:832‑838`). Onde não houver transmissão real (specs e fixtures do loader) usa-se um `NoOpLoadFailuresNotifier` explícito, nunca parâmetro opcional nem `if (callback)`.
3. `main/index.ts` liga o callback a `webContents.getAllWebContents()` → `addons:load-failures-changed`.
4. Canais: `addons:get-load-failures` (invoke) e `addons:load-failures-changed` (push). Wiring em `IpcChannels.ts`, `routes.ts`, `handlers/AddonsHandler.ts`, `invokers/addonsInvoker.ts` e preload.
5. **Todas** as implementações concretas de `IAddonsAPI` pertencem ao backend, não só o main: `main/invokers/addonsInvoker.ts`, `preload/index.ts:40`, `renderer/ipcClient.ts:16`, `renderer/local-runtime.ts` (spread de `window.api`) e o host não Electron `apps/landing-page/src/app/components/desktop-app-mockup.tsx:206`. Ajustes de fixtures desses contratos também são do backend.
6. O host não Electron é funcional e retorna **snapshot vazio explícito** (`{ revision: 0, failures: [] }`), sem método opcional e sem `undefined`. A UI não pode depender da presença do host real para renderizar o dock.
7. Renderer (`use-addon-load-failures.ts`): assina o push primeiro, invoca o pull depois e aplica somente snapshot com `revision > lastAppliedRevision`. Snapshot é sempre completo, nunca delta. Pull antigo não sobrescreve push novo.
8. O boot fora de ordem (addons carregam antes da janela) é coberto pelo pull inicial.

### 6.5 Consumidores — mudanças exatas

#### 6.5.1 `src/packages/ui/src/pages/metrics.tsx`

1. `selectedSources` (`:1435`) e `effectiveSourceIds` (`:1437‑1447`) deixam de ser estado local: o dropdown de fontes passa a ser controlador do mesmo estado de URL. Fim da divergência dock × dropdown.
2. `getEntriesForRange` (`:142‑166`): trocar `length > 0` + `$in` pela regra de §6.2.2; `none` retorna `[]` antes do `find`.
3. `fetchSummaryData` (`:697‑737`): mesmo tratamento; `none` retorna somas zero no formato atual, sem cair em “todas”.
4. `fetchPeriodSummaryData` (`:740`), `fetchTimelineData` (`:812`), `fetchAvgHoursData` (`:894`), `fetchHeatmapData` (`:952`), `fetchActivityData` (`:1008`), `fetchQualityData` (`:1058`), `fetchEnhancedAnalyticsData` (`:1135`): herdam a correção pelos helpers.
5. As 8 queries (`:1461`, `:1474`, `:1493`, `:1509`, `:1522`, `:1535`, `:1548`, `:1564`) recebem `connectionScopeKey(scope)` na `queryKey` e `scope` nas deps — inclusive `summary`, hoje fora do `queryKeyBase`.
6. Resposta antiga não sobrescreve: chave distinta por escopo; nenhum dado de escopo anterior renderizado sem indicação.

#### 6.5.2 `pages/activities/backlog.tsx` e `activities/lib/queries.ts`

1. `ClientTasksTableWrapper` (`:27‑43`) recebe `scope` e repassa às seis promises (`:35‑41`).
2. `getMemberTaskSelector` (`:26‑44`): `connectionInstanceId` entra como predicado E (nunca OR, que ampliaria). `memberIds` continua como está.
3. `getTasks` (`:77‑142`): `skip/limit` e `count` usam o mesmo seletor com escopo.
4. `getAllUserTasks` (`:49‑59`), `getTaskStatusCounts` (`:145‑165`), `getTaskPriorityCounts` (`:167‑187`), `getEstimatedHoursRange` (`:189‑215`): escopo aplicado antes de materializar; `none` retorna contagem 0, lista vazia ou faixa vazia no formato atual, sem leitura.
5. `getMetadata` (`:64‑75`): `findOne()` sem selector passa a `find` com `connectionInstanceId: { $in: ids }`; `getAllstatus`/`getAllPriorities` (`:217‑225`) mesclam catálogos de forma determinística (ordem das conexões, depois ordem dos itens; dedupe por `id`). `none` → `[]`.
6. Facetas preservam a semântica atual dos filtros locais da tabela; apenas ganham o escopo global.

#### 6.5.3 `pages/activities/activities.tsx` (kanban)

1. `tasks` (`:284‑311`): sai o `find()` sem selector; entra `_deleted: { $ne: true }` + escopo. Chave `['tasks']` → `['tasks', dbName, connectionScopeKey(scope)]`.
2. `timeEntries` por task (`:291‑308`): acrescentar o `connectionInstanceId` do próprio task ao seletor. Correção causal do filtro (evita mistura A/B com mesmo `id` de task). O N+1 permanece fora de escopo (§6.9).
3. `kanbanColumns` (`:255‑267`) e `kanbanRelations` (`:271‑280`): não filtram; colunas vazias permanecem visíveis — preservar layout, filtrar apenas cards.
4. `metadata` (`:314‑321`): escopo pelas conexões das tarefas visíveis; `none` não consulta.

#### 6.5.4 Hooks de consulta

1. `hooks/queries/use-time-entries-query.ts`: `scope` entra na `queryKey` (`:41‑44`), no `find` inicial (`:98‑113`) e no observable (`:122‑131`); `none` não assina e retorna `[]`; `_deleted: { $ne: true }` adicionado no seletor tocado. Cleanup (`:137‑140`) inalterado.
2. `hooks/queries/use-tasks-query.ts`: `options.connectionInstanceId` substituído por `scope` (`:10‑14`, `:26`, `:30‑35`, `:40‑45`, `:57‑69`). Remove `all` como string mágica.
3. `hooks/queries/use-activities-query.ts`: ganha `options.scope` opcional; sem `scope` mantém o comportamento atual (catálogo operacional de pickers). Nenhum filtro implícito em hook compartilhado.

#### 6.5.5 Dados de apontamentos e navegação

1. `pages/time-entries/hooks/use-time-entries-data.ts`: `handleRangeChange` passa a fazer merge (`from`/`to`/`dateRange`) sem apagar `connections`.
2. **Migração de `tasksById`:** o mapa (`:102‑111`) passa a ser `tasksByIdentity`, com chave composta `connectionInstanceId + '::' + taskId`, indexando `id` e `sourceId` dentro do escopo da conexão. **Não existe fallback para ID puro.** Toda resolução exige a conexão do registro; quando ela não estiver disponível, o lookup não resolve.
3. Consumidores que precisam migrar juntos, na mesma entrega:

| Arquivo | Pontos de lookup |
|---|---|
| `pages/time-entries/time-entries-page.tsx` | `:56`, `:226`, `:256` (repasse às views) |
| `pages/time-entries/components/time-entries-table-columns.tsx` | `:59` (tipo), `:405`, `:452`, `:456`, `:530`, `:866`, `:915`, `:1114` |
| `pages/time-entries/components/calendar-view/time-entries-calendar-view.tsx` | `:116`, `:275`, `:305`, `:556‑558` |
| `pages/time-entries/components/timesheet-view/time-entries-timesheet-view.tsx` | `:111`, `:118`, `:124‑125`, `:250`, `:359‑360`, `:593`, `:623`, `:932` |
| Enriquecimento em `use-time-entries-data.ts` | `:130` (acesso atual `tasksById[pureId]`, a migrar) e `:148‑161` |

4. Fixtures que declaram `tasksById` migram junto: `time-entries-row-flicker.spec.tsx:111,339`, `calendar-timesheet-crud.spec.tsx:174,445`, `time-entries-activity-source.spec.tsx:177`.
5. A migração é atômica: não pode restar nenhum acesso por ID puro após a mudança, sob pena de resolver a tarefa da conexão errada quando A e B compartilham o mesmo `id`/`sourceId`.
6. `layouts/time-entries-layout.tsx` e `layouts/activities-layout.tsx`: `to={{ pathname, search: location.search }}`.
7. Sidebar de workspace (`app-sidebar-workspaces-content.tsx`) não propaga `connections` ao trocar de workspace (catálogo diferente). Demais chaves de data também não se transportam entre workspaces.
8. O dock escreve somente `connections`, por merge.

#### 6.5.6 Explicitamente não filtrados

Timer ativo/início/parada/persistência (`components/time-bar/ultimate-entry-bar.tsx:419`), sync/pull/push, conflitos (`hooks/queries/use-workspace-conflicts.ts:28‑32`), resolução de conflito, validação de sobreposição e pickers de edição/criação de registro (o escopo é a conexão do próprio registro ou do destino). Ocultar conexão não pode ocultar impedimento operacional.

### 6.6 Layout, precedência e clique

1. `WorkspaceLayout`: `AddonsTrailDock` como coluna `shrink-0` de 48px na borda externa direita do container central. O dock pertence ao grid do workspace e é renderizado em todas as posições da timebar.
2. Matriz de layout e relação com a `UltimateTimeTracker` (`widgetPosition`):

| `widgetPosition` | Posição do dock | Relação com a timebar | Verificação |
|---|---|---|---|
| `right` | borda externa direita | timebar imediatamente à esquerda do dock | sem sobreposição; dock mais à direita da árvore |
| `left` | borda externa direita | timebar à esquerda do centro; dock permanece à direita | sem sobreposição; centro entre as duas colunas |
| `top` | borda externa direita, abaixo da barra superior | timebar acima; dock ocupa a altura restante | sem sobreposição; dock não invade o header |
| `bottom` | borda externa direita, acima do rodapé | timebar abaixo; dock ocupa a altura restante | sem sobreposição; dock não cobre a timebar |

3. `AddonsDiagnosticsDrawer` em overlay (`Sheet` com backdrop), sem comprimir o centro.
4. Host único de `AddonSettingsDialog` montado no `WorkspaceLayout`, acionado por `stores/addonSettingsDialogStore.ts`, reutilizando o componente existente (`addon-settings-dialog.tsx:27‑31`, que recebe `addon: AddonManifestViewModel | null`). Evita duplicar diálogo e permite abrir de qualquer lugar.
5. Precedência determinística do badge, em função pura testável `resolveTrailStatus`:

`falha de carga` → `auth/reauth (401/403)` → `conexão disabled/disconnected/archived` → `erro técnico de sync` → `sincronizando` → `conectado` → `sem conexão` (neutro).

6. Clique: falha de carga → drawer focado no addon; saudável → `AddonSettingsDialog`; sem conexão → modal na aba de instâncias.
7. Verificação de layout no E2E é por **medição real de `getBoundingClientRect`** e **clique real** nos ícones: largura do dock = 48px, ausência de interseção entre o retângulo do dock e o da timebar, ausência de interseção com o centro, e clique no ícone produzindo a ação esperada (drawer ou dialog) em `right` e `left` no mínimo.

### 6.7 Posse, arquivos e ordem de dependências

| Camada | Arquivos | Dono |
|---|---|---|
| Contrato compartilhado | `shared/src/view-models/AddonLoadFailureViewModel.ts`, `shared/src/view-models/index.ts`, `application/src/contracts/host/IHostBridge.ts` | **Antigravity #2** |
| Implementações de `IAddonsAPI` | `main/invokers/addonsInvoker.ts`, `preload/index.ts`, `renderer/ipcClient.ts`, `renderer/local-runtime.ts`, host não Electron `apps/landing-page/.../desktop-app-mockup.tsx`, fixtures de contrato | **Antigravity #2** |
| Main / loader | `AddonLoader.ts` (+ specs e `NoOpLoadFailuresNotifier`), `IpcChannels.ts`, `routes.ts`, `handlers/AddonsHandler.ts`, `main/index.ts` (registro IoC do callback) | **Antigravity #2** |
| UI infra | `lib/connection-scope.ts`, `hooks/use-workspace-connections-filter.ts`, `hooks/use-addon-load-failures.ts`, `stores/addonSettingsDialogStore.ts` | **Antigravity** |
| UI componentes | `components/addons-trail-dock/{AddonsTrailBar,AddonsDiagnosticsDrawer,index}.tsx`, host do dialog | **Antigravity** |
| UI consumidores | `metrics.tsx`, `backlog.tsx`, `activities/lib/queries.ts`, `activities.tsx`, 3 hooks de query, `use-time-entries-data.ts` + consumidores de `tasksByIdentity`, 2 layouts | **Antigravity** |
| Spec | este documento | **Shell** |

Ordem:

1. Contrato compartilhado + `connection-scope.ts`, que desbloqueiam os dois lados.
2. Em paralelo: loader/IPC (backend #2) e UI de escopo (frontend).
3. Consumidores, incluindo a migração atômica de `tasksByIdentity`.
4. Dock, drawer e host de configurações.
5. `yarn typecheck` e `yarn lint:fix` na raiz, uma única vez e de forma coordenada.

O frontend não é bloqueado pelo backend para iniciar: o dock e o filtro funcionam com snapshot vazio explícito do host, e o contrato tipado é a única dependência rígida.

### 6.8 Critérios de aceite objetivos

1. Fixture A/B do mesmo addon, C de outro, mesmo `memberId`/`sourceId`, horas 1/2/4: `all = 7h`, `A = 1h`, `A+B = 3h`, `none = 0h` **onde a métrica é soma de horas** (total, período, timeline, médias, heatmap, esforço). Métricas que não somam horas têm resultado próprio e determinístico derivado da mesma fixture (contagem de apontamentos, distribuição por atividade, qualidade/pontualidade, sessões/foco), fixado no teste antes da implementação. O mesmo escopo vale para a lista de apontamentos, o backlog (lista + count + facetas) e o kanban.
2. Seletor inspecionado antes do `exec` em cada consumidor: `all` sem predicado de conexão, `subset` com `$in`, `none` sem consulta.
3. `queryKey` distingue `all`/`none`/`ids`; resposta antiga de `all` não aparece após trocar para `A`.
4. URL: ausente, vazio, `all`, `none`, múltiplos, duplicados, encoded e inválido; `desconhecido` nunca vira todas; `[A, desconhecido]` mostra no máximo A.
5. `handleRangeChange` preserva `connections`; tabs de apontamentos e atividades preservam a query; reload e back reproduzem o estado.
6. Cada um dos **10 `reason`** do loader produz DTO com `folderPath` e `entryPath` corretos; capabilities inválidas resultam em `CONTRACT_VIOLATION`; falha de ativação resulta em `INITIALIZATION_FAILED`; sucesso limpa; update e desinstalação não geram falha espúria.
7. Push durante pull e pull com revisão menor não sobrescrevem estado mais novo; pull inicial popula renderer aberto depois do boot.
8. Dock de 48px medido no E2E, matriz de §6.6.2 verificada em `right` e `left` no mínimo, sem interseção com timebar nem com o centro; clique real abre drawer ou dialog conforme o estado; badge segue a precedência de §6.6.5.
9. Nenhuma consulta de timer, conflito, sync ou picker recebe o filtro.
10. Nenhum consumidor de `tasksByIdentity` usa ID puro; com A e B compartilhando `id`/`sourceId`, cada registro resolve a tarefa da própria conexão.
11. Host não Electron retorna snapshot vazio explícito e a UI renderiza o dock sem erro.
12. `yarn typecheck` e `yarn lint:fix` na raiz com 0 erros; sem `any` novo.

### 6.9 Fora de escopo — dívida registrada, sem entrega adicional

1. N+1 do kanban (lista de tarefas + uma consulta de apontamentos por tarefa).
2. Oito scans independentes de métricas.
3. `getMetadata().findOne()` sem escopo — corrigido apenas onde o filtro exige.
4. Repetição fixa de scans de tarefas no backlog.
5. `estimatedHours` presente em `GetTasksSchema` e não aplicado em `getTasks`.
6. Chaves de cache sem `db`/workspace nos hooks não tocados.
7. Reload de addon com URL de import estável reutilizando módulo — sem evidência de impacto nesta entrega.

### 6.10 Plano de testes

1. **Unitários**: parser e serializador de URL, `resolveConnectionScope` com catálogo vazio/carregando, `connectionScopeKey`, `resolveTrailStatus` em todas as combinações de precedência.
2. **Seletor**: asserts do objeto de seletor para métricas, `activities/lib/queries.ts` e os três hooks; contagem de chamadas igual a zero em `none`.
3. **Integração determinística**: fixture A/B/C com relógio fixo; métricas, lista, backlog (seis promises) e kanban; escrita reativa no RxDB reflete no escopo ativo; barreira de resposta obsoleta. Sete horas cobrem apenas métricas de soma; cada métrica restante tem valor esperado próprio registrado no teste.
4. **IPC**: pull antes de push, push durante pull, revisão fora de ordem, boot anterior à janela, host não Electron com snapshot vazio explícito.
5. **Loader**: os **10 `reason`** com arquivos temporários reais, no padrão de `AddonLoader.Security.spec.ts`, incluindo `folderPath` diferente de `entryPath`, capabilities inválidas em `CONTRACT_VIOLATION` e ativação em `INITIALIZATION_FAILED`; callback obrigatório com `NoOpLoadFailuresNotifier` nas fixtures.
6. **Regressão**: conflitos e timer continuam abrangentes; pickers continuam acessando a conexão do registro; `tasksByIdentity` cobre colisão A/B de `id` e `sourceId` em tabela, calendário, timesheet e enriquecimento; suítes existentes `time-entries-readiness.spec.tsx`, `DataSourceConnectionsContext.spec.tsx`, `task-popover.spec.tsx` e `resolve-time-entry-conflict.spec.ts` permanecem verdes.
7. **Layout E2E**: render em `right`, `left`, `top` e `bottom`; medição real de largura (48px) e de interseção de retângulos com timebar e centro; clique real no ícone abrindo drawer ou dialog conforme o estado; drawer aberto sem desmontar o centro.

### 6.11 Registro de decisão — revisão do Tech Lead (2026-11-02)

Aprovado sem necessidade de nova aprovação humana para estas decisões locais:

1. `ConnectionSelection` / `ConnectionScope` e a gramática `all` / `none` / `ids`, sem ampliação de escopo.
2. Interseção de IDs desconhecidos com o catálogo, sem transformar seleção explícita em “todas”.
3. Dropdown de métricas como controlador único do filtro global.
4. Não transportar `connections` entre workspaces.
5. Snapshot de falhas revisionado e a divisão de posse entre backend, frontend e spec.

Ajustes incorporados nesta revisão:

1. Os quatro `reason` originais foram preservados; o total é 10, com causas adicionais justificadas. Validação de capabilities = `CONTRACT_VIOLATION`; ativação = `INITIALIZATION_FAILED`.
2. `tasksById` migra para `tasksByIdentity` com chave por conexão em **todos** os consumidores (tabela, calendário, timesheet, enriquecimento e fixtures), sem fallback por ID puro.
3. Backend também é dono das implementações concretas de `IAddonsAPI` fora do main e dos ajustes de fixture; host não Electron retorna snapshot vazio explícito, sem método opcional.
4. A matriz de layout inclui `left` e verificação por medição e clique reais no E2E; 7h vale para métricas de soma, e as demais têm resultado próprio.
5. O callback de notificação é obrigatório na IoC, com `NoOpLoadFailuresNotifier` explícito onde não há transmissão.

Status: decisões e plano aprovados. A prontidão de integração do backend está condicionada às pendências registradas em §6.12, que não alteram nenhuma decisão aprovada.

### 6.12 Pendências de integração — acompanhamento (dono: Antigravity #2)

Registro de acompanhamento. **Nada aqui está aprovado** e nenhum item pode ser marcado como concluído sem evidência de execução e revisão final. Não é mudança das decisões aprovadas em §6; é verificação de conformidade da implementação com elas. Linhas conferidas na abertura deste registro e sujeitas a deslocamento.

> **Atualização de status (2026-11-02):** o backend declarou CORE-01 a CORE-04 implementados, com 35 testes reportados. Status de cada item: **implementado, AGUARDANDO validação** — não aprovado, não encerrado e não marcado como resolvido. A seção de evidências será assumida por Prisma quando liberada; os checks globais de integração (tipo/lint) estão em execução por Checklist e Git, ainda sem build. Registro congelado para escrita documental a partir desta atualização.

| ID | Gravidade | Pendência | Evidência atual | Aceite para encerrar |
|---|---|---|---|---|
| CORE-01 | Alta | Notifier obrigatório não propagado a todos os consumidores de `new AddonLoader` | `src/apps/desktop/src/main/services/addons/lifecycle/AddonLifetime.spec.ts`: 6 construções (`:68`, `:112`, `:156`, `:182`, `:219`, `:245`); `src/apps/desktop/src/main/services/addons/core/AddonConnectionAuth.integration.spec.ts`: 4 construções (`:448`, `:700`, `:902`, `:1187`) | Todas as construções passam o notifier obrigatório (ou `NoOpLoadFailuresNotifier` explícito nas fixtures). Nenhum parâmetro opcional ou guarda de callback. `yarn typecheck` sem erro. |
| CORE-02 | Alta | `AddonsHandler.uninstall` apenas chama a facade de disco e não limpa o registro de falha | `src/apps/desktop/src/main/handlers/AddonsHandler.ts:565‑588` chama `addonsFacade.uninstallAddon` e retorna, sem tocar em `failedAddons`; o teste atual cobre apenas `deactivateAddon` direto (`AddonLoader.LoadFailures.spec.ts:290`) | Teste de uninstall real pelo handler: sucesso remove a falha do `addonId` e incrementa a revisão; falha da facade preserva a entrada existente. |
| CORE-03 | Média | `activateAddon` descarta o erro técnico e `performLoadAndActivateFromDisk` grava mensagem genérica | `AddonLoader.ts:1350‑1361` retorna `false` após `catch` sem expor a causa; `:1726‑1735` e `:1748‑1757` registram `INITIALIZATION_FAILED` com texto fixo ("A inicialização ... retornou falha.") | O snapshot preserva a mensagem original do erro (ou o `messageKey` da capability) sem `switch`/string matching na UI nem no loader. Teste com erro de mensagem conhecida e distinta. |
| CORE-04 | Média | Falta teste do 10º `reason`, `UNEXPECTED_ERROR` | `AddonLoader.LoadFailures.spec.ts` cobre 9 dos 10 reasons (`:102‑254`); não há caso de exceção fora dos estágios já tratados | Teste que força erro inesperado no estágio corrente e verifica `reason = UNEXPECTED_ERROR`, `stage` correto, `technicalMessage` original e `folderPath`/`entryPath` coerentes. |

Regras de acompanhamento:

1. A marcação de conclusão é do auditor (Prisma), após evidência de vermelho/verde e revisão final do Tech Lead. Implementador não encerra item.
2. Frontend segue integral e não depende destes itens para trabalhar; nenhum deles bloqueia UI.
3. Checks globais (`yarn typecheck` e `yarn lint:fix`) não estão liberados e permanecem com Checklist e Git após a integração.
4. Qualquer divergência de contrato descoberta ao tratar estes itens volta para esta spec antes de mudar código.

#### 6.12.1 Decisão canônica CORE-03 (aprovada pelo Tech Lead em 2026-11-02)

Fecha a lacuna de transporte do motivo de ativação. **Não encerra CORE-03**: o item continua como implementado, aguardando validação independente em §6.12.

Defeitos concretos confirmados no estado atual (não são preferência):

1. `AddonLoader.ts:1338‑1344` retorna `false` quando `validateManifestCapabilities` falha, sem gravar nada; logo o fallback `lastActivationErrors.get(addonId) ?? "…"` de `:1735‑1737` e `:1761‑1763` é alcançável e classifica violação de capabilities como `INITIALIZATION_FAILED`, contra §6.3.
2. `:1352‑1356` inicializa mensagem genérica e só preserva `error.message` quando `error instanceof Error`; addon externo que lança string ou objeto perde o detalhe original.
3. `Map<string, string>` privado é estado mutável paralelo com `delete` no leitor, sujeito a sobra em caminho não lido e a sobrescrita em reload reentrante.

Desenho canônico (resultado por chamada, sem map):

```ts
// file-local em AddonLoader.ts; não exportado, não vai para AppError.ts
class AddonActivationError extends AppError {
  constructor(
    readonly technicalMessage: string,
    readonly stage: 'manifest' | 'activate',
    readonly reason: 'CONTRACT_VIOLATION' | 'INITIALIZATION_FAILED',
  ) {
    super('ADDON_ACTIVATION_FAILED', 500)
  }
}

private async performActivation(
  addonId: string,
  addonInstance: IAddon,
  manifest?: IAddonManifest,
): Promise<Either<AddonActivationError, void>>

// assinatura pública inalterada; wrapper sem estado
public async activateAddon(
  addonId: string,
  addonInstance: IAddon,
  manifest?: IAddonManifest,
): Promise<boolean>
```

Regras de implementação:

1. `performActivation` valida capabilities **antes de qualquer efeito** (antes de `deactivateAddon`, `applyManifestCapabilities` e `createContext`) e retorna `Either.failure(new AddonActivationError(capResult.failure.messageKey, 'manifest', 'CONTRACT_VIOLATION'))`.
2. O `catch` de `activate` retorna `Either.failure(new AddonActivationError(technicalMessage, 'activate', 'INITIALIZATION_FAILED'))` após a limpeza já existente; falha de limpeza continua apenas logada e não substitui a causa primária.
3. Sucesso retorna `Either.success()`.
4. `activateAddon` público é apenas `(await this.performActivation(...)).isSuccess()`; nenhum consumidor de teste muda.
5. Os dois call sites de carga consomem `Either` e gravam no DTO `failure.stage`, `failure.reason` e `failure.technicalMessage` **verbatim**. Não há `??`, mensagem genérica, `as` nem leitura de map.
6. `lastActivationErrors` e suas três ocorrências são removidos.

Extração da mensagem, com narrowing inline na borda do `catch` (sem assinatura nova com `unknown`, sem função auxiliar):

| Valor lançado | `technicalMessage` |
|---|---|
| `Error` | `error.message` |
| string | o próprio valor |
| objeto com `message` string (via `isRecord` + `isString`) | `record.message` |
| demais valores | `String(valor)` |

Proibições explícitas:

1. Não criar `Result`/`ActivationOutcome`/tipo paralelo; o transporte é `Either<AddonActivationError, void>` e o erro é subtipo de `AppError`.
2. Não alterar `AppError.ts`, o contrato público `Promise<boolean>`, o DTO de §6.3 nem adicionar framework genérico.
3. Não introduzir `JSON.stringify` nem serialização de objeto sem evidência; a representação é textual e explícita.
4. Classificação é sempre pelo ramo/`stage`, nunca por conteúdo de mensagem, `instanceof` ou string matching para inferir `reason`.
5. Nenhuma mensagem genérica fixa no caminho de ativação.

Escopo de arquivos: `AddonLoader.ts` e `AddonLoader.LoadFailures.spec.ts`. Testes exigidos: capabilities inválidas → `CONTRACT_VIOLATION`/`manifest`; `Error` → mensagem exata (caso existente preservado); string → valor preservado; objeto com `message` → `message`; objeto sem `message` → `String` real e diferente do texto genérico; `activateAddon` público continua booleano em todos os specs existentes; nenhuma referência remanescente a `lastActivationErrors`.

### 6.13 Pendências de integração — frontend FE-01..08 (dono: Antigravity)

Registro aberto, aberto após a falha do `typecheck` global e o retorno do frontend à escrita. **Não é revisão final** e nada aqui está aprovado. CORE-01..04 permanecem como em §6.12: implementados pelo backend, aguardando validação independente.

| ID | Gravidade | Pendência | Evidência | Aceite para encerrar |
|---|---|---|---|---|
| FE-01 | Alta | Erros de `typecheck` não sanados | Rodada global registrada em `.temp/addons-dock/typecheck-1.log`: value inventado, `onLoadFailuresChanged` inexistente, campos de `AddonConnectionView` incorretos, imports do DTO e seletores tipados como `Record<string, unknown>` | `yarn typecheck` na raiz sem erro; nenhum `any`/cast novo; nomes e campos conferidos contra o contrato de §6.3/§6.4 |
| FE-02 | Alta | Testes de métricas e queries recriam funções locais em vez de exercitar a produção; mock do `TrailBar` inventa contrato | Testes citados não importam a implementação real; o mock não corresponde ao `IAddonsAPI`/snapshot aprovados | Teste de produção com fixture A/B/C real (7h onde é soma, valores próprios nas demais) e hook IPC com `deferred` real cobrindo push durante pull e revisão fora de ordem |
| FE-03 | Alta | `getMetadata` continua `findOne` e não mescla catálogos de A+B; facetas não refletem o escopo | `pages/activities/lib/queries.ts:78‑94` (`findOne` com e sem selector), usado em `:189`, `:216`, `:266`, `:271` | `find` por `connectionInstanceId` do escopo com merge determinístico (ordem das conexões, dedupe por `id`); `none` retorna vazio sem leitura; teste A+B com catálogos distintos e sobrepostos |
| FE-04 | Alta | Drawer sem a seção de addons saudáveis/capabilities/última sincronização; status usa chave errada em vez de `useConnectionsWithSync` e do pior estado entre conexões | `SyncProvider.tsx:491‑509` expõe `useConnectionsWithSync`; o badge atual não deriva dele nem aplica a precedência de §6.6.5 | Seção presente com capabilities e última sync por addon; status calculado pelo helper e pela precedência, com teste de múltiplas conexões e caso sem conexão |
| FE-05 | Média | Checkbox sem rótulo acessível e dois handlers chamando `toggle` | Duplicidade de chamadas confirmada no código. O efeito de desfazer o estado **não foi reproduzido** e não deve ser declarado confirmado | Nome acessível no checkbox e exatamente **uma** navegação/ação por clique e por tecla, comprovada em teste; sem afirmar bug de estado não reproduzido |
| FE-06 | Média | Sidebar e breadcrumb não preservam `connections` dentro do mesmo workspace | Links montados sem `location.search` (§6.5.5, itens 6 e 7) | Navegação entre seções do mesmo workspace preserva `connections` e as demais chaves; troca de workspace continua sem transportar o filtro |
| FE-07 | Média | Parser aceita mistura `all,A`, contrariando a falha fechada | `lib/connection-scope.ts:34‑51`: `all` é descartado e o restante vira `ids`, resultando em `[A]` | `all` combinado com IDs resolve para `none`, conforme §6.2.1; teste de `all,A`, `A,all`, `none,A` e `A,none` |
| FE-08 | Alta | Catálogos de edição/pickers recebem `scope`, apesar da exclusão aprovada em §6.5.6; lookup de `TaskCell` usa `rowConnId` antigo | Consumidores operacionais escopados indevidamente; `rowConnId` desatualizado no lookup de tarefa | Prova de que, filtrando A, o registro de B continua editável e escolhível, com metadata da conexão correta; pickers e catálogos operacionais voltam a não receber `scope` |

Regras de acompanhamento:

1. A marcação de conclusão é do auditor (Prisma), após evidência de vermelho/verde e revisão final do Tech Lead. Implementador não encerra item.
2. FE-01, FE-02 e FE-08 são bloqueantes para integração; FE-03 a FE-07 também precisam de evidência antes do gate.
3. Nenhuma decisão aprovada em §6 é reaberta por estes itens; onde a implementação divergiu do contrato, o contrato prevalece.
4. Checks globais continuam com Checklist e Git; este registro não antecipa gate nem auditoria.

### 6.14 Preparação e evidências independentes QA — Prisma (2026-11-02)

**Estado: testes dedicados preparados; auditoria final do produto e aceite ainda pendentes.** Esta seção é o registro QA na fonte única. Não encerra CORE-01..04 nem FE-01..08, não substitui revisão final e não usa o checklist de sincronização.

#### Sincronização e posse

- Exclusividade de pull concedida pelo coordenador, com implementadores pausados: `git status --short` conferido e `git pull --ff-only origin main` executado em `metric`; resultado **Already up to date**. Diffs locais e `docs/superpowers/` preservados; sem stash/reset/descarte.
- QA escreveu somente os dois testes transferidos, o E2E/helper exclusivos e esta seção. Produção e fixture compartilhada não foram alteradas por QA. As nove exportações de métricas e correções do hook foram feitas pelo frontend sob autorização do coordenador.

#### Arquivos de teste e alcance real

1. `src/packages/ui/src/pages/metrics-scope.spec.ts`: remove o cálculo local espelhado; importa as **nove funções reais de `pages/metrics.tsx`**, executadas contra **RxDB memory real**, relógio fixo e fixture A/B/C (1h/2h/4h). Quatro casos (`all`, A, A+B, `none`), exercitando seletores efetivamente recebidos pelo banco; todas as nove funções são chamadas por caso. Somas esperadas 7/1/3/0; também confere contagens, distribuição de sessões, deep work e qualidade com valores próprios. `none` não chama `find`. São provas de consultas/agregações de produção, **não render da página, navegação URL ou provedor remoto**. Schemas mínimos de fixture isolam consulta, sem provar ingestão de DTO completo. O caso que construía mapa local de tarefas foi removido; não é apresentado como prova de `tasksByIdentity` dos consumidores finais.
2. `src/packages/ui/src/hooks/queries/queries-scope.spec.ts`: remove `buildSelector` local. Exercita os **três hooks reais** com `renderHook`, QueryClient e RxDB memory real: A/B/C, isolamento inicial/observable, chaves de cache por escopo, escrita reativa e ausência de escrita no cache após unmount. Executa também as **seis funções reais do backlog** com A+B, catálogos distintos/sobrepostos, dedupe, membro E conexão, count/paginação e `none` sem leitura. Nos testes do hook IPC, somente a **fronteira hostBridge é simulada**: isso prova estado/ordenação/cleanup do hook real, não a cadeia Main/Electron. Total atual: 10 testes.
3. `src/apps/desktop/e2e/addons-trail-dock.e2e.spec.ts` + `addons-trail-dock.qa-helpers.ts`: preparados, **ainda não executados**. Matriz de bounds/cliques de addon/settings e diagnóstico nas quatro posições, 1600x900 e 1100x720; 48 CSS px, ausência de interseção com centro/timebar, adjacência em right, overlay sem alterar bounds/identidade do nó central, foco Tab/Shift+Tab/Escape e retorno ao acionador. Checkbox com nome acessível e uma transição de URL/histórico por clique; picker do timer abre mesmo com `none` (não prova ainda edição de registro B sob filtro A). Screenshots de sucesso são anexados por posição para inspeção visual posterior; nenhuma imagem foi inspecionada nesta etapa.
4. E2E IPC proposto usa **arquivos reais no perfil isolado**, `window.api.addons.getSchema` -> handler/facade/loader reais, evento real `addons:load-failures-changed`, pull após reload do Renderer e uninstall pelo handler. Nenhum handler, import, snapshot ou acesso de addon é substituído por mock. Motivos representativos: `IMPORT_FAILED`, `INVALID_DEFAULT_EXPORT` (primitivo e **default ausente com exports nomeados**, este ainda hipótese), `INITIALIZATION_FAILED` com mensagem sentinela original. A tentativa de carga é acionada por API pública existente, não por seam artificial de produção.

#### Vermelho/verde do estado IPC (não E2E)

- `qa-queries-2.log`: 6 verdes, **2 falhas de comportamento**. (QIPC-01, média) resposta `isSuccess=false,error=QA_FAILURE_SNAPSHOT_UNAVAILABLE` perdia a mensagem porque o hook consultava campo inexistente `message`; aceite: preservar `ViewModel.error`. (QIPC-02, média) rejeição de pull pendente após push revision 7 válido degradava diagnóstico para indisponível; aceite: falha de requisição anterior não substitui snapshot posterior válido.
- Frontend corrigiu a camada responsável. QA acrescentou a variante de **ViewModel de falha tardio**, além da rejeição. `qa-queries-3.log`: **10/10 verdes**, incluindo esses cenários, backlog e hooks. A referência restante a `res.message` foi apontada ao frontend e retirada por ele antes da rodada final abaixo.
- Os vermelhos são assertions de comportamento do hook real, não falhas de seletor/setup. **Aceite de conjunto continua pendente de checks/build/Electron e revisão final do Tech Lead**; não há marcação de conclusão dos itens de integração aqui.

#### Execuções efetivas e logs

Diretório de logs externo ao checkout: `C:/myapps/metric-context/.temp/addons-dock/`.

- `qa-queries-1.log`: `yarn vitest run --project ui src/packages/ui/src/hooks/queries/queries-scope.spec.ts` — 5/5 verdes (primeira versão real, antes de ampliar casos).
- `qa-metrics-1.log`: `yarn vitest run --project ui src/packages/ui/src/pages/metrics-scope.spec.ts` — 4/4 verdes.
- `qa-queries-2.log` e `qa-queries-3.log`: mesmo comando de queries, vermelho/verde detalhados acima.
- **`qa-production-tests-final-prebuild.log`**: `yarn vitest run --project ui src/packages/ui/src/hooks/queries/queries-scope.spec.ts src/packages/ui/src/pages/metrics-scope.spec.ts` — **2 arquivos, 14/14 testes verdes, duração 13.82s**. Execução independente no estado entregue do hook já sem `res.message`. Não afirmar a execução de suítes do frontend a partir do resumo dele.
- Prettier executado somente nos quatro arquivos QA. **Nenhum typecheck global, lint global, build ou Electron executado por QA nesta etapa.** Os testes foram incorporados antes da rodada definitiva coordenada.

#### Limites, segurança do perfil e próxima execução

- `CONTRACT_VIOLATION` de manifesto/capabilities inválidos não é prometido como E2E pelo `getSchema`: o facade `mapRecordToDTO` e o verificador de pacote podem rejeitar o manifesto antes de o loader ser chamado. Os testes existentes de loader usam fronteira de acesso simulada nesse cenário. A enumeração de boot `listInstalled` descartar pacotes inválidos também pode constituir uma lacuna funcional de visibilidade: **consulta de arquitetura/backend pendente, sem parecer atribuído ao Shell indisponível e sem conclusão de QA por resumo**. Não criar seam artificial para contornar validadores.
- Default ausente com exports nomeados permanece **hipótese** até execução Electron. N+1 do kanban, scans repetidos de métricas/backlog e cache de import continuam nos limites de §6.9, sem exigir correção sem evidência causal.
- E2E possui `beforeAll` que confere os ancestrais do alvo fixo `desktop/test-results/electron-user-data/worker-N` antes do cleanup da fixture test-scoped e recusa junctions nesses ancestrais; também compara `app.getPath('userData')` com o caminho esperado antes de escrever pacotes temporários. QA não adicionou deleção manual nem usa perfil pessoal/produção. O guard só será exercitado quando o runner for liberado.
- Comando previsto após **checks e build atualizados**, exclusivo de QA como único runner Electron: `yarn --cwd src/apps/desktop test:e2e addons-trail-dock.e2e.spec.ts --workers=1 --retries=0`. Guardar evidências da primeira execução; falha de infraestrutura/setup será separada de falha de produto. A eventual aprovação visual depende de abrir e inspecionar os PNGs reais, não apenas gerar screenshots.
- Antes de Electron: coordenador confirma pausa geral; Checklist e Git executa checks/correções coordenadas e `yarn build:desktop`. QA retoma só após entrega do build. **Ao encerrar esta preparação QA entra em pausa de escrita**, liberando a rodada global ao dono designado.
