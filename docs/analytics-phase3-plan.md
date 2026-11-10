# Fase 3 — Atualização, reconciliação, hidratação e experiência de uso

**Data:** 10/11/2026

**Checklist coberto:** `[F3-01]` a `[F3-06]` (preparando os cenários de prova de `[F4-01]` a `[F4-03]`) de `checklist_correcao_analytics_redmine.md`.

**Dependências anteriores concluídas:** Fases 0, 1 e 2 (`metric/docs/analytics-phase1-plan.md`, `metric/docs/analytics-phase2-plan.md`, `metric/docs/analytics-phase2-validation.md`).

---

## 1. Contexto e objetivo

As Fases 0 a 2 consolidaram `analytics` como capacidade independente no SDK (`@mr-tick/sdk`), paginação JSON controlada com cobertura explícita no `@mr-tick/redmine-plugin`, e armazenamento/consulta local via `DuckDBAnalyticsEngine` + `AnalyticsWarehouseService` no processo principal do desktop.

Entretanto, o ciclo de atualização atual executa sempre uma leitura completa do zero (`ANALYTICS_CHANGES_INGESTION_NOT_IMPLEMENTED`), não persiste estado durável de sincronização, não reidrata gráficos nem configurações ao reabrir a tela de Analytics sem refazer HTTP, dispara chamadas sequenciais sem compartilhamento eficiente entre nós/gráficos do mesmo escopo na UI e não diferencia primeira carga, atualização em segundo plano ou progresso por lote.

A Fase 3 define e entrega a arquitetura completa de atualização por dataset, estado durável, reconciliação segura, reuso de cargas, hidratação offline pelo DuckDB e experiência transparente na UI mantendo o core e a interface estritamente agnósticos ao provedor.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
1. **[F3-01] Estratégias declarativas por dataset:** permitir que cada provedor declare, sem condicionais no core, se o dataset suporta delta incremental (`changes`), re-leitura por subjanela temporal contígua (`windowRescan`) ou substituição integral (`full_replace` / `aggregate`).
2. **[F3-02] Estado durável e atômico:** persistir o estado de sincronização no DuckDB (`analytics_sync_states`), avançando checkpoints e timestamps somente dentro da mesma transação atômica que publica a nova geração e descarta a anterior.
3. **[F3-03] Reconciliação segura sem falsas exclusões:** combinar atualizações rápidas seguras (upsert de mudanças ou troca atômica da subjanela recente) com reconciliação de escopo completo periódica e manual, sem jamais excluir registros a partir de cargas parciais ou incrementais sem tombstones.
4. **[F3-04] Política de cadência dupla configurável:** oferecer polling configurável em minutos diretamente na tela de Analytics enquanto a view está aberta, reconciliação completa periódica automática (`6 h` padrão) e ressync manual forçado (`Sincronizar`) a qualquer momento.
5. **[F3-05] Hidratação e compartilhamento de carga:** hidratar espaços configurados e publicações válidas diretamente do DuckDB ao abrir o Analytics (sem HTTP automático quando já houver base válida), e coalescer/reutilizar uma única carga entre todos os nós/gráficos que compartilham `(workspaceId, connectionInstanceId, authorizationKey, selectionKey)`.
6. **[F3-06] Progresso por lote e estados claros de UX:** emitir eventos limitados de progresso por lote (`main -> renderer`), distinguir primeira carga (skeleton + progresso) de atualização em segundo plano (gráficos visíveis + indicador não bloqueante), expor timestamps de atualização/reconciliação completa e cobertura (`Completa` vs `Não verificada`), e preservar a última versão válida em erros transitórios isolando `401`/`403` por conexão.

### Não-Objetivos (decisões aprovadas fora deste escopo)
- **Não misturar apontamentos locais não confirmados / timer em andamento (RxDB)** nos conjuntos analíticos; o Analytics consome exclusivamente dados confirmados do provedor remoto.
- **Não executar daemon em segundo plano** sincronizando workspaces fechados ou com o usuário fora da tela de Analytics.
- **Não reconstruir automaticamente atributos históricos de tarefas** na data trabalhada (`spent_on`); cruzamentos com tarefas refletem o estado atual sincronizado, mantendo histórico temporal explícito sob responsabilidade do dataset de journals sob demanda.
- **Não prometer remoção instantânea entre reconciliações** quando o provedor não expõe tombstones (`deletions: 'none'`).

### Anti-Objetivos (o que caracteriza falha arquitetural)
- Enviar `updated_on` para endpoints que ignoram esse filtro (como `/time_entries.json` no Redmine 3.4, 5.1 e 6.0) simulando incrementalidade inexistente.
- Avançar `checkpoint` ou timestamp de sincronização antes do commit atômico da geração publicada.
- Remover registros locais por ausência durante `changes` com `deletions: 'none'` ou durante carga com `coverage: 'partial'` / erro intermediário.
- Permitir `if (addonId === 'redmine')` ou heurísticas de campos/idiomas no core ou na UI.
- Manter compatibilidade silenciosa ou rotinas de migração/apagamento cego de bancos legados da Fase 2.
- Saturar requisições do processo principal degradando o fluxo operacional pessoal (timer/push/pull).

---

## 3. Restrições e invariantes

### Constituição Técnica (`AGENTS.md` e `metric/AGENTS.md`)
- Tipagem estrita absoluta em produção: proibido `any`, `unknown`, `as`, `satisfies` (permitido apenas `as unknown as` / `as` para test doubles em `.spec.ts`).
- Proibido prefixo `_`, `setTimeout` para sincronização no core/serviços, fallbacks cegos (`||`, `??` fora de padrão especificado explicitamente, `array[0]`), `else` / `else if` (early return obrigatório), imports `import('...')` inline e traduções manuais por string de erro na UI (`switch`/`if` em `errorKey`).
- Fluxo funcional obrigatório com `Either<AppError, T>` (sem `throw` para fluxo nem `try/catch` inferindo erro).
- Inversão de Controle (IoC/DI) estrita em `metric/src/packages/IoC.ts`: proibido `?:` em construtores gerenciados pelo container; dependências opcionais usam padrão Null Object (`NoOp`, ex.: `NoOpSystemEventEmitter`).
- Proibido `SELECT *` para filtrar em memória e proibido criar segundo repositório para a entidade `Workspace`. Toda persistência analítica pertence exclusivamente ao `DuckDBAnalyticsEngine`.
- Versionamento exclusivamente via `.changeset/*.md` (`minor`/`patch`). Comandos na raiz sempre com PowerShell (`;`), validando na conclusão integral com `yarn typecheck` e `yarn lint:fix`.

### Restrições comprovadas do provedor de referência (Redmine 3.4 / 5.1 / 6.0)
- `redmine_issues`: aceita `updated_on`, `created_on`, `closed_on`, filtros de projeto/responsável/status/tracker e `sort=id:asc` nas três versões; não retorna tombstones de exclusão nem notifica quando uma issue sai do escopo do filtro ativo (ex.: tarefa fechada deixando `status_id=o`).
- `redmine_time_entries`: ignora silenciosamente `updated_on` e `created_on`, ignora `sort=id:asc`, e no 3.4 pode repetir/omitir IDs entre páginas quando há empates de ordenação (`RedmineAnalyticsPaging` já rejeita com `ANALYTICS_DUPLICATE_ROW_IDENTITY`). CSV de apontamentos não expõe `id` de linha; `issues.csv` trunca no `Setting.issues_export_limit` (`500`). Portanto, toda extração estruturada permanece JSON paginado com validação de unicidade por `id`.

### Orçamentos e limites preservados da Fase 2
- `DuckDBAnalyticsEngine`: `2` threads, `256 MB` memory limit, até `2` bancos de workspace abertos simultaneamente em LRU, fila serial de `32` operações normais + `8` slots reservados para limpeza (`cleanup`), acesso externo e extensões desabilitados.
- Cargas: máximo `50.000` linhas por carga/geração publicada, `1.000` páginas por extração, até `8` gerações staging / cargas ativas simultâneas (`429`).
- Consultas paginadas locais: até `500` linhas por página com validação de `version` vinculada aos `generationId` dos nós ancestrais.

---

## 4. Arquitetura e decisões acordadas

### [F3-01] Estratégias de extração por dataset e extensão de contratos

#### 4.1 Extensão de `AnalyticsExtractionDescriptor` (`@mr-tick/application` / `@mr-tick/sdk`)
Sem acoplar o core ao Redmine, `AnalyticsExtractionDescriptor` passa a declarar explicitamente as garantias reais de atualização parcial:

```ts
export interface AnalyticsExtractionDescriptor {
  modes: readonly AnalyticsExecutionKind[]
  identity: AnalyticsRowIdentity
  changes?: {
    deletions: 'none' | 'explicit'
  }
  windowRescan?: {
    dateColumn: string
  }
  aggregation?: {
    groupByColumns: readonly string[]
    operators: readonly AnalyticsAggregateMeasure['operator'][]
    postProcessing: 'projection-only'
  }
}
```

Regras contratuais validadas no `analyticsManifestSchema` (Zod) e no `AnalyticsWarehouseService`:
1. **`changes`:** só é válido quando `'changes'` está presente em `modes`, `identity.kind === 'row'` e `changes` está declarado explicitamente (`deletions: 'none' | 'explicit'`).
2. **`windowRescan`:** só é válido quando `identity.kind === 'row'`, `selection?.dateRange === true`, e `dateColumn` existe em `manifest.columns` com `type === 'date'`. O `dateColumn` declara qual coluna da tabela publicada corresponde ao recorte `[startDate, endDate]` da seleção.
3. **`full_replace` implícito:** qualquer dataset sem `changes` nem `windowRescan` (ou executando `execution.kind === 'aggregate'`) sempre atualiza substituindo o escopo completo atomicamente.

#### 4.2 Contrato de `changes` e `snapshot` paginados
Estender `AnalyticsDatasetExecution` no contrato compartilhado:
- Em `kind: 'snapshot'`: adicionar campo opcional `checkpoint?: string` (emitido apenas na conclusão do snapshot, quando `continuation === undefined` e o provedor declarar `'changes'` com timestamp derivado do servidor; quando um snapshot inicial retorna `0` linhas e o payload da API não traz timestamp do servidor, o provedor **omite `checkpoint`** sem alterar `IHttpClient` nem usar relógio do cliente).
- Em `kind: 'changes'`: alinhar campos de progresso e completude exatamente com `snapshot`:
  - `scope: AnalyticsDatasetScope`
  - `checkpoint: string`
  - `deletedIds: string[]` (deve ser `[]` quando `changes.deletions === 'none'`)
  - `coverage: 'complete' | 'partial' | 'unverified'`
  - `coverageReason?: string`
  - `batch?: AnalyticsBatchInfo`
  - `continuation?: AnalyticsContinuation`

Regra de **checkpoint seguro** no provedor e no core:
- O provedor calcula `checkpoint` exclusivamente a partir de timestamps do servidor observados nas linhas recebidas em todo o percurso (`max(updated_date)` acumulado em todas as páginas) no último lote concluído (`continuation === undefined`):
  - Se um `snapshot` inicial concluir com `0` linhas sem timestamp no payload da API, `checkpoint` é omitido (`undefined`); enquanto `analytics_sync_states.checkpoint` permanecer vazio, o `AnalyticsWarehouseService` executa recarga `full` (1 request HTTP leve de 0 linhas) até que registros existentes estabeleçam o primeiro checkpoint real do servidor.
  - Se `changes` concluir com `0` linhas alteradas, mantém `checkpoint: input.execution.checkpoint`.
- Consultas incrementais com checkpoint usam comparação inclusiva `>=` no provedor aliada a ordenação determinística (p.ex. `sort=id:asc`) e upsert idempotente por `identity.columns` no engine, garantindo que empates no mesmo segundo entre lotes ou entre ciclos consecutivos jamais percam alterações e tolerem pequenas defasagens de relógio.

#### 4.3 Remoção de `date_range` legado e mapeamento no `@mr-tick/redmine-plugin`
- **Separação canônica entre seleção principal (`startDate`/`endDate`) e filtros secundários (`AGENTS.md` #33):**
  - Remover o filtro redundante `{ id: 'date_range' }` de `supportedFilters` em [`redmine-plugin/src/analytics/manifest.ts`](file:///c:/myapps/metric-context/redmine-plugin/src/analytics/manifest.ts) e [`FakeAnalyticsProvider.ts`](file:///c:/myapps/metric-context/metric/src/dev-addons/datasource-fake/src/FakeAnalyticsProvider.ts), declarando `selection: { dateRange, project }` explicitamente por dataset (mantendo em `supportedFilters` apenas filtros de data secundários como `closed_date_range` e `updated_date_range`).
  - No `redmineParams` (`filter-resolver.ts`), remover o tratamento legado de `name === 'date_range'` em `filters`: apenas os campos canônicos `input.startDate` e `input.endDate` controlam o período principal (`spent_on` / `created_on`), garantindo que fatiamentos `[windowStart, windowEnd]` de `windowRescan` nunca colidam ou sejam apagados por `filters`. Atualizar `RedmineAnalyticsProvider.spec.ts` para exercitar data inválida diretamente em `startDate` ou `closed_date_range`.
- **`redmine_issues`**:
  - `modes: ['snapshot', 'changes']`, `identity: { kind: 'row', columns: ['id'] }`, `changes: { deletions: 'none' }`, `selection: { dateRange: true, project: true }`.
  - No `snapshot` final (`finished === true`): calcula `checkpoint` como o maior `updated_date` ISO observado nas linhas em todas as páginas (ou omite `checkpoint` se `0` linhas).
  - Na execução `changes`:
    - Valida `checkpoint` não vazio e aplica `updated_on >= <checkpoint>` normalizado para o formato aceito pelo Redmine (`YYYY-MM-DDTHH:MM:SSZ`, ou data `YYYY-MM-DD` se o checkpoint vier somente como data), sempre com `sort=id:asc`.
    - **Preserva integralmente** os filtros ativos do escopo (`project_id`, `status_id`, `tracker_id`, `assigned_to_id`, `created_on` derivado exclusivamente de `startDate`/`endDate`, `closed_on` de `closed_date_range`).
    - Se o usuário também filtrou `filters.updated_date_range`, calcula a interseção efetiva com `[checkpoint, updated_date_range.to]`: se o limite inferior derivado de `checkpoint` superar `updated_date_range.to`, retorna lote único concluído e vazio (`rows: []`, `deletedIds: []`, `checkpoint: input.execution.checkpoint`) sem disparar HTTP desnecessário.
    - Para cada página com delta, valida contagem (`total_count`), monotonicidade de offset/cursor e unicidade na varredura incremental; lotes intermediários com `continuation` emitem `coverage: 'partial'` e a conclusão multi-página emite `coverage: 'unverified'` (`REDMINE_REMOTE_SNAPSHOT_UNAVAILABLE`). *(Decisão nossa — Minor: durante a varredura `changes`, se uma página subsequente receber edição simultânea que altere `total_count`, falhar com `ANALYTICS_COLLECTION_CHANGED` igual ao snapshot para não publicar delta truncado.)*
- **`redmine_time_entries`**:
  - `modes: ['snapshot']`, `identity: { kind: 'row', columns: ['id'] }`, `selection: { dateRange: true, project: true }`, `windowRescan: { dateColumn: 'date' }`.
  - Proibido usar `updated_on`/`created_on`; toda re-leitura parcial recorta apenas o filtro `spent_on` (`startDate`..`endDate` na subjanela rolante solicitada pelo core).
- **Demais datasets Redmine** (`redmine_projects`, `redmine_users`, `redmine_versions`, `redmine_memberships`, `redmine_issue_categories`, `redmine_issue_relations`, `redmine_issue_journals`, `redmine_issue_statuses`, `redmine_trackers`, `redmine_activities`, `redmine_priorities`, `redmine_groups`, `redmine_queries`, `redmine_issue_discovery`):
  - Declarar explicitamente `extraction: { modes: ['snapshot'], identity: { kind: 'row', columns: ['id'] } }` (em especial em `redmine_issue_discovery`, para não herdar `'changes'` do objeto `redmine_issues`) e `selection` explícito por endpoint -> estratégia efetiva sempre `full_replace`.

#### 4.4 Provedor independente para prova contratual (`@mr-tick/datasource-fake`)
- Estender `@mr-tick/datasource-fake` (sem adicionar lógica especial no core) com um dataset identificado por linha (`identity: { kind: 'row', columns: ['id'] }`) suportando paginação controlada de `changes` com `deletions: 'explicit'` (emitindo `coverage: 'partial'` em lotes intermediários e `'complete'` na página final transacional), permitindo que `[F4-03]` valide ponta a ponta no core/DuckDB inserção, atualização e remoção explícita via `deletedIds` por um segundo provedor independente do Redmine.

---

### [F3-02] Persistência do estado de sincronização e preferências no DuckDB

#### 4.5 Schema canônico v2 no `DuckDBAnalyticsEngine`
Como toda a arquitetura segue a proibição de manter bases legadas sem representação canônica (`metric/AGENTS.md` #33), a Fase 3 atualiza o formato canônico do banco analítico de workspace para `analytics_format.version = 2` (rejeitando arquivos antigos v1 com `ANALYTICS_STORAGE_FORMAT_UNSUPPORTED`, sem apagar dados do usuário automaticamente) e cria no `open()` duas tabelas internas inacessíveis à SQL do usuário:

1. **`analytics_sync_states`**:
   - Chave primária: `(connection_id, authorization_key, selection_key)`
   - Colunas:
     - `dataset_id VARCHAR NOT NULL`
     - `strategy VARCHAR NOT NULL` (`'incremental_changes' | 'window_rescan' | 'full_replace'`)
     - `checkpoint VARCHAR` (nullable)
     - `last_fast_sync_at VARCHAR NOT NULL`
     - `last_full_reconcile_at VARCHAR NOT NULL`
     - `coverage VARCHAR NOT NULL` (`'complete' | 'unverified'`)
     - `coverage_reason VARCHAR` (nullable)
     - `last_window_start VARCHAR` (nullable)
     - `last_window_end VARCHAR` (nullable)
     - `last_error VARCHAR` (nullable)
     - `last_error_at VARCHAR` (nullable)
2. **`analytics_workspace_settings`**:
   - Armazena configurações estritamente analíticas do próprio workspace (sem dados operacionais nem credenciais):
     - `workspace_id VARCHAR PRIMARY KEY`
     - `polling_interval_minutes INTEGER NOT NULL`
     - `spaces_json VARCHAR` (nullable; persistência local dos espaços analíticos, widgets e workflow nodes do workspace para viabilizar hidratação completa entre navegações e reinicializações)
     - `date_from VARCHAR` / `date_to VARCHAR` (nullable; período global selecionado na tela)
     - `updated_at VARCHAR NOT NULL`

#### 4.6 Contrato `IAnalyticsEngine` estendido e transações atômicas
Estender `IAnalyticsEngine` (implementado exclusivamente por `DuckDBAnalyticsEngine`, em que cada operação usa a fila serial e transações curtas sem HTTP aberto):
- `listPublications(workspaceId, authorizations)` -> retorna publicações válidas + seus respectivos `AnalyticsSyncState` (somente para `(connection_id, authorization_key)` presentes em `authorizations`, garantindo isolamento imediato se uma conexão mudar de credencial/usuário ou for revogada).
- `getSyncState(owner)` -> lê o estado de sincronização persistido para `(connection_id, authorization_key, selection_key)` ou `undefined`.
- `recordSyncFailure(owner, errorMessage, failedAt)` -> caso já exista publicação e registro em `analytics_sync_states`, atualiza apenas `last_error` e `last_error_at` sem alterar `generation_id`, `checkpoint`, `last_fast_sync_at` nem `last_full_reconcile_at`.
- `revokeConnection(workspaceId, connectionInstanceId)` -> remove publicações, gerações publicadas e estados de sincronização associados exclusivamente à `connectionInstanceId` especificada dentro desse `workspaceId` (sem afetar demais conexões ou outros workspaces).
- `getWorkspaceState(workspaceId)` / `saveWorkspaceState(workspaceId, input)` -> lê e persiste `pollingIntervalMinutes`, `spaces` e período global em `analytics_workspace_settings`.
- Modos de publicação em `IAnalyticsEngine`:
  - `publish(generation, coverage, fetchedAt, syncMeta)`: swap completo (`full_replace`), promovendo `generation` como geração publicada e gravando `analytics_sync_states` (com `last_fast_sync_at` e `last_full_reconcile_at` atualizados) **dentro da mesma transação**.
  - `publishWindowMerge(baseGenerationId, windowStagingGeneration, windowBounds, coverage, fetchedAt, syncMeta)`: clona a base publicada para uma nova `generation` e substitui atomicamente a subjanela `[windowStart, windowEnd]` + IDs entrantes (descrito em 4.7), atualizando `analytics_publications` e `analytics_sync_states` (`last_fast_sync_at`, `last_window_*`, mantendo `last_full_reconcile_at`) na mesma transação e removendo o staging e a geração anterior.
  - `publishChangesMerge(baseGenerationId, deltaStagingGeneration, deletedIds, coverage, fetchedAt, syncMeta)`: clona a base publicada para uma nova `generation`, aplica `deletedIds` explícitos (apenas se `deletions === 'explicit'`), aplica upsert do staging delta por `identity.columns`, promove e atualiza `analytics_sync_states` (`checkpoint`, `last_fast_sync_at`, mantendo `last_full_reconcile_at`) na mesma transação e remove o staging e a geração anterior.

Regra de **invariante de falha e evolução de schema**:
- Evolução puramente aditiva (novos `custom_field_*` ainda inexistentes na base) expande a geração clonada com `NULL` de forma transparente durante `publishWindowMerge` e `publishChangesMerge`.
- Divergência de schema **entre páginas da mesma extração em andamento** (`snapshot`, `changes` ou `window_rescan`) continua falhando imediatamente com `ANALYTICS_SCHEMA_CHANGED_DURING_LOAD` (`[F2-05]`).
- Divergência incompatível de tipo/identity/providerFieldId **entre a tabela base publicada anteriormente e uma extração rápida internamente consistente** (`ANALYTICS_SCHEMA_CHANGED_DURING_LOAD` na etapa de `publishWindowMerge` ou `publishChangesMerge`): descarta o staging rápido, promove automaticamente **uma única vez** no `AnalyticsWarehouseService` para reconciliação completa (`full`) a fim de reconstruir o schema canônico v2 sem erro espúrio; apenas se essa recarga `full` também falhar o serviço registra `recordSyncFailure` mantendo a última base publicada intacta.
- Em qualquer outra falha antes do commit (violação de `<= 50.000` linhas finais na tabela mesclada, erro de rede ou revogação de autorização), a transação sofre rollback, o staging é limpo (`remove(staging, 'cleanup')`) e a geração publicada + `analytics_sync_states` anteriores permanecem intactos.

---

### [F3-03] Invariantes de reconciliação por modo

1. **Reconciliação de escopo completo (`full`):**
   - Extrai todo o escopo `[startDate, endDate]` e filtros configurados via `snapshot` (ou `aggregate`).
   - Gera nova tabela do zero (suportando reconstrução limpa de colunas caso algum custom field tenha mudado de tipo entre recargas remotas, conforme `[F2-05]`).
   - Substitui `analytics_publications`, atualiza `lastFastSyncAt = now` e `lastFullReconcileAt = now`, e grava `checkpoint` se emitido pelo provedor. Captura adições, alterações antigas, itens que saíram de filtros e exclusões remotas.

2. **Re-leitura por subjanela rolante (`window_rescan`, p.ex. `redmine_time_entries`):**
   - Pré-condições obrigatórias: existir publicação prévia + `manifest.extraction.windowRescan` válido + `identity.kind === 'row'`. Se faltar publicação prévia ou se `now - lastFullReconcileAt >= fullReconcileIntervalMs`, promove automaticamente para reconciliação completa (`full`).
   - **Cálculo determinístico da subjanela `[windowStart, windowEnd]`** (em datas ISO `YYYY-MM-DD`, UTC):
     - `cutoffStart = todayUtc - (rollingWindowDays - 1)` (para padrão `14` dias, cobre de `D-13` até `todayUtc` inclusive).
     - `windowStart = max(selectionStartDate, cutoffStart)` (se `selectionStartDate` ausente, usa `cutoffStart`).
     - `windowEnd = min(selectionEndDate, todayUtc)` (se `selectionEndDate` ausente, usa `todayUtc`).
     - **Caso histórico fechado fora da subjanela recente (`windowStart > windowEnd`):** se o usuário configurou um escopo totalmente no passado anterior aos últimos `14` dias (ex.: agosto em novembro), o ciclo rápido encerra em **no-op limpo sem requisição HTTP**, preservando a publicação e o `lastFullReconcileAt` intactos (alterações retroativas nesse histórico fechado continuam cobertas pelo deep reconcile de 6h e pelo ressync manual).
   - **Aplicação transacional no `publishWindowMerge`:**
     - Só executa após concluir 100% das páginas da subjanela `[windowStart, windowEnd]` (`batch.finished === true`, sem erro nem `coverage === 'partial'`).
     - Cria a nova geração copiando `baseGeneration` (ampliando colunas com `NULL` para novos custom fields; se houver conflito incompatível com a tabela base em coluna existente, falha com `ANALYTICS_SCHEMA_CHANGED_DURING_LOAD` para acionar a promoção única automática a `full` descrita em 4.6).
     - Em cada passo dentro da transação única:
       1. Deleta na nova geração toda linha onde `(CAST(dateCol AS DATE) >= DATE windowStart AND CAST(dateCol AS DATE) <= DATE windowEnd)`.
       2. Deleta na nova geração qualquer linha cuja chave `identity.columns` exista na tabela staging (capturando registros movidos *para dentro* da subjanela a partir de data anterior a `windowStart`, evitando duplicação por chave única).
       3. Insere todas as linhas da geração staging e atualiza `row_count` + valida limite total `<= 50.000` linhas.
     - **Nota sobre cobertura combinada:** se a base anterior ou o lote da subjanela for `'unverified'`, a geração mesclada resultante permanece `'unverified'` (mantendo a razão mais recente). Apenas uma reconciliação completa bem-sucedida com cobertura `'complete'` restaura `'complete'`.

3. **Atualização incremental (`changes`, p.ex. `redmine_issues` ou fixture F4-03):**
   - Pré-condições obrigatórias: existir publicação prévia + `checkpoint` persistido não vazio em `analytics_sync_states` + `manifest.extraction.modes.includes('changes')` + `identity.kind === 'row'`. Se faltar publicação ou checkpoint, promove automaticamente para `full`.
   - Extrai todas as páginas de `{ kind: 'changes', checkpoint, cursor?, batchSize? }`, respeitando o mesmo teto total de páginas/linhas e preservando ordem cronológica de aplicação caso a mesma `id` apareça em mais de um lote delta (mantém última versão recebida no delta).
   - Na transação `publishChangesMerge`:
     1. Clona `baseGeneration` (aplicando evolução aditiva segura para novos custom fields, ou sinalizando `ANALYTICS_SCHEMA_CHANGED_DURING_LOAD` para promoção única a `full` em conflito incompatível de coluna existente com a base).
     2. Se `manifest.extraction.changes?.deletions === 'explicit'`, remove linhas cujos IDs constam em `deletedIds`. **Se `deletions === 'none'`, nenhuma linha é apagada por ausência.**
     3. Remove por `identity.columns` todas as linhas cujas chaves existem no delta staging e insere as linhas do delta staging (upsert determinístico sem duplicação).
     4. Valida teto `<= 50.000` linhas e atualiza `checkpoint` (com o último `checkpoint` retornado pelo provedor) + `lastFastSyncAt`. Se o delta teve zero alterações (`rows.length === 0 && deletedIds.length === 0`), mantém a tabela/linhas idênticas e atualiza apenas `analytics_sync_states` (`last_fast_sync_at`/`checkpoint`), evitando clonar a tabela ou invalidar paginações abertas na UI quando `coverage === base.coverage`.

4. **Mudança de filtro/escopo e erro de autorização:**
   - Mudança de projeto, período global/personalizado do nó (`customDateRange` escrito em `query.startDate`/`query.endDate`), filtros de nó (excluindo valores vazios) ou modo `aggregate` recalcula `selectionKey` distinta em `analyticsSelectionKey`, isolando cada seleção sem sobrescrever outras seleções do mesmo workspace.
   - Em erro `401` / `403` do provedor ou alteração de `authorizationKey` detectada na rechecagem pós-extração: `AnalyticsWarehouseService` invoca `analyticsEngine.revokeConnection(workspaceId, connectionInstanceId)` e a UI limpa exclusivamente os nós/publicações da conexão afetada, preservando todas as demais conexões válidas.

---

### [F3-04] Frequência, gatilhos e cadência dupla

Política declarada em contrato tipado (`AnalyticsRefreshPolicy`) passado opcionalmente no input de carga com defaults canônicos no serviço:
- **`mode`: `'auto' | 'fast' | 'full'`** (padrão `'auto'`, enquanto o botão manual `Sincronizar` envia explicitamente `mode: 'full'`).
- **`rollingWindowDays`:** padrão **`14`** dias (`>= 1`).
- **`fullReconcileIntervalMinutes`:** padrão **`360`** minutos (**`6` horas**). Aceita override explícito no contrato (validado por Zod) para permitir testes determinísticos em `[F4-01]` sem uso de timers ou espera real de 6 horas.
- **Intervalo de polling na UI (`pollingIntervalMinutes`):**
  - Configurável diretamente na barra superior (`AnalyticsTopBar`), com padrão **`5`** minutos e opção **`0` (`Somente manual`)** para desligar polling automático, persistido em DuckDB (`analytics_workspace_settings`).
  - O timer de polling vive estritamente montado no ciclo de vida da tela Analytics no renderer (`useEffect` limpo no unmount), disparando `syncAll` apenas quando a aba/view de Analytics estiver ativa (nenhuma sincronização quando o usuário sai do Analytics, troca para Time Entries ou fecha a janela).

#### Matriz de comportamento nos gatilhos da UI
1. **Ao abrir o Analytics:**
   - Chama imediatamente `hydrateAnalytics(workspaceId)` (somente DuckDB local, sem HTTP).
   - Renderiza `spaces`, período global, `pollingIntervalMinutes` e todas as publicações/sync states salvos em milissegundos.
   - Para fontes configuradas no espaço ativo **sem** publicação para sua `selectionKey` atual, dispara automaticamente carga inicial (`mode: 'auto' -> full`).
   - Se a fonte já está hidratada e o intervalo de polling configurado (`pollingIntervalMinutes > 0`) já estiver vencido em relação a `lastFastSyncAt` (ou ao `fullReconcileIntervalMinutes`), dispara refresh não bloqueante em segundo plano mantendo os gráficos visíveis; se houver falha offline, os gráficos hidratados permanecem exibidos com alerta de erro não destrutivo.
2. **Enquanto a tela permanece aberta (`pollingIntervalMinutes > 0`):**
   - A cada ciclo de `pollingIntervalMinutes`, executa `mode: 'auto'` apenas para o conjunto deduplicado de seleções únicas do espaço ativo (se nenhuma sincronização para aquela chave já estiver ativa).
   - `AnalyticsWarehouseService` decide de forma transparente por seleção:
     - `lastFullReconcileAt` ausente ou expirado (`>= 6 h`) -> reconciliação completa (`full`);
     - `changes` suportado -> atualização incremental (`changes`);
     - `windowRescan` suportado -> atualização rápida da janela rolante de `14` dias (`window_rescan`);
     - caso contrário -> substituição completa (`full_replace`).
3. **Ao clicar manualmente em `Sincronizar`:**
   - Executa `mode: 'full'` para todas as seleções únicas do espaço ativo, garantindo reconciliação completa imediata de exclusões remotas, permissões e correções retroativas antigas.

---

### [F3-05] Reuso entre relatórios, coalescing e hidratação na UI

1. **Identidade única de fonte compartilhada:**
   - Na UI (`use-analytics-workspace.ts`), o estado de cache e sincronização deixa de ser acoplado isoladamente a `node.id` como fonte primária de fetch e passa a usar uma tabela reativa por chave canônica de fonte+seleção `(connectionId, selectionKey)`, projetada para cada `node.id` que referencie o mesmo escopo.
   - Remover o `useEffect` ocioso dependente de `selectedConnectionId` e corrigir `handleSyncAllSources` (e o polling periódico): em vez de percorrer `sourceNodes` sequencialmente repetindo chamadas ao provedor quando 3 gráficos ou 2 nós usam os mesmos apontamentos/tarefas, deduplicar as seleções únicas `(connectionId, selectionKey)` e executar respeitando o limite de concorrência/orçamento sem duplicar extrações.
   - Quando uma seleção única conclui atualização ou falha, **todos** os `source` nodes vinculados a ela recebem atomicamente a mesma publicação atualizada, metadados de sync e eventual estado de erro.
2. **Coalescing no `AnalyticsWarehouseService`:**
   - O mapa `this.loads` de operações em voo garante compartilhamento por `(workspaceId, connectionInstanceId, authorizationKey, selectionKey)`:
     - Chamadas simultâneas de carregamento para a mesma seleção coalescem na mesma Promise.
     - Se houver carga `fast` (`changes`/`window_rescan`) em andamento e o usuário disparar um ressync manual `full` para a mesma seleção, a solicitação `full` aguarda a conclusão/limpeza da carga em voo antes de iniciar o `full`, evitando duas gravações concorrentes ou perda do comando manual de reconciliação completa.
3. **Persistência automática das definições do espaço:**
   - Alterações do usuário em `spaces`, widgets, workflow nodes, período global e `pollingIntervalMinutes` são salvas no DuckDB via `saveAnalyticsWorkspaceState` (com debounce reativo limpo / salvamento em mudança confirmada, sem timers artificiais nos testes), tornando a reabertura do Analytics consistente com o estado deixado pelo usuário.
4. **Seleção canônica de período no nó (`customDateRange`) e limpeza de filtros:**
   - Em `SpaceWorkflowNodeConfig`, substituir o uso de `filterValues.date_range` pelo campo tipado `customDateRange?: { from?: string; to?: string }`, controlado no `WorkflowNodeConfigDialog` diretamente por `manifest.selection?.dateRange === true` (`Usar período do painel vs. Personalizado`) e resolvido apenas em `query.startDate`/`query.endDate`.
   - Filtros secundários de data (`type === 'date_range'`, como `closed_date_range` e `updated_date_range`) são renderizados de forma independente do período global do painel, e valores vazios (`{ from: '', to: '' }` ou `undefined`) são omitidos antes de enviar consultas ao provedor ou calcular `analyticsSelectionKey`.

---

### [F3-06] Progresso por lote, cobertura e estados de UX

#### 4.8 Canal de progresso `main -> renderer`
- Adicionar evento tipado em `ISystemEvents` (`metric/src/packages/shared/src/transport/ISystemEvents.ts`):
  - Canal: `'analytics:load-progress'`
  - Payload:
    ```ts
    export interface AnalyticsLoadProgressEvent {
      workspaceId: string
      connectionInstanceId: string
      selectionKey: string
      datasetId: string
      mode: 'full' | 'changes' | 'window_rescan'
      phase: 'extracting' | 'publishing' | 'completed' | 'failed'
      batchIndex: number
      fetchedRows: number
      totalRows?: number
      coverage?: 'complete' | 'unverified'
    }
    ```
- Injetar `ISystemEventEmitter` como dependência **obrigatória** no construtor de `AnalyticsWarehouseService` (registrado no `IoC.ts` / `PlatformDependencies`; `NoOpSystemEventEmitter` em testes unitários que não precisem de eventos).
- No processo principal do desktop (`main/index.ts`), garantir que o `systemEventEmitter` (ou adapter que implementa `ISystemEventEmitter`) propague `'analytics:load-progress'` para todas as `BrowserWindow` ativas (`win.webContents.send('analytics:load-progress', payload)`), consumido na UI exclusivamente por `bridge.events.on('analytics:load-progress', ...)`.
- O evento é emitido uma vez por lote recebido do provedor (sem flooding por linha), ao entrar em `'publishing'` e no término (`'completed'` ou `'failed'`).

#### 4.9 Estados explícitos na interface Analytics
1. **Primeira carga (nenhuma publicação existente para a seleção do nó/widget):**
   - `SmartGridView` e diálogos afetados exibem `<Skeleton />` estruturado (`AGENTS.md` #28) acompanhado de indicador de progresso em tempo real derivado de `analytics:load-progress` (ex.: `Carregando lote 3 • 300 de 1.250 registros` ou `300 registros carregados` quando o provedor não informa total).
2. **Atualização em segundo plano (já existe geração publicada anterior):**
   - **Gráficos e tabelas permanecem 100% visíveis e interativos** usando a versão publicada atual; nenhum gráfico desaparece nem vira skeleton durante o refresh.
   - A barra superior (`AnalyticsTopBar`) exibe estado discreto de atualização (`Sincronizando em segundo plano • Lote X...` + ícone girando no botão `Sincronizar`), e ao concluir a publicação atômica os dados dos gráficos são atualizados pela nova `publicationVersion`.
3. **Ocioso / Hidratado:**
   - Subcabeçalho / barra de status do espaço ativo mostra:
     - Última atualização (`lastFastSyncAt`) e última reconciliação completa (`lastFullReconcileAt`), explicitando quando houver janela rolante (`últimos 14 dias`) ou atualização incremental ativa;
     - Controle explícito de frequência de polling em minutos (`Desativado`, `1 min`, `5 min`, `15 min`, `30 min`, `60 min`, ou valor customizado `>= 1`);
     - Indicador claro de cobertura: badge `Cobertura não verificada` com o código/motivo retornado pelo provedor quando `coverage === 'unverified'` (ex.: paginação multi-página Redmine sem snapshot remoto transacional).
4. **Falha com retenção de versão vs. falha crítica de autorização:**
   - **Erro transitório após publicação válida existente** (rede, timeout, 5xx, `ANALYTICS_DUPLICATE_ROW_IDENTITY` no Redmine 3.4): mantém os gráficos na última versão publicada, exibe `AnalyticsError` estruturado (`role="alert"`, com `message` e `details` vindos do `AppError`, mais botão `Tentar novamente`) sinalizando que os dados exibidos pertencem à última versão disponível.
   - **Erro `401` / `403` / autorização alterada:** limpa exclusivamente os dados da conexão afetada, exibe alerta de autorização somente para os nós dependentes dessa conexão e preserva outras conexões válidas operando normalmente.

---

## 5. O que fica a critério do implementador

- Nomes exatos dos métodos internos auxiliares em `DuckDBAnalyticsEngine.ts`, nomes de índices SQL internos e organização de subfunções dentro de `AnalyticsWarehouseService.ts` e `redmine-plugin/src/analytics/`.
- Nomes exatos dos novos canais IPC em `IpcChannels.ts`, `addonsInvoker.ts`, `AnalyticsWarehouseHandler.ts` e esquemas Zod em `analyticsWarehouse.ts` / `analyticsQuery.ts` (seguindo estritamente as convenções `.strict()` já adotadas na Fase 2).
- Estrutura visual e componentes Shadcn internos na `AnalyticsTopBar`, barras de progresso e badges de status (obedecendo `rounded-lg` máximo, skeletons estruturados e tokens de tema existentes).
- Organização dos arquivos de teste determinísticos em Vitest (unitários/integração com DuckDB real e `@mr-tick/redmine-plugin`) e E2E Electron cobrindo os cenários exigidos posteriormente em `[F4-01]` a `[F4-03]`.

---

## 6. Decisões menores tomadas no desenho (para conferência)

1. **Polling padrão de `5` minutos** enquanto a tela Analytics estiver aberta, com opção `0 = Somente manual` configurável em tela; valores personalizados são inteiros de `1` a `1440`, conforme o contrato IPC persistido.
2. **Subjanela rolante padrão de `14` dias** e **reconciliação completa automática a cada `6` horas**; quando o período selecionado pelo usuário estiver totalmente no passado antes da subjanela dos últimos 14 dias, o ciclo rápido realiza **no-op limpo sem HTTP** aguardando a reconciliação de 6h ou clique manual em `Sincronizar`.
3. **Bump canônico de `analytics_format.version` para `2`** ao adicionar `analytics_sync_states` e `analytics_workspace_settings`, recusando arquivos v1 antigos com `ANALYTICS_STORAGE_FORMAT_UNSUPPORTED` sem apagar dados do usuário automaticamente (alinhado a `metric/AGENTS.md` #33).
4. **Delta incremental `changes` vazio preserva `generationId` publicado** (atualizando apenas `last_fast_sync_at`/`checkpoint` em `analytics_sync_states`), evitando invalidação desnecessária de paginações ativas na UI quando nada mudou remotamente.
5. **Regras de `coverage` em operações mescladas (`window_rescan` / `changes`):** se a base anterior ou o lote de atualização tiver `coverage: 'unverified'`, a geração resultante permanece `'unverified'`; apenas uma reconciliação completa (`full`) com lotes `'complete'` restabelece cobertura `'complete'`.
6. **Persistência do polling e dos espaços do Analytics no próprio DuckDB do workspace (`analytics_workspace_settings`)**, evitando misturar metadados analíticos no `WorkspacesRepository` operacional ou no `AppSettings` global.
7. **Sem dependência de catálogo online na abertura hidratada:** a hidratação compara a assinatura das seleções locais contra `AnalyticsPublication` já salvos no DuckDB (que carregam seu `manifest` e `selectionKey`), permitindo exibição offline imediata.
8. **Em varredura incremental `changes` multi-página no `@mr-tick/redmine-plugin`**, mudança de `total_count` entre páginas falha explicitamente com `ANALYTICS_COLLECTION_CHANGED` (igual ao snapshot), preservando atomicidade e evitando delta truncado.
9. **Remoção canônica de `filters.date_range` legado (`AGENTS.md` #33):** `selection: { dateRange, project }` passa a ser declarado diretamente nos manifestos (`redmine-plugin` e `datasource-fake`), o diálogo de nó persiste sobrescrita de período em `customDateRange` (aplicada apenas em `query.startDate`/`query.endDate`) e filtros secundários de data vazios são omitidos, eliminando colisões com subjanela `[windowStart, windowEnd]` e o payload inválido `{ from: '', to: '' }`.
10. **`Snapshot` inicial com `0` linhas omite `checkpoint`:** `IHttpClient` permanece inalterado (sem expor cabeçalhos HTTP nem depender do relógio do cliente); escopos inicialmente vazios permanecem em recarga `full` (1 requisição leve) até existirem registros que forneçam timestamp real do servidor.
11. **Conflito de schema entre base publicada e delta rápido auto-promove uma vez para `full`:** evolução puramente aditiva de novos custom fields é mesclada com `NULL`; divergência entre páginas da mesma extração continua falhando com `ANALYTICS_SCHEMA_CHANGED_DURING_LOAD` (`[F2-05]`); divergência incompatível entre a base antiga e uma extração rápida internamente consistente aciona uma única reconciliação `full` automática no `AnalyticsWarehouseService`, retendo a base anterior apenas se essa `full` falhar.
