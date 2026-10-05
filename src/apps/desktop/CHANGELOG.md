# @mr-tick/desktop

## 0.8.3

### Patch Changes

- df0ddc8: Recover time-entry creation across concurrent windows, restarts and lost responses using a durable original payload and exact correlation. Preserve edits and deletions made while a create is in flight. Use the complete canonical remote state to update the local cache and detect conflicts without comparing client/server clocks. Preserve HTTP status and server errors, expose explicit ambiguous creation recovery, and test normalization with an independent fake remote store. Isolate Electron E2E storage from the installed app profile. Keep the pre-release local database schema at version 0.

  Serialize workspace initialization, connection setup and teardown so cancelled transitions cannot overwrite a newer workspace or close a database still being opened. Release the active store on provider unmount and cover teardown/init races with deterministic regression tests. Update the conflict E2E to follow automatic conflict detection.

  Prevent reconciliation from deleting remote time entries after a failed or incomplete listing. Require a successful complete snapshot, enforce both date-window bounds, preserve concurrent local edits, and persist remote deletion acknowledgements as cache-only tombstones that the push layer never sends as DELETE requests. Retain user-requested deletions. Add an Electron E2E that first reproduced 72 unintended remote deletions after a single HTTP 503, plus regression coverage for partial listings and both deletion origins.

- df0ddc8: Add an optional server-atomic conditional update contract. Preserve pending PUT/DELETE intent and the approved baseline through transient failures; retain terminal tombstone failures and original HTTP status in the global sync indicator. Retry canonical reads of confirmed legacy writes without repeating writes, using a durable submitted snapshot that preserves later edits. Find imported tombstones by exact connection and remote identity, restore complete accepted conflict baselines, and cover concurrent pulls and writes with deterministic Electron regressions. Conditional writes protect only providers that implement the server guarantee; the default Redmine API retains its documented concurrency limit.

  Persist explicit deletion acknowledgements separately from reconciliation tombstones. Apply push responses only to the current connection and remote identity, preserve retry backoff when releasing preflight claims, and reset all remote metadata on explicitly authorized recreation. Block connection changes during canonical confirmation and discard only staged edits on cancellation.

  Use a deterministic local SHA-256 identity for newly imported time entries, scoped to the connection and pure remote ID, so concurrent RxDB downstreams converge without duplicate local hours. Snapshot the local identity and approved business state before pull HTTP and revalidate atomically before applying observations, including equal remote timestamps and explicit correlation ambiguity.

  Retain the pull checkpoint when concurrent local changes leave an incoming canonical version unacknowledged, allowing a later pull to revisit it. Already incorporated or strictly older versions and deliberate local edits continue advancing normally.

- df0ddc8: Replace time-entry pull arrays with a required snapshot page contract carrying a provider-owned cursor, snapshot identity and explicit continuation. Add stateless SDK snapshot pagination so changes to an existing ID at an unchanged timestamp are revisited. Migrate the host bridge, desktop, fake provider and landing mock together; no legacy pull-contract branch remains.

  Revalidate connection ownership inside atomic creation claims. Preserve later confirmations when stale failure or equal-timestamp success responses arrive from another window. Allow edits of imported entries with no task without inventing a task identity, while still requiring a task for new entries. Validate checkpoint progress before local mutations and retain provider cursors through filtered pages and retries.

  Avoid rewriting already acknowledged canonical documents during snapshot rescans. Preserve their RxDB revision and pull metadata while continuing past unchanged pages to changed records, retaining existing atomic guards for uncertain observations and tombstones.

- Updated dependencies [53c3eb1]
- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
  - @mr-tick/ui@1.5.1
  - @mr-tick/application@1.4.0
  - @mr-tick/adapters@1.1.5
  - @mr-tick/shared@1.2.0

## 0.8.2

### Patch Changes

- adae8ae: Corrige a hidratação e propagação de `taskData` nas replicações de apontamentos de tempo e resolução de títulos e trackers de tarefas no popover e tabelas.
- f91a79c: fix(ui): adiciona subscription reativa no RxDB para o popover de tarefas, preserva tarefas recentes sem truncamento prematuro e expande suite e2e
- 165229a: Corrige isolamento de identificadores (Regra 13) ao selecionar tarefas no widget e popover, otimiza busca de tarefas com ordenação em memória, adiciona indexação por conexão no RxDB para eliminar travamentos e suporta campos nulos (description, dueDate, etc.) no schema de tarefas do RxDB.
- 9afb4a1: Implementa busca sob demanda e auto-enriquecimento em segundo plano de tarefas faltantes com persistência no RxDB local, garantindo exibição de títulos e metadados na tabela de apontamentos, popover e lookup.
- Updated dependencies [adae8ae]
- Updated dependencies [f91a79c]
- Updated dependencies [165229a]
- Updated dependencies [9afb4a1]
  - @mr-tick/ui@1.5.0
  - @mr-tick/application@1.3.0
  - @mr-tick/adapters@1.1.4

## 0.8.1

### Patch Changes

- 0c03498: Adicionar suporte a comments nulos e fuso horário noturno na entidade TimeEntry e suíte E2E automatizada de sincronização e cenários caóticos com DataSource Fake
- Updated dependencies [0c03498]
  - @mr-tick/ui@1.4.1
  - @mr-tick/adapters@1.1.3
  - @mr-tick/application@1.2.2

## 0.8.0

### Minor Changes

- 5925d4c: feat: adiciona popover tri-modo compacto (lista, semanal, mensal) na barra de tempo e melhorias visuais

  - **Popover Tri-modo de Apontamentos:** Alternador dinâmico entre visualização em Lista, Semanal e Mensal diretamente na barra de tempo (`Overview`), com suporte a DnD e persistência de ordenação no widget.
  - **Desacoplamento de Range:** Isolamento total dos períodos semanal e mensal em relação aos parâmetros da URL (`ignoreUrlRange: true`), garantindo navegação independente e sem interferência mútua.
  - **Identidade Visual e Anti-fundo:** Botão de adição em grupo mestre atualizado para o componente Link (`variant="link"`) com cor semântica `text-foreground` / `hover:text-foreground/80` adaptável a temas claro e escuro.
  - **Padronização Visual nas 3 Visões:** Substituição de marcadores genéricos por `<DataSourceLogo />` e ícones mapeados de trackers (`TrackerIconComponent`), além da remoção de nomes brutos de datasource e exibição limpa do chip `#ID - Título` com tooltip de hover.
  - **Estabilidade de Layout:** Calibração dos inputs triplos de tempo no modo compacto prevenindo corte de dígitos, preservação da coluna de sincronização e rolagem vertical suave nas tabelas.

### Patch Changes

- Updated dependencies [5925d4c]
  - @mr-tick/ui@1.4.0

## 0.7.0

### Minor Changes

- 271b7ed: feat: adiciona modo mini ultracompacto, edicao vertical fluida e melhorias ergonomicas no tracker

  - **Modo Mini:** Suporte a exibicao compacta do widget de tempo com redimensionamento inteligente de ferramentas e icones.
  - **Edicao Vertical de Tempo Fluida:** Segmentos empilhados (HH/MM/SS) com navegacao agil pelo teclado sem estourar o layout na vertical.
  - **Expansor Rente as Bordas:** Botao expansor integrado como endcap no modo horizontal e footer no modo vertical, colado as bordas sem margens residuais.
  - **Botoes Padronizados:** Proporcao 1:1 quadrada (24px) para acoes e split button no modo mini.
  - **Engine Dinamica de Addons:** Suporte a schemas declarativos e mapeamento pos-autenticacao sem chaves hardcoded.

## 0.6.2

### Patch Changes

- Updated dependencies [2e336c8]
  - @mr-tick/ui@1.3.2

## 0.6.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.
- Updated dependencies [fca1bd6]
  - @mr-tick/application@1.2.1
  - @mr-tick/ui@1.3.1
  - @mr-tick/adapters@1.1.2

## 0.6.0

### Minor Changes

- f124a75: fix(mapping): resolve campo de mapeamento pós-autenticação via instância ativa de datasource

  Corrige falha arquitetural onde `getMappingFields` era chamado antes da autenticação,
  retornando sempre uma lista vazia pois o `IDataSource` estático não possui contexto de
  credenciais ou URL do servidor remoto.

  **Mudanças:**
  - `IAddonsAPI.getMappingFields` agora aceita `workspaceId` e `connectionInstanceId` opcionais
  - `AddonsHandler.getMappingFields` prioriza resolver a instância autenticada via `IDataSourceResolver`
    quando `workspaceId` + `connectionInstanceId` estão presentes; mantém fallback para addons estáticos
  - `MappingConfigModal` propaga `workspaceId` e `connectionInstanceId` para o backend
  - `AddonFieldRenderer` e `MappingFieldItem` propagam os props de contexto de conexão
  - `DataSourceConnectionsContext` expõe `workspaceId` no contrato do contexto
  - `DataSourceInstancesManager` exibe botão "Configurar Mapeamento" por instância **conectada**,
    abrindo o `MappingConfigModal` com o contexto correto de autenticação

### Patch Changes

- 96c4dec: fix(ui): solid styling for activity badges, preset import with empty colors, and mapping reflection

  - Corrige estilização de badges de atividade para utilizar cor de fundo 100% sólida e opaca (`color-mix` sRGB), eliminando vazamento visual/transparência de itens inferiores em agrupamentos sobrepostos.
  - Torna o importador de presets flexível para aceitar definições com campos de cor vazios (`color: ""`).
  - Ajusta botão de exportação no `MappingConfigModal` para iniciar com o rótulo "Copiar JSON" e permitir cópia manual ou sob clique.
  - Atualiza componentes de visualização (`time-entries-table-columns`, `calendar-view`, `timesheet-view`, `task-lookup`) para refletir mapeamentos dinâmicos salvos no `localStorage`.
  - Adiciona testes unitários abrangentes e testes E2E Playwright no Electron validando importação de preset com 20 campos, exportação e persistência.

- Updated dependencies [96c4dec]
- Updated dependencies [f124a75]
  - @mr-tick/ui@1.3.0

## 0.5.1

### Patch Changes

- c43679a: Sincroniza automaticamente a versão e requiredApiVersion do manifest de dev-addons com a versão do package.json do SDK e torna dinâmicas as asserções de testes E2E com a versão do aplicativo em runtime.

## 0.5.0

### Minor Changes

- 82f3d48: Adiciona MappingConfigModal com seleção interativa de ícones Lucide, paleta de cores e importação/exportação de presets JSON para equipes, integrando AddonFieldRenderer aos canais IPC do Electron.

### Patch Changes

- 909bcc6: Centraliza a renderização de campos de schema em AddonFieldRenderer reutilizável, elimina duplicidade de código de formulários e adiciona testes E2E com FakeDataSource.
- Updated dependencies [82f3d48]
- Updated dependencies [82f3d48]
- Updated dependencies [909bcc6]
  - @mr-tick/application@1.2.0
  - @mr-tick/ui@1.2.0
  - @mr-tick/adapters@1.1.1

## 0.4.3

### Patch Changes

- Updated dependencies [9b79109]
  - @mr-tick/ui@1.1.3

## 0.4.2

### Patch Changes

- @mr-tick/ui@1.1.2

## 0.4.1

### Patch Changes

- 250dbe7: fix: prevent fatal RxDB DB9 error in production database initialization and stabilize E2E test suites
- Updated dependencies [250dbe7]
  - @mr-tick/ui@1.1.1

## 0.4.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- 91537fb: Fix RxDB DB9 error on workspace sync and database initialization
- 394905d: Standardize addon lifecycle contracts, add dynamic settings schema provider, declarative field scopes, and command auto-scoping
- Updated dependencies [00bc018]
  - @mr-tick/application@1.1.0
  - @mr-tick/adapters@1.1.0
  - @mr-tick/shared@1.1.0
  - @mr-tick/ui@1.1.0

## 0.3.0

### Minor Changes

- 662e2f9: Adiciona atualizador nativo em C++, assistente interativo de instalação NSIS com arte personalizada, novo ícone e melhorias no modal de atualização.
- d60f883: feat: implement in-app auto-updater and beta release channel support
- 36986ac: feat: release 0.3.0 stable

### Patch Changes

- 6cc4402: Fix prerelease update discovery by aligning updater channels and ensuring manifest availability.
- 6fb6b43: fix(desktop): do not treat older stable releases as updates when on beta channel
- 2a73915: fix: upload update manifest yml files and handle updater errors gracefully
- 01bd6eb: fix(desktop): support monorepo release tags and dynamic dev updater mock
- 0496e88: feat(updater): background updater notifications, auto-popup, refreshed ui, and native win32 portable updater with progress bar
  - @mr-tick/adapters@1.0.1
  - @mr-tick/application@1.0.1
  - @mr-tick/shared@1.0.1
  - @mr-tick/ui@1.0.4

## 0.3.0-beta.6

### Patch Changes

- 0496e88: feat(updater): background updater notifications, auto-popup, refreshed ui, and native win32 portable updater with progress bar

## 0.3.0-beta.5

### Patch Changes

- 6fb6b43: fix(desktop): do not treat older stable releases as updates when on beta channel

## 0.3.0-beta.4

### Patch Changes

- 01bd6eb: fix(desktop): support monorepo release tags and dynamic dev updater mock

## 0.3.0-beta.3

### Patch Changes

- 6cc4402: Fix prerelease update discovery by aligning updater channels and ensuring manifest availability.

## 0.3.0-beta.2

### Minor Changes

- 662e2f9: Adiciona atualizador nativo em C++, assistente interativo de instalação NSIS com arte personalizada, novo ícone e melhorias no modal de atualização.

## 0.3.0-beta.1

### Patch Changes

- 2a73915: fix: upload update manifest yml files and handle updater errors gracefully

## 0.3.0-beta.0

### Minor Changes

- d60f883: feat: implement in-app auto-updater and beta release channel support

## 0.2.0

### Minor Changes

- 5075727: Adiciona suporte ao desacoplamento de addons em ambiente de desenvolvimento via symlink e CLI dedicada

## 0.1.0

### Minor Changes

- a69bba3: Adiciona suporte às visualizações de apontamentos (time entries) em formato de calendário e timesheet.

## 1.0.1

### Patch Changes

- @mr-tick/ui@1.0.1
- @mr-tick/datasource-fake@1.0.1
- @mr-tick/fake-watcher-for-tests@1.0.1
- @mr-tick/mr-tick-ai-for-tests@1.0.1
- @mr-tick/purple-theme@1.0.1
- @mr-tick/redmine-for-tests@1.0.4
- @mr-tick/supabase-theme@1.0.1
