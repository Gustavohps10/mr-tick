# Analytics capability

Analytics is independent of dataSource. An addon can declare auth + analytics and register a single IAnalyticsSource through context.contributions.analytics.register(source). The host resolves that source directly from the selected authorized connection, never through IMetadataProvider or IDataSourceResolver.

## Ownership and connection scope

The contribution belongs to its addon and is removed on unregister, deactivation or failed activation. A source creates an IAnalyticsProvider for an AnalyticsProviderContext containing the authorized identity, connection configuration, credentials and a connection-scoped HTTP client. Analytics does not require a personal member DTO. Registration returns Either<AppError, void>; failures must be handled.

The host validates the workspace, connection, active primary authorization and credential reference before creation. It rechecks authorization after asynchronous credential access. Providers are cached by connection, authorization generation, configuration and registered source. Connection changes invalidate binding generations. Guards reject stale results after disconnect, unregister, deactivation or capability disablement; they do not promise physical cancellation of network requests.

## Dataset and execution contracts

IAnalyticsProvider owns listAnalyticsDatasets, fetchAnalyticsDataset and getFilterOptions. Dataset IDs and field names belong to the provider. The UI resolves dynamic filter options through analytics instead of querying personal metadata or guessing provider-specific dataset IDs.

Each manifest declares extraction modes and identity. A row identity names provider-native columns; a scope identity allows whole-scope replacement but does not permit invented row keys. The query can describe snapshot, changes or aggregate execution. Omitted execution means the initial snapshot. Unsupported modes and continuations must return an explicit failure.

`selection: {dateRange, project}` declares support for the built-in period/project inputs independently of provider-owned filter names. Omission means neither built-in selection is supported. The UI normalizes requests and cache identity using the selected dataset's declaration and a catalog scoped by workspace/connection. Providers reject unsupported selections rather than returning a scope containing an ignored constraint.

Results declare execution and scope separately from payload rows:

- snapshot: complete, partial or unverified coverage, with optional continuation;
- changes: provider-owned checkpoint, deleted IDs and optional continuation;
- aggregate: complete or partial coverage of a remote aggregate and optional continuation.

Use createAnalyticsDatasetScope(input) to keep progress/cursors out of the identity of the selection. A checkpoint is not a guarantee of CDC. Complete means complete for the declared selection, not all data on the server. Absence-based reconciliation requires a finished replacement traversal of the declared scope; partial or failed traversals never replace it. Coverage still describes the provider's remote consistency guarantees.

## Current implementations and limitations

Redmine uses native JSON row identities and bounded REST pages. Snapshot results may include `batch` (index, offset, finished and totalRows), a continuation and a coverage reason. `batch.finished` closes traversal; it does not prove remotely consistent coverage. Multi-page Redmine scans finish as unverified because the server does not provide a stable cross-request snapshot. Atomic responses covering their scope may report complete. The warehouse follows provider continuations into a staged generation and publishes only after traversal finishes. The UI receives local result pages; charts aggregate the full published generation before pagination. A failed refresh preserves the previous publication. A permission failure invalidates its UI cache.

The development fixture exercises bounded snapshots, explicit change tombstones and declared remote aggregation using synthetic data; its generator materializes fixture records and is not a remote extraction pattern. Unsupported execution requests fail explicitly. DuckDB persistence and local queries are implemented in phase 2; the [phase 3 plan](analytics-phase3-plan.md) adds durable refresh state, reconciliation and hydration.

Redmine discovery and extraction live under src/analytics, independent of personal metadata and datasource version factories. Filters require native IDs, without name-resolution caches or users-to-memberships fallback. Project-scoped endpoints require a project, and journal/relation reads require a task. Atom discovery reuses the operational parser and enriches native issue IDs in a REST batch; it never represents a complete snapshot or deletion feed.

## Reuse inventory

| Existing mechanism | Phase 0 decision |
|---|---|
| Authorization selection and vault payload parsing | Reuse existing canonical logic; primary authorization selection shared with datasource resolution |
| HTTP factory | Reuse, with separate connection-scoped clients |
| Addon lifetime/binding generations | Reuse with analytics-specific bindings |
| Redmine in-flight request deduplication | Retain existing client implementation; do not add a competing global cache |
| Personal snapshot cursor and fingerprint | Retain; not a provider-side delta endpoint or a storage-independent executor |
| SDK createTimeEntrySnapshotPage | Reference for finite scan pagination; it receives an already materialized personal snapshot, so it is not reused as a remote analytics batch extractor |
| UI use-global-sync-state and operational synchronization status | Keep personal synchronization ownership; analytics has its own current request indicator, while durable per-load progress remains for the execution phase |
| Personal reconciliation invariants | Preserve as reference for later analytics reconciliation; no copying of timer/push/conflict state |
| RxDB collections and operational repositories | Preserve their current ownership; no parallel repository for the same domain entity |

## Validation boundary

Tests cover auth + analytics without dataSource, connection/credential isolation, revocation during vault reads, stale asynchronous results, unregister/deactivation and UI filter discovery without personal metadata. A read-only Docker matrix checks Redmine 3.4, 5.1 and 6.0. These tests do not prove a full analytics snapshot, lossless Redmine 3.4 pagination or background reconciliation.

The addon uses the locally linked SDK during this change. Public distribution requires the SDK release containing the new contract before releasing dependent addons; versions are managed by Changesets, without manual bumps.

## Local warehouse and remote aggregation

The desktop owns one DuckDB file per workspace under `userData/analytics`. Publications are isolated by connection, authorization/configuration signature and selection. Credentials are never written to analytical storage. The application service resolves authorization before and after queries and before publication. Failed extraction or incompatible schema changes leave the previous published generation available for the same authorized scope.

`loadAnalyticsDataset` is the internal host bridge operation for full bounded traversal. It returns publication metadata, not all rows. `queryAnalytics` accepts a typed `AnalyticsQueryInput` plan and returns `AnalyticsQueryResult`, with projected columns, at most 500 rows, total result count, coverage, load time and version. Any offset after zero requires that version. Publishing a replacement invalidates continuation instead of mixing generations.

Native operators include explicit projection/casts, typed predicates, CASE, arithmetic, grouping, pivot, joins, union and hierarchical rollups. SQL nodes execute a single SELECT over `input` or ordered aliases `input_1`, `input_2`, etc. Wildcards, external tables/functions, extensions and non-SELECT statements are rejected. The native parser validates the AST and serializes deterministic ordering, preserving explicit ORDER BY with projection ordinals as tie-breakers. Only supported scalar result types are exposed; cast an untyped NULL explicitly.

An aggregate-capable manifest additionally declares `extraction.aggregation: {groupByColumns, operators, postProcessing: 'projection-only'}`. Allowed remote operators are `count`, `sum`, `average`, `minimum`, `maximum`, explicitly limited by the provider descriptor. Result columns must match the requested groups and measure aliases. Complete traversal is required; repeated group tuples (including NULL groups) are rejected. Aggregates have their own selection identity and allow only projection/filter/sort locally. The host refuses joins, casts, arithmetic, SQL nodes and regrouping of arbitrary remote totals. Redmine does not advertise this capability.

A schema is rebuilt by a fresh full generation. Within one generation, new columns are nullable for earlier rows; missing cells remain NULL. Incompatible types, duplicate identity, changed native field identity, unexpected cells and invalid dates fail the load rather than guessing conversions. The published schema and provider-native custom field IDs remain available in result metadata.

Initial limits: 50,000 rows and 1,000 pages per load, eight active loads, 256 columns, two native threads and 256 MiB per open workspace instance, at most two open instances, a 32-operation normal native queue plus eight reserved cleanup admissions for the at most eight active generations and a 30-second active native operation deadline. These limits bound individual operations; they are not a whole-process RSS guarantee. A failed traversal restarts from the last committed sync state; partially ingested pages are not resumable after restart.

See [phase 2 validation](analytics-phase2-validation.md) for native runtime proofs, platform limitations and measured extraction/ingestion/query costs.

## Refresh, reconciliation and hydration

Datasets may declare `extraction.changes: {deletions: 'none' | 'explicit'}` together with the `changes` mode and a row identity. A completed snapshot can establish a server-derived checkpoint. Changes pages preserve the selection, expose traversal coverage and optionally continue; the final checkpoint commits atomically with the publication. A delta never deletes absent rows. Only explicit tombstones can remove rows during changes. An empty delta preserves the generation when coverage is unchanged.

Alternatively, `extraction.windowRescan: {dateColumn}` declares a native date column and built-in date selection. Fast refresh replaces only the intersection of the selected period with the most recent 14 UTC days, handling identities that move into the window. A closed historical period outside that window performs no HTTP on the fast cycle. Full reconciliation remains necessary for older edits, deletions and rows leaving filters. Incompatible base-versus-delta schema promotes once to full reconciliation; inconsistent schema within a traversal fails.

Redmine issues support inclusive server `updated_on` checkpoints with `deletions: 'none'`. Redmine time entries use `spent_on` window rescans because their endpoint ignores `updated_on`. Atom remains discovery only. These strategies do not promise real-time deletion discovery or a transactional remote snapshot.

The host selects `auto`, `fast` or manual `full` through `AnalyticsRefreshPolicy`, with full reconciliation due after six hours. Loads sharing workspace, connection, authorization and selection coalesce; a manual full reconciliation queues behind an existing fast load. Publication and `analytics_sync_states` commit in one transaction. Failed updates retain the previous publication; authorization failures revoke only the affected connection.

Query authorization errors identify affected connections in `details.connectionInstanceIds`, including multi-source plans. Consumers invalidate only that explicit scope and discard the failed query result. Hydration rechecks authorization after vault and native reads before exposing publications. Settings writes are serialized and acknowledged only on success; failures expose their original message/details and an explicit retry. Polling accepts zero (manual) or an integer from 1 to 1440 minutes.

`hydrateAnalytics` restores publications, spaces, dates and polling settings locally from the workspace DuckDB. Manual polling opens existing valid publications without HTTP. Enabled polling defaults to five minutes while Analytics is mounted, checks overdue publications when opening, and stops on leaving the view. The `analytics:load-progress` event reports batches and publication phases; background refresh preserves the visible previous result. No daemon updates closed workspaces.

Storage format is v2. Older analytical files fail explicitly with `ANALYTICS_STORAGE_FORMAT_UNSUPPORTED`; the host does not migrate or delete user databases automatically. See [phase 3 validation](analytics-phase3-validation.md) for evidence and remaining limits.
