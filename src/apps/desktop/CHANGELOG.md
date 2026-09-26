# @mr-tick/desktop

## 0.4.3

### Patch Changes

- Updated dependencies [9b79109]
  - @mr-tick/ui@1.1.3

## 0.4.2

### Patch Changes

- @mr-tick/ui@1.1.2

## 0.4.1

### Patch Changes

- 250dbe7: fix: prevent fatal RxDB DB9 error in production database initialization and stabilize E2E test suites
- Updated dependencies [250dbe7]
  - @mr-tick/ui@1.1.1

## 0.4.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- 91537fb: Fix RxDB DB9 error on workspace sync and database initialization
- 394905d: Standardize addon lifecycle contracts, add dynamic settings schema provider, declarative field scopes, and command auto-scoping
- Updated dependencies [00bc018]
  - @mr-tick/application@1.1.0
  - @mr-tick/adapters@1.1.0
  - @mr-tick/shared@1.1.0
  - @mr-tick/ui@1.1.0

## 0.3.0

### Minor Changes

- 662e2f9: Adiciona atualizador nativo em C++, assistente interativo de instalação NSIS com arte personalizada, novo ícone e melhorias no modal de atualização.
- d60f883: feat: implement in-app auto-updater and beta release channel support
- 36986ac: feat: release 0.3.0 stable

### Patch Changes

- 6cc4402: Fix prerelease update discovery by aligning updater channels and ensuring manifest availability.
- 6fb6b43: fix(desktop): do not treat older stable releases as updates when on beta channel
- 2a73915: fix: upload update manifest yml files and handle updater errors gracefully
- 01bd6eb: fix(desktop): support monorepo release tags and dynamic dev updater mock
- 0496e88: feat(updater): background updater notifications, auto-popup, refreshed ui, and native win32 portable updater with progress bar
  - @mr-tick/adapters@1.0.1
  - @mr-tick/application@1.0.1
  - @mr-tick/shared@1.0.1
  - @mr-tick/ui@1.0.4

## 0.3.0-beta.6

### Patch Changes

- 0496e88: feat(updater): background updater notifications, auto-popup, refreshed ui, and native win32 portable updater with progress bar

## 0.3.0-beta.5

### Patch Changes

- 6fb6b43: fix(desktop): do not treat older stable releases as updates when on beta channel

## 0.3.0-beta.4

### Patch Changes

- 01bd6eb: fix(desktop): support monorepo release tags and dynamic dev updater mock

## 0.3.0-beta.3

### Patch Changes

- 6cc4402: Fix prerelease update discovery by aligning updater channels and ensuring manifest availability.

## 0.3.0-beta.2

### Minor Changes

- 662e2f9: Adiciona atualizador nativo em C++, assistente interativo de instalação NSIS com arte personalizada, novo ícone e melhorias no modal de atualização.

## 0.3.0-beta.1

### Patch Changes

- 2a73915: fix: upload update manifest yml files and handle updater errors gracefully

## 0.3.0-beta.0

### Minor Changes

- d60f883: feat: implement in-app auto-updater and beta release channel support

## 0.2.0

### Minor Changes

- 5075727: Adiciona suporte ao desacoplamento de addons em ambiente de desenvolvimento via symlink e CLI dedicada

## 0.1.0

### Minor Changes

- a69bba3: Adiciona suporte às visualizações de apontamentos (time entries) em formato de calendário e timesheet.

## 1.0.1

### Patch Changes

- @mr-tick/ui@1.0.1
- @mr-tick/datasource-fake@1.0.1
- @mr-tick/fake-watcher-for-tests@1.0.1
- @mr-tick/mr-tick-ai-for-tests@1.0.1
- @mr-tick/purple-theme@1.0.1
- @mr-tick/redmine-for-tests@1.0.4
- @mr-tick/supabase-theme@1.0.1
