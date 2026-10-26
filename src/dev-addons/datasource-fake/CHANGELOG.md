# @mr-tick/datasource-fake

## 1.2.3

### Patch Changes

- Updated dependencies [790e624]
  - @mr-tick/sdk@0.13.0

## 1.2.2

### Patch Changes

- 4733f0b: Move account form schemas from IDataSource.getConnectionSchema to contributions.connections.registerSchema(connectionProfileId, schema). Profiles and their schemas are registered independently of datasource providers and cleaned up with the addon lifetime. Schema lookup requires addon and connection profile IDs and reports missing registrations explicitly.

  Render connection forms for auth-only addons, separate credential/configuration values by field scope, and use the declared default authenticator rather than assuming its ID matches the connection profile. Rename the shared connection form and manager to reflect their independent role. IDataSource.getConnectionSchema and the previous form export are removed; addon sources must migrate with the matching SDK and desktop release.

- Updated dependencies [4733f0b]
  - @mr-tick/sdk@0.12.0

## 1.2.1

### Patch Changes

- a0bd5ef: Make authentication an explicit `auth` capability, independent of data providers. All addons register connection profiles and authenticators through `contributions.connections`, whose registration methods return `Either` and reject missing capabilities, invalid profiles and unsupported methods.

  Remove connection profiles from `IDataSource` and `IDataSourceResolver`, the datasource fallback and the separately injected OAuth authenticator. OAuth resolves the authenticator declared for the requested connection profile and authorization role instead of choosing another registered authenticator.

  Remove `method: 'none'`, anonymous authentication results and `Workspace.connectNone`. Addons without authentication omit `auth` and use addon or workspace settings. Authenticated connection results always include identity; the core retains credential storage, OAuth attempts, renewal and lifecycle coordination.

  Show authentication settings only for addons declaring `auth`, update the development addon and document the SDK 0.11 contract in English and Portuguese. Distribute updated authenticated addons only after publishing the compatible SDK and desktop; update their npm dependency and lockfile before release.

  Allow unreleased SDK testing in an unpackaged desktop only when the addon and its SDK dependency are development links pointing to the host's local SDK. Preserve production API version checks and surface connection profile loading errors in the settings screen.

- Updated dependencies [a0bd5ef]
  - @mr-tick/sdk@0.11.0

## 1.2.0

### Minor Changes

- 24d3de8: Arquitetura de conexões e capacidades dos addons: perfis de conexão com cardinalidade (`single`/`multi`) validada no domínio e na persistência, fábrica de HTTP por conexão, ciclo de vida de conexão com credenciais em cofre (distinguindo ausência, indisponibilidade e payload inválido), tentativas OAuth controladas pelo host com refresh compartilhado por autorização, configurações e segredos de addons separados por escopo, persistência de workspaces em SQLite e UI de conexões agrupada por workspace.

  Contratos públicos do SDK foram reorganizados (autenticação promovida a capacidade, `IHttpClientFactory`, perfis de conexão); `IAuthenticationStrategy` e os use cases antigos de conectar/vincular foram removidos sem camada de compatibilidade.

### Patch Changes

- Updated dependencies [6d14757]
- Updated dependencies [24d3de8]
  - @mr-tick/sdk@0.10.0

## 1.1.2

### Patch Changes

- Updated dependencies [83efe1e]
  - @mr-tick/sdk@0.9.0

## 1.1.1

### Patch Changes

- Updated dependencies [46475ba]
  - @mr-tick/sdk@0.8.1

## 1.1.0

### Minor Changes

- 0e0d20d: Expose canonical Core read capabilities for workspaces, connections, cached tasks and metadata through the public SDK, together with runtime availability subscriptions. Reads use explicit workspace/connection scope and do not initiate remote synchronization.

  Breaking change: addon vault now requires an explicit addon/workspace scope and returns Either. Settings use the same scope and write queue, preserving existing workspace keychain records. Commands, sidebar entries and themes are owned by the addon; consumers must use qualified command IDs outside the addon. Recompile external addons and validate their SDK compatibility range.

  Clean up host contributions and subscriptions on deactivation and partial activation failure. Keep the native theme command available with owner-scoped theme resolution. Generate addon SDK dependencies and manifest compatibility from the distributed SDK version.

  Document the public contracts and lifecycle, and add typed examples plus real runtime coverage for cached reads and persisted suggestions.

  Prevent older timer reader snapshots and command acknowledgements from replacing a newer observed UI projection, including reader teardown. Keep timer controls unavailable until the reader has hydrated the initial active timer, and cancel a pending restart when that reader is replaced.

  Group AddonContext into core, contributions and host. Move timer/timeEntries under core, registration APIs under contributions, and events/notifications/vault/OAuth under host. Standardize public API interface names and contract folders. Rename credential storage to vault across Application, adapters and host, preserving existing keychain service/account keys. External addons must migrate their context access paths and renamed imports.

  Remove addonId from the public AddonContext. The host keeps ownership, vault scope and attribution internal; addons obtain the datasource identity from the selected Core connection.

### Patch Changes

- Updated dependencies [0e0d20d]
  - @mr-tick/sdk@0.8.0

## 1.0.7

### Patch Changes

- Updated dependencies [9f5a4bf]
  - @mr-tick/sdk@0.7.0

## 1.0.6

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

- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
  - @mr-tick/sdk@0.6.0

## 1.0.5

### Patch Changes

- c43679a: Sincroniza automaticamente a versão e requiredApiVersion do manifest de dev-addons com a versão do package.json do SDK e torna dinâmicas as asserções de testes E2E com a versão do aplicativo em runtime.

## 1.0.4

### Patch Changes

- Updated dependencies [82f3d48]
  - @mr-tick/sdk@0.5.0

## 1.0.3

### Patch Changes

- Updated dependencies [b6a306b]
  - @mr-tick/sdk@0.4.1

## 1.0.2

### Patch Changes

- Updated dependencies [00bc018]
- Updated dependencies [394905d]
  - @mr-tick/sdk@0.4.0

## 1.0.1

### Patch Changes

- Updated dependencies
  - @mr-tick/sdk@0.1.0
