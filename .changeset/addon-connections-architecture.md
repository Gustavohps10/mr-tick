---
"@mr-tick/sdk": minor
"@mr-tick/domain": minor
"@mr-tick/application": minor
"@mr-tick/adapters": minor
"@mr-tick/shared": minor
"@mr-tick/ui": minor
"@mr-tick/desktop": minor
"@mr-tick/datasource-fake": minor
---

Arquitetura de conexões e capacidades dos addons: perfis de conexão com cardinalidade (`single`/`multi`) validada no domínio e na persistência, fábrica de HTTP por conexão, ciclo de vida de conexão com credenciais em cofre (distinguindo ausência, indisponibilidade e payload inválido), tentativas OAuth controladas pelo host com refresh compartilhado por autorização, configurações e segredos de addons separados por escopo, persistência de workspaces em SQLite e UI de conexões agrupada por workspace.

Contratos públicos do SDK foram reorganizados (autenticação promovida a capacidade, `IHttpClientFactory`, perfis de conexão); `IAuthenticationStrategy` e os use cases antigos de conectar/vincular foram removidos sem camada de compatibilidade.
