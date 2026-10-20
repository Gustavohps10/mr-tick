# Services (Application Layer)

Esta camada orquestra os **Casos de Uso (Use Cases)** do ecossistema Mr. Tick.

## 🎯 Princípios Fundamentais

1. **Agnóstica de Tecnologia de Borda:** Nenhum serviço desta pasta conhece Electron, React, IndexedDB, SQLite ou Web APIs diretamente. Toda interação com infraestrutura e persistência ocorre estritamente via contratos de interfaces (`@/contracts`).
2. **Tratamento Funcional com `Either`:** Operações de aplicação nunca disparam `throw` para controle de fluxo de negócio. O retorno é sempre `Either<AppError, T>`.
3. **Inversão de Controle Estrita:** Dependências são injetadas no construtor sem propriedades opcionais (`?:`).

## 📁 Subcontextos e Responsabilidades

| Módulo | Responsabilidade | O que entra | O que sai |
| :--- | :--- | :--- | :--- |
| [`workspaces/`](./workspaces/) | Gerenciamento de áreas de trabalho do usuário | Criação, deleção, configuração e identificação de workspace | `WorkspaceDTO`, estados de configuração |
| [`addons/`](./addons/) | Catálogo, ciclo de vida e settings de plugins | Importação, atualização, licença e configurações declaradas | Manifestos, snapshots de settings, autorizações |
| [`connections/`](./connections/) | Vínculos com o mundo exterior | Fluxos OAuth, autenticação por conexão, cofre e cardinalidade | Identidades de autorização, tokens seguros no cofre |
| [`sync/`](./sync/) | Sincronização de dados remotos | Puxar/empurrar tarefas, apontamentos e metadados de datasources | Snapshots locais atualizados e confirmados |
| [`local-runtime/`](./local-runtime/) | Motor determinístico local de tempo real | Comandos de timer, pausas, deduplicação e resolução de conflitos | Estado do timer, eventos de ciclo de vida local |

## 🚫 O que NUNCA colocar aqui
- Mocks ou drivers de bancos de dados específicos (pertencem a `@mr-tick/adapters`).
- Componentes visuais, hooks React ou estilos (pertencem a `@mr-tick/ui` ou `apps/desktop`).
- Definições de entidades puras sem orquestração (pertencem a `@mr-tick/domain`).
