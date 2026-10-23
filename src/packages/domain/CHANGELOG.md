# @mr-tick/domain

## 2.0.0

### Major Changes

- a0bd5ef: Make authentication an explicit `auth` capability, independent of data providers. All addons register connection profiles and authenticators through `contributions.connections`, whose registration methods return `Either` and reject missing capabilities, invalid profiles and unsupported methods.

  Remove connection profiles from `IDataSource` and `IDataSourceResolver`, the datasource fallback and the separately injected OAuth authenticator. OAuth resolves the authenticator declared for the requested connection profile and authorization role instead of choosing another registered authenticator.

  Remove `method: 'none'`, anonymous authentication results and `Workspace.connectNone`. Addons without authentication omit `auth` and use addon or workspace settings. Authenticated connection results always include identity; the core retains credential storage, OAuth attempts, renewal and lifecycle coordination.

  Show authentication settings only for addons declaring `auth`, update the development addon and document the SDK 0.11 contract in English and Portuguese. Distribute updated authenticated addons only after publishing the compatible SDK and desktop; update their npm dependency and lockfile before release.

  Allow unreleased SDK testing in an unpackaged desktop only when the addon and its SDK dependency are development links pointing to the host's local SDK. Preserve production API version checks and surface connection profile loading errors in the settings screen.

### Patch Changes

- Updated dependencies [a0bd5ef]
  - @mr-tick/shared@1.5.0

## 1.1.0

### Minor Changes

- 24d3de8: Arquitetura de conexões e capacidades dos addons: perfis de conexão com cardinalidade (`single`/`multi`) validada no domínio e na persistência, fábrica de HTTP por conexão, ciclo de vida de conexão com credenciais em cofre (distinguindo ausência, indisponibilidade e payload inválido), tentativas OAuth controladas pelo host com refresh compartilhado por autorização, configurações e segredos de addons separados por escopo, persistência de workspaces em SQLite e UI de conexões agrupada por workspace.

  Contratos públicos do SDK foram reorganizados (autenticação promovida a capacidade, `IHttpClientFactory`, perfis de conexão); `IAuthenticationStrategy` e os use cases antigos de conectar/vincular foram removidos sem camada de compatibilidade.

### Patch Changes

- Updated dependencies [6d14757]
- Updated dependencies [24d3de8]
  - @mr-tick/shared@1.4.0

## 1.0.6

### Patch Changes

- 46475ba: Adiciona ecossistema Mr. Tick Plus fim a fim: suporte ao tier `plus`, hash `sha256`, `size` e assinatura Ed25519 de pacotes `.tladdon` no `@mr-tick/sdk`, verificação offline/online de licença (`lic-2026-01`) e pacotes assinados (`cat-2026-01`), download autenticado no Cloudflare R2 com validação SHA-256, deep link `mistertick://activate?key=...` no Electron e interface de ativação e badges Plus na loja e página de addons.
- Updated dependencies [46475ba]
  - @mr-tick/shared@1.3.1

## 1.0.5

### Patch Changes

- Updated dependencies [f44420a]
  - @mr-tick/shared@1.3.0

## 1.0.4

### Patch Changes

- Updated dependencies [df0ddc8]
- Updated dependencies [df0ddc8]
  - @mr-tick/shared@1.2.0

## 1.0.3

### Patch Changes

- 0c03498: Adicionar suporte a comments nulos e fuso horário noturno na entidade TimeEntry e suíte E2E automatizada de sincronização e cenários caóticos com DataSource Fake

## 1.0.2

### Patch Changes

- Updated dependencies [00bc018]
  - @mr-tick/shared@1.1.0

## 1.0.1

### Patch Changes

- @mr-tick/shared@1.0.1
