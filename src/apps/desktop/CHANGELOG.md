# @mr-tick/desktop

## 0.6.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.
- Updated dependencies [fca1bd6]
  - @mr-tick/application@1.2.1
  - @mr-tick/ui@1.3.1
  - @mr-tick/adapters@1.1.2

## 0.6.0

### Minor Changes

- f124a75: fix(mapping): resolve campo de mapeamento pós-autenticação via instância ativa de datasource

  Corrige falha arquitetural onde `getMappingFields` era chamado antes da autenticação,
  retornando sempre uma lista vazia pois o `IDataSource` estático não possui contexto de
  credenciais ou URL do servidor remoto.

  **Mudanças:**
  - `IAddonsAPI.getMappingFields` agora aceita `workspaceId` e `connectionInstanceId` opcionais
  - `AddonsHandler.getMappingFields` prioriza resolver a instância autenticada via `IDataSourceResolver`
    quando `workspaceId` + `connectionInstanceId` estão presentes; mantém fallback para addons estáticos
  - `MappingConfigModal` propaga `workspaceId` e `connectionInstanceId` para o backend
  - `AddonFieldRenderer` e `MappingFieldItem` propagam os props de contexto de conexão
  - `DataSourceConnectionsContext` expõe `workspaceId` no contrato do contexto
  - `DataSourceInstancesManager` exibe botão "Configurar Mapeamento" por instância **conectada**,
    abrindo o `MappingConfigModal` com o contexto correto de autenticação

### Patch Changes

- 96c4dec: fix(ui): solid styling for activity badges, preset import with empty colors, and mapping reflection

  - Corrige estilização de badges de atividade para utilizar cor de fundo 100% sólida e opaca (`color-mix` sRGB), eliminando vazamento visual/transparência de itens inferiores em agrupamentos sobrepostos.
  - Torna o importador de presets flexível para aceitar definições com campos de cor vazios (`color: ""`).
  - Ajusta botão de exportação no `MappingConfigModal` para iniciar com o rótulo "Copiar JSON" e permitir cópia manual ou sob clique.
  - Atualiza componentes de visualização (`time-entries-table-columns`, `calendar-view`, `timesheet-view`, `task-lookup`) para refletir mapeamentos dinâmicos salvos no `localStorage`.
  - Adiciona testes unitários abrangentes e testes E2E Playwright no Electron validando importação de preset com 20 campos, exportação e persistência.

- Updated dependencies [96c4dec]
- Updated dependencies [f124a75]
  - @mr-tick/ui@1.3.0

## 0.5.1

### Patch Changes

- c43679a: Sincroniza automaticamente a versão e requiredApiVersion do manifest de dev-addons com a versão do package.json do SDK e torna dinâmicas as asserções de testes E2E com a versão do aplicativo em runtime.

## 0.5.0

### Minor Changes

- 82f3d48: Adiciona MappingConfigModal com seleção interativa de ícones Lucide, paleta de cores e importação/exportação de presets JSON para equipes, integrando AddonFieldRenderer aos canais IPC do Electron.

### Patch Changes

- 909bcc6: Centraliza a renderização de campos de schema em AddonFieldRenderer reutilizável, elimina duplicidade de código de formulários e adiciona testes E2E com FakeDataSource.
- Updated dependencies [82f3d48]
- Updated dependencies [82f3d48]
- Updated dependencies [909bcc6]
  - @mr-tick/application@1.2.0
  - @mr-tick/ui@1.2.0
  - @mr-tick/adapters@1.1.1

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
