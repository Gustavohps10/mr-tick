# Workspaces Subcontext (`services/workspaces`)

Gerencia a unidade primária de agrupamento de trabalho do usuário no Mr. Tick: o **Workspace**.

## 🎯 Responsabilidades

- **Ciclo de Vida do Workspace:** Criação, exclusão, consulta e listagem de workspaces.
- **Configuração:** Marcação de status configurado/ativo.
- **Identidade e Perfil:** Atualização de nome, ícones e consulta do usuário corrente associado.

## 📦 Serviços Contidos

| Serviço                            | Caso de Uso                                                           |
| :--------------------------------- | :-------------------------------------------------------------------- |
| `CreateWorkspaceService`           | Criação com validação de regras de domínio e persistência inicial     |
| `DeleteWorkspaceService`           | Exclusão do workspace e coordenação de limpeza de vínculos associados |
| `GetWorkspaceService`              | Consulta de detalhes de um workspace específico por ID                |
| `ListWorkspacesService`            | Listagem paginada/filtrada de workspaces disponíveis                  |
| `MarkWorkspaceAsConfiguredService` | Transição de estado para marcar workspace como pronto para uso        |
| `UpdateWorkspaceIdentityService`   | Alteração de propriedades visuais e cadastrais (nome, cor, logo)      |
| `GetCurrentUserService`            | Resolução da identidade do usuário no workspace                       |

## 🛡️ Invariantes e Regras de Negócio

1. **Workspace como Unidade de Persistência:** Toda persistência de workspace é atômica e coordenada pelo `IWorkspacesRepository`.
2. **Deleção Segura:** A exclusão de um workspace não deve deixar referências de credenciais órfãs no cofre do sistema.
3. **Nenhum Segredo na Entidade Workspace:** O workspace armazena apenas configurações públicas e metadados de identificação. Tokens e senhas pertencem exclusivamente ao subsistema de conexões e cofre (`connections/`).

## 🚫 O que NÃO deve ficar aqui

- Regras de conexão com APIs externas ou OAuth (pertencem a `connections/`).
- Criação e disparo de timers (pertencem a `local-runtime/`).
- Sincronização de apontamentos ou tarefas (pertencem a `sync/`).
