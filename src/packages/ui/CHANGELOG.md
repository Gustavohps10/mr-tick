# @mr-tick/ui

## 1.3.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.
  - @mr-tick/sdk@0.5.0

## 1.3.0

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
