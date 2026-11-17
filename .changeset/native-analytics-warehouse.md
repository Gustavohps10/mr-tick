---
'@mr-tick/application': minor
'@mr-tick/desktop': minor
'@mr-tick/sdk': minor
'@mr-tick/ui': minor
'@mr-tick/datasource-fake': minor
---

Add the desktop analytical warehouse backed by DuckDB, with bounded batch ingestion, atomic publication, authorization and workspace isolation, explicit schema evolution and versioned local queries.

Run analytical operators and real SQL against complete published generations. Deliver bounded pages to inspection, previews and charts, preserve previous publications after failed refreshes, and validate declared remote aggregation without regrouping arbitrary totals. Remove the renderer's simulated analytical executor and add a remote aggregation development fixture.

Package the native binding outside ASAR where required and update electron-builder within major 26 to handle platform-specific optional dependencies. Add native runtime regression checks and document representative Redmine extraction, ingestion, query and memory measurements.
