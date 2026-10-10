# MR-TICK — Ecossistema de Plugins e Addons

O **Mr. Tick** é uma plataforma Local-First expansível através do **`@mr-tick/sdk`**.

A documentação completa para desenvolvedores de addons, tutoriais passo a passo e referências de API estão centralizadas no portal de documentação oficial:

👉 **[Acessar a Documentação de Addons](file:///c:/myapps/metric-context/metric/src/apps/landing-page/content/docs/index.mdx)** (`src/apps/landing-page/content/docs/`)

---

## 🧩 Os 4 Pilares de Addons

1. **📦 DataSources:** Conectores com plataformas de tarefas e apontamentos (Redmine, Jira, GitHub Issues).
2. **👁️ Watchers:** Observadores em segundo plano que monitoram o ambiente (janelas ativas, branches Git, Discord) e sugerem apontamentos.
3. **📅 Calendars:** Importação e sincronização de reuniões (Google Calendar, Microsoft Outlook) para conversão rápida em tempo apontado.
4. **🎨 Temas & Menus:** Customização visual e atalhos na barra do timer (Timerbar) e menus laterais.

---

## 🔗 Referência Rápida

- **Guia Rápido:** [`src/apps/landing-page/content/docs/quickstart.mdx`](../src/apps/landing-page/content/docs/quickstart.mdx)
- **DataSources:** [`src/apps/landing-page/content/docs/categories/datasources.mdx`](../src/apps/landing-page/content/docs/categories/datasources.mdx)
- **Watchers:** [`src/apps/landing-page/content/docs/categories/watchers.mdx`](../src/apps/landing-page/content/docs/categories/watchers.mdx)
- **Plugin de Referência Oficial:** [mr-tick-redmine](https://github.com/Gustavohps10/mr-tick-redmine)

## Contratos atuais do SDK

- [Timer, apontamentos e sugestões locais](sdk-local-runtime.md)
- [Consultas do Core, escopo e lifecycle](sdk-core-capabilities.md)

Estas referências descrevem o comportamento implementado. Exemplos conceituais de categorias não ampliam as APIs garantidas pelo SDK.
