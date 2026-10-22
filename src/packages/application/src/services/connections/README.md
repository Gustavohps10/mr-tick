# Connections Subcontext (`services/connections`)

Gerencia o ciclo de vida completo de **Contas e Conexões Externas**, garantindo autenticação segura, coordenação de renovação de tokens (refresh) e isolamento estrito de credenciais.

## 🎯 Responsabilidades

- **Ciclo de Conexão:** Conectar, desconectar, vincular (`link`) e desvincular (`unlink`) contas a workspaces.
- **Coordenação OAuth:** Iniciar tentativas PKCE com vinculação de contexto estrito e consumir callbacks sem risco de replay.
- **Gestão Segura de Credenciais:** Mediação com o cofre do SO (`Keytar`) distinguindo ausência de credencial de falha de hardware/sistema.
- **Deduplicação de Refresh:** Evitar tempestade de renovações simultâneas de tokens (apenas 1 refresh em trânsito por autorização).
- **Recuperação e Resiliência:** Journaling de intenções pendentes de escrita no cofre e transações atômicas de ciclo de vida.

## 📦 Serviços Contidos

| Serviço | Caso de Uso |
| :--- | :--- |
| `ConnectAddonConnectionService` | Inicia o fluxo de conexão da conta com validação de cardinalidade |
| `DisconnectAddonConnectionService` | Desconecta a conta, preservando configurações e limpando segredos |
| `LinkConnectionService` | Vincula uma conexão existente e autenticada a um workspace específico |
| `UnlinkConnectionService` | Remove o vínculo da conexão com o workspace |
| `ConnectionLifecycleCoordinator` | Coordenador central de estado de conexão, refresh e health checks |
| `OAuthAttemptCoordinator` | Gerencia tentativas OAuth com PKCE, state único e timeout determinístico |
| `AddonAuthenticatorRegistry` | Registro em memória dos autenticadores providos pelos addons |
| `AddonConnectionProfilesResolver` | Resolve os perfis registrados em runtime pelo datasource ou pelas contribuições de conexão do addon |
| `GetMappingFieldsService` | Resolve campos mapeáveis (ex: status, tipos de tarefa) da conexão |
| `RecoverConnectionLifecycleService` | Recupera intenções de ciclo de vida pendentes após reinício abrupto |
| `RecoverAddonWorkspaceCredentialWritesService` | Recupera escritas pendentes de credenciais |
| `CoreAddonScopeOwnershipValidator` | Valida autoridade de escopo para leitura/gravação |
| `AddonCapabilityOwnershipValidator` | Garante que o addon é o legítimo dono da capacidade solicitada |

## 🛡️ Invariantes e Regras de Negócio

1. **Cardinalidade Estrita (`single` vs `multi` - M04):** Se um perfil de conexão for do tipo `single`, o sistema proíbe categoricamente a existência de mais de uma conexão ativa no mesmo workspace para aquele addon.
2. **Isolamento de Credenciais por Conexão:** Tokens e segredos são endereçados pela tupla de autorização, nunca misturados entre workspaces ou conexões vizinhas.
3. **Respostas Atrasadas não Restauram Vínculos:** Callbacks tardios de OAuth ou tentativas expiradas não podem ressuscitar conexões já liberadas ou removidas.
4. **Distinção no Cofre (M06):** O cofre deve sempre distinguir claramente entre:
   - `absent`: A credencial simplesmente não existe (usuário deslogado).
   - `unavailable`: O cofre do SO está bloqueado ou indisponível (não deslogar o usuário por engano).

## 🚫 O que NÃO deve ficar aqui
- Armazenamento de tarefas ou histórico de apontamentos (pertencem a `sync/` e RxDB).
- Regras de contagem de tempo de timers (pertencem a `local-runtime/`).
- Mapeamento de UI ou formulários React (pertencem a `@mr-tick/ui`).
