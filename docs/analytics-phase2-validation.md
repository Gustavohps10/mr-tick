# Validação da fase 2 — warehouse analítico

Data: 2026-11-10. Status: concluída, empacotada no Windows e aprovada na revisão independente e reauditoria Tech Lead.

## Escopo implementado

- `AnalyticsWarehouseService` coordena os efeitos do provider e a publicação, separado da capacidade de persistência `IAnalyticsEngine`.
- `DuckDBAnalyticsEngine` mantém gerações próprias de datasets analíticos; os repositórios e o banco operacional/pessoal permanecem com seu ownership existente.
- Arquivo por workspace, seleção isolada por conexão e assinatura de autorização/configuração, sem credenciais na base analítica. Autorização é conferida antes/depois das consultas e antes da publicação.
- Uma transação curta por lote e outra na publicação. HTTP não fica dentro de transação. Falhas deixam a publicação anterior utilizável pelo mesmo proprietário autorizado. Preparações abandonadas são descartadas na abertura, sem prometer retomada/checkpoint.
- Projeção/casts, predicados tipados, CASE, fórmulas, agrupamento, pivot, joins, union, rollups e SQL rodam no motor. O executor JavaScript/SQL simulado foi removido. A UI recebe páginas e metadados, e solicita totais do conjunto completo antes da paginação.
- SQL usa parser/AST e serialização nativos, com SELECT único, projeção explícita, inputs autorizados e funções permitidas. A ordenação declarada é preservada com desempate determinístico. Tabelas externas, extensões e instalações automáticas ficam desabilitadas.
- Continuação local inclui uma versão. Publicação ou mudança do plano invalida a página seguinte explicitamente. Inspeção, pesquisa, prévia de SQL e drill-down usam a consulta nativa. Erros e detalhes estruturados são exibidos sem adivinhação por mensagem.
- Agregação remota exige descriptor de grupos/operadores e cobertura final. Grupos repetidos, inclusive nulos, falham. Sua publicação é distinta do snapshot. Projeção/filtro são permitidos; regrouping, joins, casts e fórmulas não são presumidos válidos. A fixture de desenvolvimento oferece esse modo; Redmine não o anuncia.
- Schema pode adicionar colunas nullable durante uma carga; mudança de tipo/ID nativo da coluna falha. Uma nova geração reconstrói a projeção, inclusive com remoção de campos e mudança explícita de tipo. Valores ausentes são NULL, sem conversão silenciosa.

## Resultados dos checks

- Raiz `metric`: `yarn typecheck`, `15/15` tarefas aprovadas (`phase2-typecheck-final.log`); `yarn lint:fix`, `0` erros e `108` avisos preexistentes em arquivos não relacionados à fase 2 (`phase2-lint-final.log`).
- Suíte de analytics/CLI (`phase2-core-tests.log`): `45` testes aprovados em 8 arquivos e `1` pulado na execução padrão (`AnalyticsWarehouse.enterprise.spec.ts`, executado explicitamente com `MR_TICK_ANALYTICS_REDMINE_URL` para os Redmines 5.1/6.0).
- UI analytics e seletor de filtros (`phase2-ui-tests.log`): `43` testes aprovados em 4 arquivos (`multi-select-combobox.spec.tsx` 7, `generic-widget-renderer.spec.tsx` 15, `workflow-node-config-dialog.spec.tsx` 9 e `use-analytics-workspace.spec.tsx` 12), além das rodadas `phase2-reference-green.log` (`12/12`) e `phase2-remote-config-green.log` (`36/36`).
- Redmine com o SDK local: `133` testes aprovados em 21 arquivos (`phase2-redmine-tests.log`), typecheck (`phase2-redmine-typecheck.log`) e lint (`phase2-redmine-lint.log`) aprovados sem erros.
- Build desktop e E2E Electron: `7/7` tarefas de build aprovadas (`phase2-build-desktop-final.log`); E2E Electron (`analytics-pipeline.e2e.spec.ts`, `phase2-electron-e2e.log`) aprovado com `2/2` testes sem retries (`37.7s`), cobrindo extração/edição/gráfico de snapshot e publicação de agregação remota sem colunas brutas.
- Fixture mínima empacotada com `electron-builder` `26.18.1` (`phase2-native-fixture-runtime.json`): executável Windows completo iniciou com `app.isPackaged = true`, gravou/reabriu uma base `.duckdb` e retornou duas linhas com soma `5`.
- Pacote Windows desktop final regenerado (`phase2-package-windows-current.log`, `phase2-full-package-integrity.json` e `phase2-full-package-runtime.json`): ASAR íntegro (`49.959` arquivos, `683.115.368` bytes esperados e obtidos, `complete: true`, `duckdb.node` e `duckdb.dll` desempacotados) e carregamento da Node-API via `.output/win-unpacked/mr-tick.exe` com `ELECTRON_RUN_AS_NODE=1` (Electron `31.0.2` / Node `20.14.0`, `entries: "2"`, `total: 5`).
- Reauditoria independente Tech Lead: veredito `APPROVE`, com reexecução direta de `9` arquivos / `91` testes (`22` em `DuckDBAnalyticsEngine.spec.ts`, `AnalyticsWarehouseService.spec.ts` e `AnalyticsWarehouseHandler.spec.ts`; `43` de UI nos 4 arquivos; `26` no `redmine-plugin` em `RedmineAnalyticsProvider.spec.ts` e `AnalyticsRequestBudget.spec.ts`), `0` falhas e `0` pulados.

## Provas executadas

As suítes `DuckDBAnalyticsEngine.spec.ts`, `AnalyticsWarehouseService.spec.ts` e `AnalyticsWarehouseHandler.spec.ts` exercitam o motor nativo real, persistência/reabertura, batches, falhas, isolamento, schema, semântica dos operadores, SQL ordenado, agregações remotas, controle da autorização após a leitura e fronteiras IPC. Testes de UI verificam carga por publicação, páginas/versionamento, preservação após falha de refresh, erros/retry da consulta auxiliar de referência, restrições de pós-processamento remoto e invalidação por permissão na camada JSDOM com `IHostBridge` simulado (sem validar pintura real de gráficos Recharts). O E2E Electron exercita a interface → IPC → `AnalyticsWarehouseService` → `DuckDBAnalyticsEngine` com o addon sintético `@mr-tick/datasource-fake` (sem HTTP Redmine real).

Os arquivos de evidência ficam em `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`:

- `phase2-core-tests.log`, `phase2-ui-tests.log`, `phase2-redmine-tests.log`, `phase2-redmine-typecheck.log`, `phase2-redmine-lint.log`, `phase2-typecheck-final.log`, `phase2-lint-final.log`, `phase2-electron-e2e.log` e `phase2-package-windows-current.log`.
- `phase2-enterprise-redmine51.json` e `phase2-enterprise-redmine6.json`.
- `phase2-full-package-integrity.json` e `phase2-full-package-runtime.json` (além de `phase2-packaged-windows-native.json` e `phase2-native-fixture-runtime.json`): Node-API carregada a partir do ASAR final em Electron `31.0.2`/Node `20.14.0`, com `duckdb.node` e `duckdb.dll` fora do ASAR, e fixture Windows com `app.isPackaged = true`.
- `phase2-linux-native.json`: Node `v20.20.2` Linux x64 executou escrita/reabertura e soma esperada. O comando Docker terminou com erro de limpeza por filesystem somente leitura; o resultado nativo foi gravado antes desse erro. Não equivale a um build Electron de distribuição Linux.

## Medição com a massa enterprise existente

Leitura real, somente GET, dos Redmines Docker; o adaptador do teste é uma fixture HTTP tipada, não um conector Redmine inserido no core. O percurso passa pelo coordenador e pelo DuckDB reais. A soma de todas as linhas extraídas é comparada ao total nativo. A resposta consultada tem uma linha.

| Redmine | Linhas | Lotes | Extração | Ingestão + coordenação | Consulta global | RSS do processo de teste |
|---|---:|---:|---:|---:|---:|---:|
| 5.1 | 3448 | 35 | 20.96 s | 2.01 s | 33.7 ms | 92.8 → 113.0 MiB |
| 6.0 | 3356 | 34 | 19.36 s | 2.81 s | 56.2 ms | 93.8 → 112.7 MiB |

Tempos são amostras locais, sem promessa de latência. Ingestão + coordenação é tempo total da carga menos o tempo HTTP medido; não é um microbenchmark isolado do INSERT. RSS é do processo Vitest/Node, incluindo o binding, e não representa o desktop completo nem um limite físico de memória. O Redmine 3.4 mantém a limitação de paginação demonstrada na fase 1; não foi apresentado como carga enterprise nativa bem-sucedida.

A cobertura desses percursos permanece `unverified`: o fim das páginas não fornece um snapshot transacional remoto.

## Limites e plataformas

Duas threads e 256 MiB configurados por instância, até dois workspaces abertos; fila de 32 operações normais e oito admissões reservadas para limpeza das até oito gerações ativas globais; limite de 30 s da operação nativa ativa; até oito cargas, 50 mil linhas, mil páginas, 256 colunas e 500 linhas retornadas por consulta. LRU não descarta uma preparação ativa ao reabrir um workspace no mesmo processo. Encerramento drena a fila e fecha conexões/instâncias.

A matriz CI `analytics-native.yml` foi adicionada para Windows, Linux e macOS. macOS não foi executado nesta máquina. A prova Linux disponível é Node nativo, sem Electron empacotado. Não declarar essa matriz remota como aprovada antes de sua execução.

O empacotador original `26.0.12` reproduziu falha ao coletar dependências opcionais de outras plataformas. A ferramenta foi atualizada para `26.18.1`, dentro da mesma major, que contém a correção oficial de https://github.com/electron-userland/electron-builder/pull/9274. O pacote Windows completo regenerado após os últimos ajustes passou pela conferência integral do ASAR (`49.959` arquivos, `683.115.368` bytes esperados e obtidos, `complete: true`, `duckdb.node` e `duckdb.dll` desempacotados) e pelo carregamento da Node-API a partir do arquivo final via `mr-tick.exe` (`ELECTRON_RUN_AS_NODE=1`). `phase2-full-package-integrity.json`, `phase2-full-package-runtime.json` e `phase2-native-fixture-runtime.json` (`app.isPackaged = true`) registram essas provas.

## Fechamento e revisão independente

- Checks finais executados sem concorrência de build, incluindo regressões do ciclo de revisão e pacote Windows completo regenerado.
- Revisão independente e reauditoria Tech Lead concluídas com veredito `APPROVE` para `F2-01`–`F2-06` e `F2-B01`–`F2-B09`.
- Changesets registrados com `minor`/`patch` em ambos os repositórios (no `metric`, `.changeset/native-analytics-warehouse.md` e `phase2-changeset-status.json`), sem bump manual de versões, commit, push ou publicação.
- Itens `F2-01`–`F2-06` e `F2-B01`–`F2-B09` marcados como `[x]` no checklist raiz após a aprovação da reauditoria.


## Regressão corrigida durante a implementação

`F2-B01` registra a paginação de pesquisa na inspeção. O teste determinístico do hook comprovou a repetição de offset zero quando havia pesquisa (`phase2-search-pagination-red.log`). A página passou a pertencer ao par nó/pesquisa, mantendo a versão; o mesmo teste passou (`phase2-search-pagination-green.log` e `phase2-ui-tests.log`). Essa prova exercita o hook com bridge simulado, não constitui um E2E do motor; o item foi conferido e encerrado na revisão independente.

Na validação inicial do empacotamento completo, um build concorrente regenerou o `dist` da UI enquanto os arquivos eram copiados e invalidou um chunk. A execução final usa bundles concluídos sequencialmente, sem build/typecheck concorrente; o ASAR final foi conferido pelo tamanho declarado no header (`phase2-full-package-integrity.json`) e pelo carregamento do módulo nativo (`phase2-full-package-runtime.json`). As tentativas incompletas não são aceitas como pacote válido.


## Rodada da revisão independente e reauditoria

O Tech Lead solicitou correções em cinco integrações (`F2-B02` a `F2-B06`), a auditoria do implementador reproduziu ainda dois desvios (`F2-B07` e `F2-B08`), e a primeira reauditoria identificou e exigiu regressão determinística para o tratamento da consulta auxiliar de referência (`F2-B09`). Todos os nove itens passaram por vermelho determinístico, correção na camada responsável, verde e reauditoria independente final aprovada (`APPROVE`), sem bloqueadores remanescentes no escopo da fase 2.

| Item | Vermelho preservado | Verde / camada exercitada |
|---|---|---|
| F2-B01 | phase2-search-pagination-red.log | phase2-search-pagination-green.log, phase2-ui-tests.log; hook React com `IHostBridge` simulado (sem E2E do motor). |
| F2-B02 | phase2-count-pivot-red.log | phase2-widget-regressions-green.log, phase2-ui-tests.log, phase2-native-regressions-green.log; 3 modelos React/bridge simulado + DuckDB real com medida nula. |
| F2-B03 | phase2-published-schema-red.log | phase2-hook-regressions-green.log, phase2-ui-tests.log; schema publicado aparece no editor sem seleção automática (hook/bridge simulado); persistência/NULLs/ID customizado conferidos no DuckDB real. |
| F2-B04 | phase2-remote-alias-red.log | phase2-widget-regressions-green.log, phase2-ui-tests.log; nomes das séries inspecionados na árvore React/props, sem afirmar teste visual de desenho Recharts. |
| F2-B05 | phase2-case-else-red.log | phase2-native-regressions-green.log, phase2-core-tests.log; DuckDB real, `THEN` literal e `ELSE` numérico. |
| F2-B06 | phase2-authorization-isolation-red.log | phase2-hook-regressions-green.log, phase2-ui-tests.log; duas conexões na UI com bridge simulado; falha somente de A e poda de ancestrais antes da consulta/invalidação. |
| F2-B07 | phase2-staging-cleanup-red.log | phase2-native-regressions-green.log, phase2-core-tests.log; DuckDB real + fila saturada por barreiras Promise, liberação garantida de staging e disponibilidade dos oito slots. |
| F2-B08 | phase2-remote-source-red.log, phase2-remote-config-red.log, phase2-workspace-remote-red.log | phase2-hook-regressions-green.log, phase2-remote-config-green.log, phase2-ui-tests.log e `phase2-electron-e2e.log` (teste 2); agregação remota sem projeção bruta e bloqueios/desabilitações explícitos de pós-processamento. |
| F2-B09 | phase2-reference-red.log (6 falhas) | phase2-reference-green.log (12/12), phase2-ui-tests.log (43/43); erro/detalhes e retry da consulta auxiliar, ausência de chamadas indevidas em `none`/`fixed_target`, e recusa explícita de pós-processamento remoto na UI + compiler (JSDOM com bridge simulado; sem desenho Recharts). |

As correções preservam os contratos: pivô de contagem usa `COUNT` sem coluna; séries remotas usam seus aliases reais; referências `THEN` e `ELSE` determinam um tipo comum no `CASE`; inputs são podados por alvo antes da consulta/invalidação; schema do nó vem de sua publicação; fila reserva capacidade para limpeza e o limite global de cargas é aplicado no engine; consultas auxiliares de referência só executam em modos aplicáveis e expõem erros estruturados sem descartar o gráfico principal; e agregação remota não exige campos brutos nem permite pós-processamento proibido.
