---
"@mr-tick/sdk": minor
"@mr-tick/application": minor
"@mr-tick/shared": minor
"@mr-tick/desktop": minor
"@mr-tick/ui": minor
"@mr-tick/datasource-fake": minor
---

Promote analytics to an independent addon capability with its own contribution, provider, connection resolver and application service. Move analytical methods and types out of personal metadata contracts, require explicit extraction/coverage semantics, and migrate bridge, IPC, UI and the development addon.

Breaking SDK contract: addons must declare analytics and register IAnalyticsSource through contributions.analytics; IMetadataProvider no longer contains analytical methods. Dataset manifests require extraction descriptors and results require execution metadata. Hosts implement mandatory analytical bridge methods, including filter option discovery. Update addons and hosts together; no legacy adapter is retained.

Isolate analytical results by source node, workspace, connection and selection, reject superseded asynchronous results, and show unverified coverage explicitly. This phase does not implement analytical storage, background synchronization or reconciliation.
