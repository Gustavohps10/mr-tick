# @mr-tick/datasource-fake

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
