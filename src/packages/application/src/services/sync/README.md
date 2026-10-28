# Sync Subcontext (`services/sync`)

Responsável pela **Sincronização Bidirecional (Pull & Push)** de dados entre o repositório local do Mr. Tick e os provedores remotos conectados (Redmine, Jira, etc.).

## 🎯 Responsabilidades

- **Pull (Importação Contínua):** Baixar tarefas, apontamentos remotos e metadados de entidades externas.
- **Push (Exportação e Confirmação):** Enviar apontamentos criados ou editados localmente para as APIs remotas.
- **Deduplicação e Idempotência:** Garantir que o envio repetido de uma ação offline não crie apontamentos duplicados no servidor externo.

## 📁 Subdivisão por Entidade

```text
services/sync/
├── metadata/      -> Metadados e catálogos de apoio da conexão remota
├── tasks/         -> Sincronização e listagem de tarefas externas
└── time-entries/  -> Sincronização (Pull/Push) de registros de tempo e horas
```

## 📦 Serviços Contidos

### 1. `metadata/`

| Serviço               | Responsabilidade                                                    |
| :-------------------- | :------------------------------------------------------------------ |
| `MetadataPullService` | Puxa tipos de atividades, categorias de tarefas e membros da equipe |

### 2. `tasks/`

| Serviço            | Responsabilidade                                                         |
| :----------------- | :----------------------------------------------------------------------- |
| `TaskPullService`  | Executa paginação e pull incremental de tarefas associadas à conexão     |
| `ListTasksService` | Consulta tarefas armazenadas localmente para busca e preenchimento na UI |

### 3. `time-entries/`

| Serviço                  | Responsabilidade                                                              |
| :----------------------- | :---------------------------------------------------------------------------- |
| `TimeEntriesPullService` | Puxa apontamentos realizados diretamente no servidor externo                  |
| `TimeEntriesPushService` | Envia apontamentos locais para o provedor remoto com garantia de idempotência |
| `ListTimeEntriesService` | Consulta e projeta apontamentos consolidados                                  |

## 🛡️ Invariantes e Regras de Negócio

1. **Local-First Respeitado:** O usuário nunca espera a resposta da rede externa para ver seu apontamento na tela. O apontamento é gravado localmente primeiro e enviado em segundo plano pelo `TimeEntriesPushService`.
2. **Confirmação Remota Explícita:** Um apontamento só transiciona de status `pending` para `synced` após o servidor remoto devolver status HTTP 2xx e um identificador remoto definitivo.
3. **HTTP por Conexão:** Nenhuma sincronização compartilha cliente HTTP mutável global. Cada chamada utiliza a fábrica injetada (`IHttpClientFactory`) com a URL e credenciais específicas daquela conexão.

## 🚫 O que NÃO deve ficar aqui

- Regras de transição de estado de timers ativos (pertencem a `local-runtime/`).
- Manipulação do cofre de senhas (pertence a `connections/`).
- Mapeamento de telas e componentes visuais (pertence a `@mr-tick/ui`).
