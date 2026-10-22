# @mr-tick/domain

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
