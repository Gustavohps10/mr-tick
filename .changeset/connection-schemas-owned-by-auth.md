---
"@mr-tick/sdk": major
"@mr-tick/application": major
"@mr-tick/ui": major
"@mr-tick/desktop": patch
"@mr-tick/datasource-fake": patch
---

Move account form schemas from IDataSource.getConnectionSchema to contributions.connections.registerSchema(connectionProfileId, schema). Profiles and their schemas are registered independently of datasource providers and cleaned up with the addon lifetime. Schema lookup requires addon and connection profile IDs and reports missing registrations explicitly.

Render connection forms for auth-only addons, separate credential/configuration values by field scope, and use the declared default authenticator rather than assuming its ID matches the connection profile. Rename the shared connection form and manager to reflect their independent role. IDataSource.getConnectionSchema and the previous form export are removed; addon sources must migrate with the matching SDK and desktop release.
