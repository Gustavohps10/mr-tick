# 🗺️ Mr. Tick — Roadmap Estratégico & Visão de Futuro

Este documento consolida a evolução de produto, arquitetura e marcos técnicos do ecossistema **Mr. Tick**.

---

## 🎯 Proposta de Valor
O Mr. Tick é o **cockpit de produtividade e time tracking local-first** para desenvolvedores e equipes técnicas:
- **Zero Context-Switching:** Centraliza tarefas de múltiplos gerenciadores (Redmine, Jira, GitHub Issues) e calendário em uma timeline rápida e unificada.
- **100% Offline-First:** Toda a persistência é local (RxDB), permitindo resposta instantânea com zero latência mesmo com APIs externas lentas ou indisponíveis.
- **Extensibilidade Aberta (SDK de Addons):** Qualquer desenvolvedor pode plugar novas fontes de dados, watchers de atividade, temas e comandos.

---

## 🧭 Marcos de Evolução

### ✅ Fase 1: Fundação & Motor Local-First (Entregue)
- [x] Arquitetura em Monorepo estruturada com Turborepo e Yarn 4.
- [x] Motor de sincronização offline-first e persistência local reativa com **RxDB**.
- [x] Reconciliação canônica, prevenção de conflitos e recuperação atômica de criação de apontamentos.
- [x] Paginação por snapshot com cursores controlados pelo provedor (`TimeEntriesPaginationSnapshotPage`).
- [x] Identidade local determinística via SHA-256 (`connectionInstanceId::remoteId`) para convergência sem duplicatas entre janelas.
- [x] App Desktop completo (`@mr-tick/desktop`) em Electron + React + Tailwind v4.
- [x] Timer de alta precisão executado no Main Process com suporte a Journal e Boot Recovery.
- [x] Widget flutuante com suporte a click-through e atalhos globais.
- [x] SDK canônico de plugins (`@mr-tick/sdk`) baseado em DTOs puros e tratamento funcional de erros (`Either<AppError, T>`).
- [x] Plugin de referência oficial: `redmine-plugin` v0.7.0.
- [x] Suíte determinística com 58 testes E2E do Electron e cobertura unitária completa.

---

### 🚀 Fase 2: Distribuição, Auto-Update & Estabilidade de Addons (Próximo Marco)
- [ ] **Homologação Completa do Auto-Update:**
  - Validação do fluxo de atualização transparente com tags monorepo (`@mr-tick/desktop@x.y.z`) via GitHub Releases.
  - Notificação não intrusiva na interface para reinicialização suave.
- [ ] **Gestão Visual de Incompatibilidade de Addons:**
  - Exibição de alertas amigáveis na UI quando um addon instalado requerer versão superior do SDK (`requiredApiVersion`).
  - Atualização de addons instalados a partir do catálogo oficial (`addons-manifest`) com 1 clique.
- [ ] **Empacotamento e Distribuição Multiplataforma:**
  - Build oficial para Windows (`.exe` NSIS / Portable).
  - Suporte a Linux (`.AppImage` / `.deb`) e macOS (`.dmg`).

---

### 🧩 Fase 3: Expansão do Ecossistema de Plugins
- [ ] **Novos Provedores de Tarefas (DataSources):**
  - Conector nativo para **Jira Cloud / Server**.
  - Conector para **GitHub Issues & Pull Requests**.
  - Conector para **GitLab & Linear**.
- [ ] **Pilar de Calendários:**
  - Integração com **Google Calendar** e **Outlook 365** para converter reuniões do dia em apontamentos com 1 clique.
- [ ] **Pilar de Ponto Formal (Punch):**
  - Integração com plataformas de registro de ponto (Pontomais, Ahgora, Tangerino).
- [ ] **Watchers de Contexto (Automações):**
  - Git Branch Watcher: Associação automática de tempo trabalhado à branch ativa do repositório local.
  - Discord Presence: Atualização automática de status de presença durante tarefas ativas.

---

### 🏢 Fase 4: On-Premise & Enterprise Hub (Visão de Longo Prazo)
- [ ] **Mr. Tick Server (Enterprise Container):**
  - Imagem Docker oficial para execução on-premise em servidores corporativos ou redes VPN.
  - Acesso 100% via navegador web para equipes que não podem instalar software local.
- [ ] **Integração com Diretórios Corporativos (SSO):**
  - Autenticação via SAML, Azure AD e Google Workspace.
- [ ] **Provisionamento Centralizado de Plugins:**
  - Permite aos administradores pré-configurar conexões corporativas para todos os membros da equipe.
