# @mr-tick/application

## 2.1.0

### Minor Changes

- 4733f0b: Move account form schemas from IDataSource.getConnectionSchema to contributions.connections.registerSchema(connectionProfileId, schema). Profiles and their schemas are registered independently of datasource providers and cleaned up with the addon lifetime. Schema lookup requires addon and connection profile IDs and reports missing registrations explicitly.

  Render connection forms for auth-only addons, separate credential/configuration values by field scope, and use the declared default authenticator rather than assuming its ID matches the connection profile. Rename the shared connection form and manager to reflect their independent role. IDataSource.getConnectionSchema and the previous form export are removed; addon sources must migrate with the matching SDK and desktop release.

## 2.0.0

### Major Changes

- a0bd5ef: Make authentication an explicit `auth` capability, independent of data providers. All addons register connection profiles and authenticators through `contributions.connections`, whose registration methods return `Either` and reject missing capabilities, invalid profiles and unsupported methods.

  Remove connection profiles from `IDataSource` and `IDataSourceResolver`, the datasource fallback and the separately injected OAuth authenticator. OAuth resolves the authenticator declared for the requested connection profile and authorization role instead of choosing another registered authenticator.

  Remove `method: 'none'`, anonymous authentication results and `Workspace.connectNone`. Addons without authentication omit `auth` and use addon or workspace settings. Authenticated connection results always include identity; the core retains credential storage, OAuth attempts, renewal and lifecycle coordination.

  Show authentication settings only for addons declaring `auth`, update the development addon and document the SDK 0.11 contract in English and Portuguese. Distribute updated authenticated addons only after publishing the compatible SDK and desktop; update their npm dependency and lockfile before release.

  Allow unreleased SDK testing in an unpackaged desktop only when the addon and its SDK dependency are development links pointing to the host's local SDK. Preserve production API version checks and surface connection profile loading errors in the settings screen.

### Patch Changes

- Updated dependencies [a0bd5ef]
  - @mr-tick/shared@1.5.0
  - @mr-tick/domain@2.0.0

## 1.8.0

### Minor Changes

- 6d14757: Padronização canônica das capacidades de addons em todo o ecossistema Mr. Tick:
  - Substituição integral de categorias (`category`/`categories`) e descritores legados por `capabilities: AddonCapability[]` (`'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'`).
  - Remoção definitiva de união de tipos (`AddonCapability | AddonCapabilityDescriptor`) mantendo uma única fonte da verdade estrita.
  - Simplificação do versionamento de contratos centralizado na compatibilidade SemVer do SDK, eliminando micro-versionamento per-capability (`contractVersion`).
  - Helpers canônicos centralizados em `@mr-tick/shared/helpers` e reexportados pelo SDK (`hasCapability`, `isDataSource`, `isWatcher`, `isTheme`).
  - Limpeza de fallbacks cegos PascalCase e categorias legadas nos utilitários da CLI (`manifest`, `sync`, `pkg`, `validate`).
  - Atualização e alinhamento dos serviços de aplicação (`ImportAddonService`, `UpdateAddonService`), adaptadores (`AddonsFacade`), UI (`SyncProvider`, modais e componentes de tarefas) e runtime desktop (`AddonLoader`, ciclo de vida e dispatch de provedores).
- 24d3de8: Arquitetura de conexões e capacidades dos addons: perfis de conexão com cardinalidade (`single`/`multi`) validada no domínio e na persistência, fábrica de HTTP por conexão, ciclo de vida de conexão com credenciais em cofre (distinguindo ausência, indisponibilidade e payload inválido), tentativas OAuth controladas pelo host com refresh compartilhado por autorização, configurações e segredos de addons separados por escopo, persistência de workspaces em SQLite e UI de conexões agrupada por workspace.

  Contratos públicos do SDK foram reorganizados (autenticação promovida a capacidade, `IHttpClientFactory`, perfis de conexão); `IAuthenticationStrategy` e os use cases antigos de conectar/vincular foram removidos sem camada de compatibilidade.

### Patch Changes

- 5da988f: refactor(application): organize services into cohesive subdirectories (addons, connections, local-runtime, sync, workspaces)
- 70120fb: refactor(application): subdivide sync services by entity (metadata, tasks, time-entries)
- Updated dependencies [6d14757]
- Updated dependencies [24d3de8]
  - @mr-tick/shared@1.4.0
  - @mr-tick/domain@1.1.0

## 1.7.0

### Minor Changes

- e4c7f21: Modal de configurações renovado no estilo Obsidian, seletor de temas visuais com swatches de cores e unificação de addons por aplicação
- 83efe1e: Add workspace-scoped addon settings context, dynamic schema resolution and workspace-grouped settings UI

### Patch Changes

- 9de4c25: Adiciona aba dedicada de Licença nas Configurações Globais, remove cards redundantes de páginas de addons e preserva o formato exato da chave de ativação para validação criptográfica.

## 1.6.1

### Patch Changes

- 46475ba: Adiciona ecossistema Mr. Tick Plus fim a fim: suporte ao tier `plus`, hash `sha256`, `size` e assinatura Ed25519 de pacotes `.tladdon` no `@mr-tick/sdk`, verificação offline/online de licença (`lic-2026-01`) e pacotes assinados (`cat-2026-01`), download autenticado no Cloudflare R2 com validação SHA-256, deep link `mistertick://activate?key=...` no Electron e interface de ativação e badges Plus na loja e página de addons.
- Updated dependencies [46475ba]
  - @mr-tick/shared@1.3.1
  - @mr-tick/domain@1.0.6

## 1.6.0

### Minor Changes

- 0e0d20d: Expose canonical Core read capabilities for workspaces, connections, cached tasks and metadata through the public SDK, together with runtime availability subscriptions. Reads use explicit workspace/connection scope and do not initiate remote synchronization.

  Breaking change: addon vault now requires an explicit addon/workspace scope and returns Either. Settings use the same scope and write queue, preserving existing workspace keychain records. Commands, sidebar entries and themes are owned by the addon; consumers must use qualified command IDs outside the addon. Recompile external addons and validate their SDK compatibility range.

  Clean up host contributions and subscriptions on deactivation and partial activation failure. Keep the native theme command available with owner-scoped theme resolution. Generate addon SDK dependencies and manifest compatibility from the distributed SDK version.

  Document the public contracts and lifecycle, and add typed examples plus real runtime coverage for cached reads and persisted suggestions.

  Prevent older timer reader snapshots and command acknowledgements from replacing a newer observed UI projection, including reader teardown. Keep timer controls unavailable until the reader has hydrated the initial active timer, and cancel a pending restart when that reader is replaced.

  Group AddonContext into core, contributions and host. Move timer/timeEntries under core, registration APIs under contributions, and events/notifications/vault/OAuth under host. Standardize public API interface names and contract folders. Rename credential storage to vault across Application, adapters and host, preserving existing keychain service/account keys. External addons must migrate their context access paths and renamed imports.

  Remove addonId from the public AddonContext. The host keeps ownership, vault scope and attribution internal; addons obtain the datasource identity from the selected Core connection.

## 1.5.0

### Minor Changes

- f44420a: Adiciona atualização de addons com validação de versão/API, backup e rollback compensatório quando a ativação falha. Instalação e atualização abrem um console com progresso e logs; o sucesso é confirmado somente após a conclusão do job.

  Corrige a ativação pelo caminho absoluto da versão gravada, prioriza a versão instalada mais recente e exclui backups da descoberta. Preserva backups quando a recuperação falha, protege addons vinculados de desenvolvimento e bloqueia atualização/desinstalação concorrentes. As ações do gerenciador ficam compactas e usam a terminologia Addon.

  A validação inclui regressões unitárias e de UI e três testes E2E no Electron com download, filesystem, ativação e rollback reais, simulando apenas o catálogo remoto.

### Patch Changes

- 8b6f3e4: Resolução determinística de workspace no boot via busca por ID na seleção persistida sem limite de paginação (TB-003), ciclo de prontidão assíncrona nas views semanal e mensal prevenindo falso vazio (TB-004), tratamento de interrupções de arraste por pointercancel, lostpointercapture e blur com retenção do deslocamento (TB-005), overlay nativo Win32 não ativável com pré-build e harness C++/SendInput para auditoria de click-through, foco e hover; e testes E2E de paridade bi-janelar e performance (POP-01, POP-05, POP-06).
- Updated dependencies [f44420a]
  - @mr-tick/shared@1.3.0
  - @mr-tick/domain@1.0.5

## 1.4.0

### Minor Changes

- df0ddc8: Add an optional server-atomic conditional update contract. Preserve pending PUT/DELETE intent and the approved baseline through transient failures; retain terminal tombstone failures and original HTTP status in the global sync indicator. Retry canonical reads of confirmed legacy writes without repeating writes, using a durable submitted snapshot that preserves later edits. Find imported tombstones by exact connection and remote identity, restore complete accepted conflict baselines, and cover concurrent pulls and writes with deterministic Electron regressions. Conditional writes protect only providers that implement the server guarantee; the default Redmine API retains its documented concurrency limit.

  Persist explicit deletion acknowledgements separately from reconciliation tombstones. Apply push responses only to the current connection and remote identity, preserve retry backoff when releasing preflight claims, and reset all remote metadata on explicitly authorized recreation. Block connection changes during canonical confirmation and discard only staged edits on cancellation.

  Use a deterministic local SHA-256 identity for newly imported time entries, scoped to the connection and pure remote ID, so concurrent RxDB downstreams converge without duplicate local hours. Snapshot the local identity and approved business state before pull HTTP and revalidate atomically before applying observations, including equal remote timestamps and explicit correlation ambiguity.

  Retain the pull checkpoint when concurrent local changes leave an incoming canonical version unacknowledged, allowing a later pull to revisit it. Already incorporated or strictly older versions and deliberate local edits continue advancing normally.

- df0ddc8: Replace time-entry pull arrays with a required snapshot page contract carrying a provider-owned cursor, snapshot identity and explicit continuation. Add stateless SDK snapshot pagination so changes to an existing ID at an unchanged timestamp are revisited. Migrate the host bridge, desktop, fake provider and landing mock together; no legacy pull-contract branch remains.

  Revalidate connection ownership inside atomic creation claims. Preserve later confirmations when stale failure or equal-timestamp success responses arrive from another window. Allow edits of imported entries with no task without inventing a task identity, while still requiring a task for new entries. Validate checkpoint progress before local mutations and retain provider cursors through filtered pages and retries.

  Avoid rewriting already acknowledged canonical documents during snapshot rescans. Preserve their RxDB revision and pull metadata while continuing past unchanged pages to changed records, retaining existing atomic guards for uncertain observations and tombstones.

### Patch Changes

- df0ddc8: Recover time-entry creation across concurrent windows, restarts and lost responses using a durable original payload and exact correlation. Preserve edits and deletions made while a create is in flight. Use the complete canonical remote state to update the local cache and detect conflicts without comparing client/server clocks. Preserve HTTP status and server errors, expose explicit ambiguous creation recovery, and test normalization with an independent fake remote store. Isolate Electron E2E storage from the installed app profile. Keep the pre-release local database schema at version 0.

  Serialize workspace initialization, connection setup and teardown so cancelled transitions cannot overwrite a newer workspace or close a database still being opened. Release the active store on provider unmount and cover teardown/init races with deterministic regression tests. Update the conflict E2E to follow automatic conflict detection.

  Prevent reconciliation from deleting remote time entries after a failed or incomplete listing. Require a successful complete snapshot, enforce both date-window bounds, preserve concurrent local edits, and persist remote deletion acknowledgements as cache-only tombstones that the push layer never sends as DELETE requests. Retain user-requested deletions. Add an Electron E2E that first reproduced 72 unintended remote deletions after a single HTTP 503, plus regression coverage for partial listings and both deletion origins.

- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
  - @mr-tick/shared@1.2.0
  - @mr-tick/domain@1.0.4

## 1.3.0

### Minor Changes

- 9afb4a1: Implementa busca sob demanda e auto-enriquecimento em segundo plano de tarefas faltantes com persistência no RxDB local, garantindo exibição de títulos e metadados na tabela de apontamentos, popover e lookup.

## 1.2.2

### Patch Changes

- Updated dependencies [0c03498]
  - @mr-tick/domain@1.0.3

## 1.2.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.

## 1.2.0

### Minor Changes

- 82f3d48: Adiciona suporte ao tipo de campo 'mapping' no schema de configurações de addons, interfaces de MappingFieldDefinition e método getMappingFields em IDataSource, além da remoção de testConnection em favor de autenticação canônica.

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- Updated dependencies [00bc018]
  - @mr-tick/shared@1.1.0
  - @mr-tick/domain@1.0.2

## 1.0.1

### Patch Changes

- @mr-tick/domain@1.0.1
- @mr-tick/shared@1.0.1
