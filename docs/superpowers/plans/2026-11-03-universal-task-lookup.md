# Busca universal de tarefas — plano de implementação

**Objetivo:** permitir busca local imediata, enriquecimento remoto controlado, teclado e ID manual em todas as superfícies, com metadados locais por workspace.

**Arquitetura:** manter persistência no executor canônico; coordenação remota compartilhada no processo principal, fora de filas de escrita local; componentes compartilham pesquisa/seleção e estados de progresso. Sem framework genérico nem repositório paralelo.

**Stack:** TypeScript, Electron IPC, RxDB, React, TanStack Query, Vitest e Playwright.

**Desenho:** `docs/superpowers/specs/2026-11-03-universal-task-lookup-local-metadata-design.md`. A instrução de implementação aprova o desenho, incluindo throttle e loading explícito. Gerenciador completo de tarefas locais continua fora do escopo proposto.

## Restrições globais

Seguir `AGENTS.md` e dashboard da raiz. Tipos explícitos sem coerção em produção, erros via Either, dependências obrigatórias, early return. Nenhum push/publicação ou deleção de dados. Throttle legítimo de rede não é barreira de consistência. Executar checks globais somente após implementação integral.

## Focos de revisão

Isolamento entre workspaces/conexões com IDs iguais; digitação separada de seleção; resposta obsoleta; consumidores simultâneos compartilhando orçamento de rede; metadados locais referenciados sem perda após reinício.

## Etapas

- [x] 1. Reproduzir por E2E digitação/teclado no seletor e no addon fake; preservar vermelho/verde em registros locais.
  Arquivos: `src/apps/desktop/e2e/time-entries-task-lookup.e2e.spec.ts`, `configurable-observers.e2e.spec.ts` e fixtures existentes.
- [x] 2. Centralizar consulta remota e persistência pelo owner; adicionar contrato de lookup compartilhado e testes determinísticos de frequência, concorrência, retry e escopo.
  Arquivos: contratos `core`, serviço `sync/tasks`, handlers/preload e executor/registry `local-runtime`.
- [x] 3. Separar texto de pesquisa da tarefa selecionada; compartilhar estado de consulta entre popover/modal e addon; adicionar navegação acessível, opção ID manual e feedback explícito por origem.
  Arquivos: `task-popover.tsx`, `task-lookup.tsx`, `task-lookup-results.tsx`, hook de lookup e `addon-task-destination-control.tsx`. Preservar APIs de apresentação coesas.
- [x] 4. Implementar persistência e edição de metadados locais por workspace no owner, com rejeição de exclusão em uso e integração aos seletores locais.
  Arquivos: contratos `core`, executor/registry, bridge, componente de configurações e `workspace-settings.tsx`.
- [x] 5. Executar E2Es dirigidos de entradas/timerbar/widget/addon fake, unitários/UI pertinentes e testes do novo catálogo; corrigir falhas pela causa.
- [x] 6. Executar `yarn typecheck` e `yarn lint:fix` na raiz, changeset conforme política, atualizar documentação/dashboard e obter revisão independente do conjunto. Marcar concluído somente com evidências.
- [x] 7. Corrigir regressão visual reportada após uso: retirar histórico de referências sem detalhes da lista, preservar ação única de ID manual com ícone da origem e manter resultados/loading contidos no popover; validar regressão, geometria e capturas no Electron.

Implementação e revisão concluídas. [Evidências de vermelho/verde, checks e aprovação independente](2026-11-03-universal-task-lookup-validation.md).

## Comandos de validação

`yarn vitest run --project unit <arquivos>` e `yarn vitest run --project ui <arquivos>` para testes dirigidos. E2E: build desktop pelos scripts existentes, depois `yarn --cwd src/apps/desktop test:e2e <arquivos> --workers=1 --retries=0`. Vermelho exige falha de oráculo de comportamento, nunca infraestrutura. As fixtures são locais; não provam servidores Jira/Redmine reais.
