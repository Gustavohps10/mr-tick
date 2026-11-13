---
'@mr-tick/shared': patch
'@mr-tick/application': patch
'@mr-tick/ui': patch
'@mr-tick/desktop': patch
---

Surface Analytics DuckDB storage errors in Diagnostics and allow explicit destructive reset with confirmation AlertDialog on both Analytics and Diagnostics screens.

- Add passive `AnalyticsDiagnosticAdapter` and read-only DuckDB storage inspection (`inspectWorkspaceStorage`) reporting unsupported format versions, corrupt/unreadable files, WAL orphans, invalid persisted spaces, and orphan storage files in `DiagnosticsService` and `RuntimeStatusIndicator`.
- Emit `analytics:storage-error` and `analytics:storage-reset` system events from `AnalyticsWarehouseService`, guarding `resetStorage` against active loads (409 `ANALYTICS_RESET_ACTIVE_LOAD`).
- Expose `resetAnalyticsStorage` across IPC (`analytics:reset-storage`) and `IHostBridge`, adding explicit destructive reset actions gated by Shadcn `AlertDialog` confirmation in both `Analytics` (`analytics-page.tsx`) and Settings `Dados e Diagnóstico` (`SystemStorageCard`).
