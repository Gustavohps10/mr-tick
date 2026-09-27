# @mr-tick/ui

## 1.2.0

### Minor Changes

- 82f3d48: Adiciona MappingConfigModal com seleção interativa de ícones Lucide, paleta de cores e importação/exportação de presets JSON para equipes, integrando AddonFieldRenderer aos canais IPC do Electron.

### Patch Changes

- 909bcc6: Centraliza a renderização de campos de schema em AddonFieldRenderer reutilizável, elimina duplicidade de código de formulários e adiciona testes E2E com FakeDataSource.
- Updated dependencies [82f3d48]
  - @mr-tick/sdk@0.5.0

## 1.1.3

### Patch Changes

- 9b79109: Corrigir validação Ajv do RxDB permitindo comments e endDate nulos em time entries durante sincronização downstream (RC_PULL).

## 1.1.2

### Patch Changes

- Updated dependencies [b6a306b]
  - @mr-tick/sdk@0.4.1

## 1.1.1

### Patch Changes

- 250dbe7: fix: prevent fatal RxDB DB9 error in production database initialization and stabilize E2E test suites

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- Updated dependencies [00bc018]
- Updated dependencies [394905d]
  - @mr-tick/sdk@0.4.0

## 1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies
  - @mr-tick/sdk@0.3.0

## 1.0.2

### Patch Changes

- Updated dependencies [82941c8]
- Updated dependencies
  - @mr-tick/sdk@0.1.1

## 1.0.1

### Patch Changes

- Updated dependencies
  - @mr-tick/sdk@0.1.0
