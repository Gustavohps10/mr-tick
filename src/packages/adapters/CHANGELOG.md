# @mr-tick/adapters

## 1.4.1

### Patch Changes

- Updated dependencies [a0bd5ef]
  - @mr-tick/sdk@0.11.0
  - @mr-tick/shared@1.5.0
  - @mr-tick/domain@2.0.0
  - @mr-tick/application@2.0.0

## 1.4.0

### Minor Changes

- 6d14757: Padronização canônica das capacidades de addons em todo o ecossistema Mr. Tick:
  - Substituição integral de categorias (`category`/`categories`) e descritores legados por `capabilities: AddonCapability[]` (`'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'`).
  - Remoção definitiva de união de tipos (`AddonCapability | AddonCapabilityDescriptor`) mantendo uma única fonte da verdade estrita.
  - Simplificação do versionamento de contratos centralizado na compatibilidade SemVer do SDK, eliminando micro-versionamento per-capability (`contractVersion`).
  - Helpers canônicos centralizados em `@mr-tick/shared/helpers` e reexportados pelo SDK (`hasCapability`, `isDataSource`, `isWatcher`, `isTheme`).
  - Limpeza de fallbacks cegos PascalCase e categorias legadas nos utilitários da CLI (`manifest`, `sync`, `pkg`, `validate`).
  - Atualização e alinhamento dos serviços de aplicação (`ImportAddonService`, `UpdateAddonService`), adaptadores (`AddonsFacade`), UI (`SyncProvider`, modais e componentes de tarefas) e runtime desktop (`AddonLoader`, ciclo de vida e dispatch de provedores).
- 24d3de8: Arquitetura de conexões e capacidades dos addons: perfis de conexão com cardinalidade (`single`/`multi`) validada no domínio e na persistência, fábrica de HTTP por conexão, ciclo de vida de conexão com credenciais em cofre (distinguindo ausência, indisponibilidade e payload inválido), tentativas OAuth controladas pelo host com refresh compartilhado por autorização, configurações e segredos de addons separados por escopo, persistência de workspaces em SQLite e UI de conexões agrupada por workspace.

  Contratos públicos do SDK foram reorganizados (autenticação promovida a capacidade, `IHttpClientFactory`, perfis de conexão); `IAuthenticationStrategy` e os use cases antigos de conectar/vincular foram removidos sem camada de compatibilidade.

### Patch Changes

- Updated dependencies [6d14757]
- Updated dependencies [24d3de8]
- Updated dependencies [5da988f]
- Updated dependencies [70120fb]
  - @mr-tick/sdk@0.10.0
  - @mr-tick/application@1.8.0
  - @mr-tick/shared@1.4.0
  - @mr-tick/domain@1.1.0

## 1.3.2

### Patch Changes

- Updated dependencies [9de4c25]
- Updated dependencies [e4c7f21]
- Updated dependencies [83efe1e]
  - @mr-tick/application@1.7.0
  - @mr-tick/sdk@0.9.0

## 1.3.1

### Patch Changes

- 46475ba: Adiciona ecossistema Mr. Tick Plus fim a fim: suporte ao tier `plus`, hash `sha256`, `size` e assinatura Ed25519 de pacotes `.tladdon` no `@mr-tick/sdk`, verificação offline/online de licença (`lic-2026-01`) e pacotes assinados (`cat-2026-01`), download autenticado no Cloudflare R2 com validação SHA-256, deep link `mistertick://activate?key=...` no Electron e interface de ativação e badges Plus na loja e página de addons.
- Updated dependencies [46475ba]
  - @mr-tick/sdk@0.8.1
  - @mr-tick/shared@1.3.1
  - @mr-tick/domain@1.0.6
  - @mr-tick/application@1.6.1

## 1.3.0

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
  - @mr-tick/application@1.6.0

## 1.2.0

### Minor Changes

- f44420a: Adiciona atualização de addons com validação de versão/API, backup e rollback compensatório quando a ativação falha. Instalação e atualização abrem um console com progresso e logs; o sucesso é confirmado somente após a conclusão do job.

  Corrige a ativação pelo caminho absoluto da versão gravada, prioriza a versão instalada mais recente e exclui backups da descoberta. Preserva backups quando a recuperação falha, protege addons vinculados de desenvolvimento e bloqueia atualização/desinstalação concorrentes. As ações do gerenciador ficam compactas e usam a terminologia Addon.

  A validação inclui regressões unitárias e de UI e três testes E2E no Electron com download, filesystem, ativação e rollback reais, simulando apenas o catálogo remoto.

### Patch Changes

- Updated dependencies [f44420a]
- Updated dependencies [8b6f3e4]
  - @mr-tick/application@1.5.0
  - @mr-tick/shared@1.3.0
  - @mr-tick/domain@1.0.5

## 1.1.5

### Patch Changes

- df0ddc8: Recover time-entry creation across concurrent windows, restarts and lost responses using a durable original payload and exact correlation. Preserve edits and deletions made while a create is in flight. Use the complete canonical remote state to update the local cache and detect conflicts without comparing client/server clocks. Preserve HTTP status and server errors, expose explicit ambiguous creation recovery, and test normalization with an independent fake remote store. Isolate Electron E2E storage from the installed app profile. Keep the pre-release local database schema at version 0.

  Serialize workspace initialization, connection setup and teardown so cancelled transitions cannot overwrite a newer workspace or close a database still being opened. Release the active store on provider unmount and cover teardown/init races with deterministic regression tests. Update the conflict E2E to follow automatic conflict detection.

  Prevent reconciliation from deleting remote time entries after a failed or incomplete listing. Require a successful complete snapshot, enforce both date-window bounds, preserve concurrent local edits, and persist remote deletion acknowledgements as cache-only tombstones that the push layer never sends as DELETE requests. Retain user-requested deletions. Add an Electron E2E that first reproduced 72 unintended remote deletions after a single HTTP 503, plus regression coverage for partial listings and both deletion origins.

- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
  - @mr-tick/application@1.4.0
  - @mr-tick/shared@1.2.0
  - @mr-tick/domain@1.0.4

## 1.1.4

### Patch Changes

- Updated dependencies [9afb4a1]
  - @mr-tick/application@1.3.0

## 1.1.3

### Patch Changes

- Updated dependencies [0c03498]
  - @mr-tick/domain@1.0.3
  - @mr-tick/application@1.2.2

## 1.1.2

### Patch Changes

- Updated dependencies [fca1bd6]
  - @mr-tick/application@1.2.1

## 1.1.1

### Patch Changes

- Updated dependencies [82f3d48]
  - @mr-tick/application@1.2.0

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- Updated dependencies [00bc018]
  - @mr-tick/application@1.1.0
  - @mr-tick/shared@1.1.0
  - @mr-tick/domain@1.0.2

## 1.0.1

### Patch Changes

- @mr-tick/application@1.0.1
- @mr-tick/domain@1.0.1
- @mr-tick/shared@1.0.1
