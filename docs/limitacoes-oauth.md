# Limitações de OAuth 2.0 e Arquitetura de Autenticação para Addons

Este documento detalha o modelo de segurança de autenticação do Mr. Tick, explicando as restrições arquiteturais para clientes desktop (clientes públicos), o funcionamento específico de integrações como Discord e Jira, e as diretrizes para desenvolvimento de addons oficiais e de terceiros.

---

## 1. O Modelo de Segurança: Clientes Públicos vs. Clientes Confidenciais

No protocolo OAuth 2.0 (RFC 6749), existem dois tipos fundamentais de clientes:

1. **Confidential Clients (Clientes Confidenciais):** Aplicações que executam em servidores seguros (back-ends, APIs) sob controle direto da organização. Conseguem manter segredos criptográficos (`client_secret`, chaves privadas) em variáveis de ambiente seguras sem expô-los aos usuários finais.
2. **Public Clients (Clientes Públicos):** Aplicações que executam no dispositivo do usuário final (aplicativos desktop Electron, apps mobile, Single Page Applications no navegador). **É impossível proteger segredos em clientes públicos**, pois qualquer binário distribuído, bundle JavaScript ou requisição de rede local pode ser descompilado, inspecionado e extraído.

> [!CAUTION] Regra Inegociável de Segurança
> **NUNCA** incorpore `client_secret` ou credenciais confidenciais no código do aplicativo desktop Mr. Tick ou no bundle de qualquer addon distribuído. Se uma `client_secret` for distribuída na máquina do cliente, ela é considerada pública e comprometida.

---

## 2. Por que o Discord funciona sem `client_secret`?

O addon do Discord (`@mr-tick/discord-addon` ou `mistertick-discord`) opera de forma diferente de um fluxo web tradicional:

- **Comunicação por IPC Local (Named Pipe):** O addon comunica-se diretamente com o aplicativo Discord Desktop em execução na mesma máquina através de um Named Pipe do sistema operacional (`\\.\pipe\discord-ipc-0` no Windows ou `/tmp/discord-ipc-0` em sistemas Unix/Linux/macOS).
- **Rich Presence RPC:** O protocolo de Rich Presence local do Discord requer apenas o `client_id` público da aplicação registrada no portal de desenvolvedores para realizar o handshake local. O usuário já está autenticado no aplicativo Discord Desktop instalado no seu sistema operacional.
- **Autorização sem segredo de servidor:** Não há necessidade de comunicação servidor-a-servidor entre o Mr. Tick e a API de nuvem do Discord para exibição de status e presença rica. O socket local valida o contexto e a sessão do usuário ativo na máquina.

---

## 3. O Desafio do Jira / Atlassian OAuth 2.0 (3LO)

Ao integrar com a Atlassian via OAuth 2.0 para acessar dados da API REST do Jira (fluxo 3-Legged OAuth - 3LO):

1. O fluxo de autorização web redireciona o usuário para aprovar o acesso no navegador da Atlassian.
2. O navegador retorna um `authorization_code` para o endpoint de callback.
3. **A troca do código por tokens (`access_token` e `refresh_token`):** A Atlassian exige obrigatoriamente que a chamada HTTP POST para `https://auth.atlassian.com/oauth/token` contenha:
   - `grant_type: authorization_code`
   - `client_id: ...`
   - `client_secret: ...` _(obrigatório no fluxo 3LO padrão)_
   - `code: ...`
   - `redirect_uri: ...`

Como o Mr. Tick Desktop é um cliente público, ele não pode armazenar a `client_secret` da Atlassian. Uma tentativa de realizar essa troca diretamente no processo do Electron exporia a chave do desenvolvedor a todos os usuários da aplicação.

---

## 4. Governança de Addons: Oficiais vs. Terceiros

Para garantir escalabilidade, segurança e independência entre criadores da comunidade e o core do produto, o ecossistema divide as integrações em duas categorias:

```mermaid
flowchart TD
    subgraph LocalMachine["Máquina do Usuário (Cliente Público)"]
        MrTick["Mr. Tick Desktop (Electron)"]
        OfficialAddon["Addon Oficial (Ex: Mr. Tick Plus Jira)"]
        ThirdPartyAddon["Addon de Terceiro (Ex: Acme Gitlab)"]
    end

    subgraph CoreCloud["Infraestrutura Oficial Mr. Tick"]
        MisterTickApi["mistertick-api (Confidential Backend)"]
        OfficialSecret[("Client Secrets Oficiais")]
    end

    subgraph CommunityCloud["Infraestrutura do Desenvolvedor Terceiro"]
        ThirdPartyBroker["Broker / Serverless do Desenvolvedor"]
        ThirdPartySecret[("Client Secret do Desenvolvedor")]
    end

    subgraph ExternalProviders["Provedores Externos"]
        AtlassianAuth["Atlassian OAuth Server"]
        ThirdPartyProvider["OAuth Server Terceiro"]
    end

    OfficialAddon -->|1. Solicita troca| MisterTickApi
    MisterTickApi -->|2. Injeta secret & troca| AtlassianAuth
    MisterTickApi -->|3. Retorna tokens| OfficialAddon

    ThirdPartyAddon -->|Opção A: Troca via Broker próprio| ThirdPartyBroker
    ThirdPartyBroker -->|Injeta secret do dev| ThirdPartyProvider

    ThirdPartyAddon -.->|Opção B: Sem backend (PAT / API Token)| ThirdPartyProvider
    ThirdPartyAddon -.->|Opção C: PKCE Direto (Sem Secret)| ThirdPartyProvider
```

### 4.1. Addons Oficiais do Ecossistema Mr. Tick (`mistertick-api`)

Para addons desenvolvidos e mantidos oficialmente pela equipe do Mr. Tick:

- A `mistertick-api` atua como o backend confidencial oficial.
- As `client_secret` de aplicativos oficiais registrados (ex: Atlassian, Google Workspace, Microsoft 365) ficam armazenadas exclusivamente nas variáveis de ambiente seguras da `mistertick-api`.
- O addon oficial solicita a troca de código à `mistertick-api`, que executa o handshake autenticado com o provedor e devolve os tokens seguros ao aplicativo local do usuário.

### 4.2. Addons de Terceiros e Comunidade

Addons desenvolvidos por autores externos ou empresas parceiras **não têm acesso de escrita nem podem injetar credenciais confidenciais na `mistertick-api`**.

A `mistertick-api` não atua como broker arbitrário para chaves de terceiros, pois isso criaria riscos de segurança, custos de infraestrutura não gerenciados e problemas de responsabilidade legal sobre abusos de API.

Para desenvolver um addon de terceiro, o autor possui três caminhos arquiteturais canônicos:

#### Estratégia 1: API Tokens / Personal Access Tokens (PAT) — Recomendada

- O usuário gera seu próprio token de acesso na interface do serviço (ex: Jira API Token, Redmine API Key, GitLab Access Token).
- O usuário informa o token diretamente nas configurações da conexão no Mr. Tick Desktop.
- **Vantagens:**
  - Zero necessidade de backend para o desenvolvedor do addon.
  - Segurança total: a credencial pertence ao usuário e fica armazenada no cofre seguro local da máquina do usuário (`safeStorage`).
  - Sem limites de quota compartilhada entre múltiplos usuários do addon.

#### Estratégia 2: OAuth 2.0 com PKCE Nativo (sem secret)

- Provedores modernos permitem clientes públicos através de OAuth 2.0 Authorization Code Grant com **PKCE (Proof Key for Code Exchange - RFC 7636)** sem exigir `client_secret` (ex: GitHub, Azure AD com Public Client, GitLab, Auth0).
- O Mr. Tick Core fornece via SDK os utilitários `context.host.oauth.generatePKCE()` e `context.host.oauth.authorize()`.
- O próprio aplicativo desktop realiza a autorização e a troca direta de código com o provedor, com segurança criptográfica garantida pelo `code_verifier` e `code_challenge`.

#### Estratégia 3: Backend Broker Próprio do Desenvolvedor do Addon

- Caso o provedor externo exija impreterivelmente uma `client_secret` (como no caso da Atlassian 3LO), o desenvolvedor do addon deve disponibilizar seu próprio backend seguro.
- Exemplos de arquitetura leve e de custo zero:
  - Cloudflare Worker
  - AWS Lambda / Serverless
  - Vercel Edge Function
- O worker armazena a `client_secret` do aplicativo registrado pelo desenvolvedor do addon, recebe a requisição de troca enviada pelo desktop e faz a ponte com o provedor externo.

---

## 5. Matriz Comparativa de Modelos de Autenticação

| Modelo                               | Necessita Backend Próprio? |  Segurança de Segredos   | Complexidade para o Usuário | Suporte em Provedores                       |
| :----------------------------------- | :------------------------: | :----------------------: | :-------------------------: | :------------------------------------------ |
| **API Token / PAT**                  |          **Não**           | Alta (cofre local do OS) | Média (copiar/colar token)  | Quase todos (Jira, Redmine, GitLab, GitHub) |
| **IPC Local (Named Pipe)**           |          **Não**           |  Alta (processo local)   |  Baixíssima (transparente)  | Apenas apps desktop com RPC (Discord)       |
| **OAuth 2.0 + PKCE Nativo**          |          **Não**           |   Alta (S256 verifier)   | Baixa (login no navegador)  | Provedores que aceitam Public Clients       |
| **OAuth 2.0 via Broker Oficial**     |   Sim (`mistertick-api`)   |  Alta (servidor seguro)  | Baixa (login no navegador)  | Exclusivo para Addons Oficiais do Mr. Tick  |
| **OAuth 2.0 via Broker de Terceiro** |  Sim (Cloudflare/Lambda)   | Alta (servidor do autor) | Baixa (login no navegador)  | Qualquer provedor que exija `client_secret` |

---

## 6. Diretrizes Técnicas no SDK do Mr. Tick

Ao implementar qualquer autenticador em um addon:

1. **Uso do Cliente HTTP Nativo do Host:** Nunca inclua dependências pesadas de HTTP (como `axios`) no bundle do addon. Utilize o cliente nativo disponibilizado pelo host em `context.http` ou `context.host.http` (implementado com zero dependências externas sobre o `fetch` ou `net` do Electron).
2. **Tratamento Funcional de Erros (`Either`):** Utilize sempre `Either.success` e `Either.failure`. Erros de autorização ou indisponibilidade devem devolver a mensagem real fornecida pelo servidor externo, sem suposições heurísticas baseadas em strings.
3. **Persistência Segura:** Credenciais retornadas por fluxos de autenticação devem ser devolvidas via contrato `completeAuthentication`, permitindo que o Mr. Tick armazene os segredos no cofre de credenciais nativo do sistema operacional.
