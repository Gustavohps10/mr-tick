---
'@mr-tick/application': minor
'@mr-tick/desktop': minor
'@mr-tick/adapters': minor
'@mr-tick/ui': minor
---

Implement observational runtime diagnostics and settings system section:

- Added canonical diagnostic application contracts (`IDiagnosticsAPI`, `DiagnosticSnapshot`, `DiagnosticCheckResult`, `DiagnosticStorageItem`, `SanitizedDiagnosticReport`, `DIAGNOSTICS_SNAPSHOT_UPDATED_EVENT`) with open storage technology, typed availability, and discriminated pass operations
- Added typed startup failure reporting from local runtime renderer (`local-runtime:failed`) before deadline and roundtrip diagnostic probe execution
- Extended canonical lifecycle of `LocalRuntimeDispatcher` with explicit failure causality, deadline distinction, delayed ready recovery, and diagnostic event notifications
- Added `SqliteMetadataDiagnosticAdapter` with lightweight O(1) read probe and exact physical size measurement distinguishing ENOENT from I/O errors
- Added bounded `DiagnosticEventsBuffer` and rotating `BootJournal` with file size caps and credential sanitization
- Added `DiagnosticsService` with atomic snapshot revisions, real-clock probe durations, event broadcast to main/widget windows, and deep report sanitization
- Integrated diagnostics into `IHostBridge` across Electron preload, IPC client, and web landing demo with explicit 501 unsupported responses
- Added "Dados e Diagnóstico" tab under a dedicated "Sistema" group in global settings modal, with real-time lifecycle status, health checks, physical/sandbox storage metrics, workspace isolation status, and searchable events buffer
- Adjusted test timeout tolerance for disk-loading dynamic ESM imports on Windows in `AddonLoader.VersionLock.spec.ts`
