# @mr-tick/application

## 1.3.0

### Minor Changes

- 9afb4a1: Implementa busca sob demanda e auto-enriquecimento em segundo plano de tarefas faltantes com persistência no RxDB local, garantindo exibição de títulos e metadados na tabela de apontamentos, popover e lookup.

## 1.2.2

### Patch Changes

- Updated dependencies [0c03498]
  - @mr-tick/domain@1.0.3

## 1.2.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.

## 1.2.0

### Minor Changes

- 82f3d48: Adiciona suporte ao tipo de campo 'mapping' no schema de configurações de addons, interfaces de MappingFieldDefinition e método getMappingFields em IDataSource, além da remoção de testConnection em favor de autenticação canônica.

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- Updated dependencies [00bc018]
  - @mr-tick/shared@1.1.0
  - @mr-tick/domain@1.0.2

## 1.0.1

### Patch Changes

- @mr-tick/domain@1.0.1
- @mr-tick/shared@1.0.1
