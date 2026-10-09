# @mr-tick/adapters

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
