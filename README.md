<h2 align="center">
  <div align="center">
    <img height="100" src="./src/packages/ui/src/assets/logo.svg#gh-light-mode-only" alt="Mr. Tick Logo" />
    <img height="100" src="./src/packages/ui/src/assets/logo-dark.svg#gh-dark-mode-only" alt="Mr. Tick Logo" />
  </div>

Engine de produtividade e rastreamento de tempo local-first para desenvolvedores e equipes técnicas. Seus dados. Sua máquina. Seu tempo.

</h2>

<p align="center">
    <img src="https://img.shields.io/github/languages/top/Gustavohps10/mr-tick?label=TypeScript&color=4f94ee&style=flat-square&logoColor=ffffff&logo=typescript"/>
    <img src="https://img.shields.io/github/commit-activity/w/Gustavohps10/mr-tick?label=Commits&color=4f94ee&style=flat-square&logo=git&logoColor=ffffff"/>
    <img src="https://img.shields.io/github/license/gustavohps10/mr-tick?label=License&color=4f94ee&style=flat-square"/>
</p>

<p width="100%">
  <img src="./docs/screenshots/screenshot-dark.png#gh-dark-mode-only" width="100%" alt="Mr. Tick Dark Mode" />
  <img src="./docs/screenshots/screenshot-light.png#gh-light-mode-only" width="100%" alt="Mr. Tick Light Mode" />
</p>

---

## 💡 O que é o Mr. Tick?

O **Mr. Tick** é uma plataforma de **apontamento de horas, produtividade e observabilidade Local-First** construída para eliminar a fricção de alternar entre múltiplas ferramentas (Redmine, Jira, GitHub, Calendário).

- **Performance Instantânea:** A UI interage com o banco de dados reativo local (**RxDB**), garantindo resposta com zero latência.
- **100% Offline-First:** O sistema opera perfeitamente sem internet. A sincronização com APIs externas ocorre em background de forma incremental e idempotente.
- **Privacidade Absoluta (Zero-Cloud Data Policy):** Nenhum dado de tarefas, apontamentos ou código trafega para servidores de terceiros. A comunicação acontece diretamente da sua máquina para as ferramentas corporativas integradas.
- **Extensibilidade Ilimitada:** Arquitetura desacoplada via **SDK de Addons Multicapacidade** para criação de conectores de dados, watchers e temas.

---

## 🏗️ Estrutura do Monorepo

O projeto é gerenciado com **Turborepo** e **Yarn 4 (Berry)**:

```text
src/
├── apps/
│   ├── desktop/           # Aplicação desktop principal (Electron + React)
│   ├── landing-page/      # Portal web e página de downloads (Next.js)
│   └── sdk/               # CLI e runtime do SDK (@mr-tick/sdk)
├── packages/
│   ├── ui/                # Biblioteca de componentes visuais (Tailwind v4)
│   ├── application/       # Casos de uso, orquestração e contratos do host
│   ├── domain/            # Entidades de negócio puras
│   ├── adapters/          # Adaptadores de rede, HTTP e integrações
│   └── shared/            # Helpers, ViewModels e tratamento funcional de erros (Either)
├── dev-addons/
│   └── datasource-fake/   # Plugin mock para desenvolvimento e testes E2E
```

---

## 🚀 Como Começar

### Pré-requisitos
- **Node.js:** Versão 20 LTS ou superior.
- **Yarn:** Yarn 4 habilitado (via Corepack ou `yarn set version 4`).
- Guia detalhado passo a passo de configuração: **[docs/como-rodar.md](docs/como-rodar.md)**.

### Instalação e Execução

```bash
# 1. Instalar dependências em todo o monorepo
yarn install

# 2. Compilar os pacotes
yarn build

# 3. Iniciar o aplicativo desktop em modo de desenvolvimento
yarn dev:desktop
```

---

## 🛠️ Comandos Principais

| Comando | Descrição |
| :--- | :--- |
| `yarn dev:desktop` | Inicia o app desktop com hot-reload e watchers ativos |
| `yarn build` | Compila todos os pacotes e aplicações via Turborepo |
| `yarn test:unit` | Executa a suíte de testes unitários com Vitest |
| `yarn test:ui` | Executa os testes de interface e stores de sincronização |
| `yarn --cwd src/apps/desktop test:e2e` | Roda a suíte completa de testes E2E do Electron com Playwright |
| `yarn lint:fix` | Valida e corrige automaticamente regras de ESLint |
| `yarn typecheck` | Executa a checagem de tipos estrita em todo o monorepo |

---

## 🧩 Ecossistema de Plugins & Addons

A extensibilidade do Mr. Tick é orientada a **4 Pilares Principais**:
1. **DataSources:** Conexão com sistemas externos de issues e time tracking (Redmine, Jira, GitLab).
2. **Watchers:** Automações locais para monitorar eventos do sistema (Git branch, Discord Presence, IDEs).
3. **Calendários:** Integração com calendários para transformar reuniões em apontamentos com 1 clique.
4. **Temas & Menus:** Customização completa do visual e atalhos na barra do timer.

Documentação completa da arquitetura de plugins: **[docs/addons.md](docs/addons.md)**.  
Plugin de referência oficial: **[redmine-plugin](https://github.com/Gustavohps10/mr-tick-redmine)**.

---

## 📚 Documentação & Decisões Arquiteturais

- **[Roadmap Estratégico & Visão de Futuro](docs/ROADMAP.md)**: Marcos concluídos e próximas fases de produto.
- **[Como Rodar o Projeto](docs/como-rodar.md)**: Instruções passo a passo de setup no Windows, Linux e macOS.
- **[Arquitetura de Addons](docs/addons.md)**: Guia completo para criação e ciclo de vida de plugins.
- **[ADRs (Architectural Decision Records)](docs/)**:
  - `ADR-001`: Estrutura do Monorepo e Modelo de Execução
  - `ADR-002`: Multi-datasource e Múltiplas Conexões por Workspace
  - `ADR-003`: Sincronização Local-First com RxDB
  - `ADR-004`: Arquitetura de Plugins e Isolamento
  - `ADR-005`: Precisão de Timer e Journal no Main Process
  - `ADR-006`: Design System com Tailwind v4
  - `ADR-007`: Tratamento Funcional de Erros com Either e DTOs Canônicos no SDK

---

## 👤 Autor

**Gustavo Henrique Pereira dos Santos**
- Website: [gustavohenrique.vercel.app](https://gustavohenrique.vercel.app/)
- GitHub: [@Gustavohps10](https://github.com/Gustavohps10)

## 📄 Licença

Este projeto é software livre licenciado sob os termos da licença [Apache 2.0](LICENSE).
