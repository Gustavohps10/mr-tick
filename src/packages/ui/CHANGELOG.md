# @mr-tick/ui

## 1.4.0

### Minor Changes

- 5925d4c: feat: adiciona popover tri-modo compacto (lista, semanal, mensal) na barra de tempo e melhorias visuais

  - **Popover Tri-modo de Apontamentos:** Alternador dinâmico entre visualização em Lista, Semanal e Mensal diretamente na barra de tempo (`Overview`), com suporte a DnD e persistência de ordenação no widget.
  - **Desacoplamento de Range:** Isolamento total dos períodos semanal e mensal em relação aos parâmetros da URL (`ignoreUrlRange: true`), garantindo navegação independente e sem interferência mútua.
  - **Identidade Visual e Anti-fundo:** Botão de adição em grupo mestre atualizado para o componente Link (`variant="link"`) com cor semântica `text-foreground` / `hover:text-foreground/80` adaptável a temas claro e escuro.
  - **Padronização Visual nas 3 Visões:** Substituição de marcadores genéricos por `<DataSourceLogo />` e ícones mapeados de trackers (`TrackerIconComponent`), além da remoção de nomes brutos de datasource e exibição limpa do chip `#ID - Título` com tooltip de hover.
  - **Estabilidade de Layout:** Calibração dos inputs triplos de tempo no modo compacto prevenindo corte de dígitos, preservação da coluna de sincronização e rolagem vertical suave nas tabelas.

## 1.3.2

### Patch Changes

- 2e336c8: Aprimora a Timer Bar em modo widget (janela flutuante transparente):
  - Adiciona seletor de Orientação (Horizontal / Vertical) nas configurações em substituição à bússola de ancoragem (restrita ao modo workspace).
  - Habilita arrasto 2D bidimensional livre sem travas em um único eixo, com clamping responsivo às bordas.
  - Blinda a transparência de cliques contra o bloqueador fantasma via MutationObserver para fechamento de overlays/portais Radix, detecção precisa de eventos globais de ponteiro e garantia de inicialização com repasse de mouse events.
  - Adiciona suíte de testes de componentes cobrindo 100% dos cenários de orientação, arrasto 2D e transparência de cliques.

## 1.3.1

### Patch Changes

- fca1bd6: Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.
  - @mr-tick/sdk@0.5.0

## 1.3.0

### Minor Changes

- f124a75: fix(mapping): resolve campo de mapeamento pós-autenticação via instância ativa de datasource

  Corrige falha arquitetural onde `getMappingFields` era chamado antes da autenticação,
  retornando sempre uma lista vazia pois o `IDataSource` estático não possui contexto de
  credenciais ou URL do servidor remoto.

  **Mudanças:**
  - `IAddonsAPI.getMappingFields` agora aceita `workspaceId` e `connectionInstanceId` opcionais
  - `AddonsHandler.getMappingFields` prioriza resolver a instância autenticada via `IDataSourceResolver`
    quando `workspaceId` + `connectionInstanceId` estão presentes; mantém fallback para addons estáticos
  - `MappingConfigModal` propaga `workspaceId` e `connectionInstanceId` para o backend
  - `AddonFieldRenderer` e `MappingFieldItem` propagam os props de contexto de conexão
  - `DataSourceConnectionsContext` expõe `workspaceId` no contrato do contexto
  - `DataSourceInstancesManager` exibe botão "Configurar Mapeamento" por instância **conectada**,
    abrindo o `MappingConfigModal` com o contexto correto de autenticação

### Patch Changes

- 96c4dec: fix(ui): solid styling for activity badges, preset import with empty colors, and mapping reflection

  - Corrige estilização de badges de atividade para utilizar cor de fundo 100% sólida e opaca (`color-mix` sRGB), eliminando vazamento visual/transparência de itens inferiores em agrupamentos sobrepostos.
  - Torna o importador de presets flexível para aceitar definições com campos de cor vazios (`color: ""`).
  - Ajusta botão de exportação no `MappingConfigModal` para iniciar com o rótulo "Copiar JSON" e permitir cópia manual ou sob clique.
  - Atualiza componentes de visualização (`time-entries-table-columns`, `calendar-view`, `timesheet-view`, `task-lookup`) para refletir mapeamentos dinâmicos salvos no `localStorage`.
  - Adiciona testes unitários abrangentes e testes E2E Playwright no Electron validando importação de preset com 20 campos, exportação e persistência.

## 1.2.0

### Minor Changes

- 82f3d48: Adiciona MappingConfigModal com seleção interativa de ícones Lucide, paleta de cores e importação/exportação de presets JSON para equipes, integrando AddonFieldRenderer aos canais IPC do Electron.

### Patch Changes

- 909bcc6: Centraliza a renderização de campos de schema em AddonFieldRenderer reutilizável, elimina duplicidade de código de formulários e adiciona testes E2E com FakeDataSource.
- Updated dependencies [82f3d48]
  - @mr-tick/sdk@0.5.0

## 1.1.3

### Patch Changes

- 9b79109: Corrigir validação Ajv do RxDB permitindo comments e endDate nulos em time entries durante sincronização downstream (RC_PULL).

## 1.1.2

### Patch Changes

- Updated dependencies [b6a306b]
  - @mr-tick/sdk@0.4.1

## 1.1.1

### Patch Changes

- 250dbe7: fix: prevent fatal RxDB DB9 error in production database initialization and stabilize E2E test suites

## 1.1.0

### Minor Changes

- 00bc018: Standardize DataSource and provider contracts, enforce SemVer minor locking for addons, implement functional HostBridge with Either, and stabilize drafts in UI

### Patch Changes

- Updated dependencies [00bc018]
- Updated dependencies [394905d]
  - @mr-tick/sdk@0.4.0

## 1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies
  - @mr-tick/sdk@0.3.0

## 1.0.2

### Patch Changes

- Updated dependencies [82941c8]
- Updated dependencies
  - @mr-tick/sdk@0.1.1

## 1.0.1

### Patch Changes

- Updated dependencies
  - @mr-tick/sdk@0.1.0
