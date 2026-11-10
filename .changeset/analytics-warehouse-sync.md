---
'@mr-tick/application': minor
'@mr-tick/datasource-fake': minor
'@mr-tick/desktop': minor
'@mr-tick/sdk': minor
'@mr-tick/shared': minor
'@mr-tick/ui': minor
---

Implement Phase 3 analytical synchronization, durable sync state, offline DuckDB hydration, selection coalescing, and batch progress UX while keeping core and UI strictly provider-agnostic.

- Extend `AnalyticsExtractionDescriptor` and execution contracts (`changes` with explicit `deletions: 'none' | 'explicit'`, `windowRescan: { dateColumn }`, server checkpoints on completed snapshots, and `AnalyticsRefreshPolicy`) and remove legacy `filters.date_range` in favor of explicit `selection: { dateRange, project }` and node `customDateRange`.
- Bump canonical DuckDB analytics format to v2 with atomic `analytics_sync_states` and `analytics_workspace_settings`, transactionally promoting `publishWindowMerge` and `publishChangesMerge`, queuing manual `full` reconciliations cleanly behind in-flight fast refreshes, revoking only affected `401`/`403` connections, and preserving remote `aggregate` schemas cleanly without retaining incompatible row descriptors.
- Hydrate offline analytics spaces, settings, and publications directly from DuckDB without automatic HTTP calls when manual polling is active, configure polling cadence directly in `AnalyticsTopBar`, deduplicate identical `(connectionId, selectionKey)` loads across workflow nodes/charts, emit throttled `analytics:load-progress` events, and prove `changes` upserts/deletes plus non-blocking personal runtime behavior in unit and Electron E2E tests.
- Recheck authorization after offline hydration reads, scope multi-source authorization errors to the rejected connections, and acknowledge serialized settings writes only after success with visible errors and explicit retry.
