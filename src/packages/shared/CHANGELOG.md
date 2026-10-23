# @mr-tick/shared

## 1.5.0

### Minor Changes

- a0bd5ef: Make authentication an explicit `auth` capability, independent of data providers. All addons register connection profiles and authenticators through `contributions.connections`, whose registration methods return `Either` and reject missing capabilities, invalid profiles and unsupported methods.

  Remove connection profiles from `IDataSource` and `IDataSourceResolver`, the datasource fallback and the separately injected OAuth authenticator. OAuth resolves the authenticator declared for the requested connection profile and authorization role instead of choosing another registered authenticator.

  Remove `method: 'none'`, anonymous authentication results and `Workspace.connectNone`. Addons without authentication omit `auth` and use addon or workspace settings. Authenticated connection results always include identity; the core retains credential storage, OAuth attempts, renewal and lifecycle coordination.

  Show authentication settings only for addons declaring `auth`, update the development addon and document the SDK 0.11 contract in English and Portuguese. Distribute updated authenticated addons only after publishing the compatible SDK and desktop; update their npm dependency and lockfile before release.

  Allow unreleased SDK testing in an unpackaged desktop only when the addon and its SDK dependency are development links pointing to the host's local SDK. Preserve production API version checks and surface connection profile loading errors in the settings screen.

## 1.4.0

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

## 1.3.1

### Patch Changes

- 46475ba: Adiciona ecossistema Mr. Tick Plus fim a fim: suporte ao tier `plus`, hash `sha256`, `size` e assinatura Ed25519 de pacotes `.tladdon` no `@mr-tick/sdk`, verificação offline/online de licença (`lic-2026-01`) e pacotes assinados (`cat-2026-01`), download autenticado no Cloudflare R2 com validação SHA-256, deep link `mistertick://activate?key=...` no Electron e interface de ativação e badges Plus na loja e página de addons.

## 1.3.0

### Minor Changes

- f44420a: Adiciona atualização de addons com validação de versão/API, backup e rollback compensatório quando a ativação falha. Instalação e atualização abrem um console com progresso e logs; o sucesso é confirmado somente após a conclusão do job.

  Corrige a ativação pelo caminho absoluto da versão gravada, prioriza a versão instalada mais recente e exclui backups da descoberta. Preserva backups quando a recuperação falha, protege addons vinculados de desenvolvimento e bloqueia atualização/desinstalação concorrentes. As ações do gerenciador ficam compactas e usam a terminologia Addon.

  A validação inclui regressões unitárias e de UI e três testes E2E no Electron com download, filesystem, ativação e rollback reais, simulando apenas o catálogo remoto.

## 1.2.0

### Minor Changes

- df0ddc8: Add an optional server-atomic conditional update contract. Preserve pending PUT/DELETE intent and the approved baseline through transient failures; retain terminal tombstone failures and original HTTP status in the global sync indicator. Retry canonical reads of confirmed legacy writes without repeating writes, using a durable submitted snapshot that preserves later edits. Find imported tombstones by exact connection and remote identity, restore complete accepted conflict baselines, and cover concurrent pulls and writes with deterministic Electron regressions. Conditional writes protect only providers that implement the server guarantee; the default Redmine API retains its documented concurrency limit.

  Persist explicit deletion acknowledgements separately from reconciliation tombstones. Apply push responses only to the current connection and remote identity, preserve retry backoff when releasing preflight claims, and reset all remote metadata on explicitly authorized recreation. Block connection changes during canonical confirmation and discard only staged edits on cancellation.

  Use a deterministic local SHA-256 identity for newly imported time entries, scoped to the connection and pure remote ID, so concurrent RxDB downstreams converge without duplicate local hours. Snapshot the local identity and approved business state before pull HTTP and revalidate atomically before applying observations, including equal remote timestamps and explicit correlation ambiguity.

  Retain the pull checkpoint when concurrent local changes leave an incoming canonical version unacknowledged, allowing a later pull to revisit it. Already incorporated or strictly older versions and deliberate local edits continue advancing normally.

### Patch Changes

- df0ddc8: Recover time-entry creation across concurrent windows, restarts and lost responses using a durable original payload and exact correlation. Preserve edits and deletions made while a create is in flight. Use the complete canonical remote state to update the local cache and detect conflicts without comparing client/server clocks. Preserve HTTP status and server errors, expose explicit ambiguous creation recovery, and test normalization with an independent fake remote store. Isolate Electron E2E storage from the installed app profile. Keep the pre-release local database schema at version 0.

  Serialize workspace initialization, connection setup and teardown so cancelled transitions cannot overwrite a newer workspace or close a database still being opened. Release the active store on provider unmount and cover teardown/init races with deterministic regression tests. Update the conflict E2E to follow automatic conflict detection.

  Prevent reconciliation from deleting remote time entries after a failed or incomplete listing. Require a successful complete snapshot, enforce both date-window bounds, preserve concurrent local edits, and persist remote deletion acknowledgements as cache-only tombstones that the push layer never sends as DELETE requests. Retain user-requested deletions. Add an Electron E2E that first reproduced 72 unintended remote deletions after a single HTTP 503, plus regression coverage for partial listings and both deletion origins.

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

## 1.0.1
