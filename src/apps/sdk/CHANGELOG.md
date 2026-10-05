# @mr-tick/sdk

## 0.6.0

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

## 0.5.0

### Minor Changes

- 82f3d48: Adiciona suporte ao tipo de campo 'mapping' no schema de configurações de addons, interfaces de MappingFieldDefinition e método getMappingFields em IDataSource, além da remoção de testConnection em favor de autenticação canônica.

## 0.4.1

### Patch Changes

- b6a306b: Sincronizar automaticamente a versão do package.json para o manifest.yaml nos comandos mr-tick sync e mr-tick pkg.

## 0.4.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- 394905d: Standardize addon lifecycle contracts, add dynamic settings schema provider, declarative field scopes, and command auto-scoping

## 0.3.0

### Minor Changes

- Rebrand to Mr. Tick brand identity. Updated addons manifest URL to mistertick.github.io/addons-manifest/index.json with fallback to addons-manifest.mistertick.workers.dev. Confirmed clean - no Pandhora references in source.

## 0.2.0

### Minor Changes

- Rebrand: SDK ships under the Mr. Tick brand identity
- Updated addons manifest URL to `mistertick.github.io/addons-manifest/index.json`
- Confirmed clean — no Pandhora references in source

## 0.1.1

### Patch Changes

- 82941c8: Initial Version
- Add native 'mr-tick sync' CLI command for automatic screenshot, icon and manifest synchronization

## 0.1.0

### Minor Changes

- Initial Version
