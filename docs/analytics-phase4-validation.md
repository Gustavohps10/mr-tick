# Validação integral de analytics — fase 4

Data: 10/11/2026. Status: F4-01 a F4-05 concluídos, com checks finais e revisão independente aprovados.

## Matriz de cenários

| Cenário | Evidência executável | Camada e resultado esperado |
|---|---|---|
| Identidade nativa e duplicação | `DuckDBAnalyticsEngine.spec.ts`; `AnalyticsWarehouse.contract.spec.ts` | DuckDB real: duplicatas rejeitadas, IDs textuais Unicode preservados e upserts sem duplicar registros. |
| Empates temporais e repetição de fronteira | Redmine `RedmineAnalyticsProvider.spec.ts`; fixture HTTP independente | Paginação inclusiva com IDs ordenados no conector; reaplicação de delta com a mesma revisão na fixture mantém três identidades/soma 17. Não se presume CDC remoto. |
| Continuidade, reabertura e retomada | `AnalyticsWarehouseService.spec.ts`; `DuckDBAnalyticsEngine.spec.ts`; fixture HTTP | Cursor/escopo validados; preparação abandonada descartada; reinício usa o último checkpoint publicado e começa na primeira página, sem retomar páginas parcialmente ingeridas. |
| Falha entre páginas | Service e fixture HTTP | Falha 503 após lote inicial mantém geração e checkpoint anteriores; nova tentativa conclui o percurso. |
| Cancelamento | Fixture HTTP e `analytics-isolation.e2e.spec.ts` | Aborto real por `AbortController` no transporte HTTP; resposta 499 controlada no addon de desenvolvimento. Ambas impedem publicar carga incompleta. |
| Alteração retroativa e mudança de data | Service e engine | Rescan recente preserva histórico anterior; alterações fora da janela só aparecem após full; movimentos para dentro da janela não duplicam a identidade. |
| Exclusões | Service, engine e pipeline Electron | Tombstones explícitos removem registros; delta sem tombstones não remove ausências; reconciliação completa trata ausências do escopo percorrido. |
| Escopo, filtros e permissão | Service/resolver/hooks; matriz Redmine | Seleções distintas isoladas; revalidação durante vault/leitura nativa; erro de consulta composta invalida só a conexão identificada. |
| Fluxo pessoal durante analytics | `analytics-isolation.e2e.spec.ts` | IPC/runtime/RxDB/provider reais do desktop: criar, editar, iniciar/pausar/retomar/parar timer e completar push/pull enquanto uma segunda página analítica está retida; repetir após sucesso, 503 e 499. |
| Provedor independente | `AnalyticsWarehouse.contract.spec.ts` | Servidor HTTP local, `ElectronHttpClient`/`NodeFetchTransport`, service e DuckDB reais, sem Redmine nem `FakeAnalyticsProvider`: leituras de medidores, IDs textuais, checkpoints opacos e campo nativo `urn:meter:energy`. |

As suítes de service, engine, resolver e hooks foram construídas nas fases anteriores e continuam exercitadas nesta rodada. A matriz não apresenta cobertura de unidade como E2E do servidor real.

## Provas acrescentadas

A fixture HTTP usa checkpoints `etag:initial/α` e `etag:delta/β`, sem formato de timestamp presumido pelo core. O teste reabre o warehouse, aplica upserts/tombstone e repete a fronteira inclusiva. Outros dois casos retêm a publicação após erro 503 e aborto físico da requisição HTTP na segunda página, reabrem o banco e conferem que o retry utiliza novamente o checkpoint anterior e não o cursor parcial.

O novo E2E estabelece uma publicação válida, libera o primeiro lote da atualização e retém a segunda chamada por uma barreira Promise do addon de desenvolvimento. Enquanto a contagem analítica permanece em duas chamadas, executa comandos pessoais reais, confere a edição no armazenamento remoto da fixture e importa um registro remoto novo por pull. A conclusão exige `error === null`, `lastPullResult === 'success'` e efeito observável na lista local; apenas despachar o forceSync ou observar a fila ociosa não conta como prova de sucesso. Depois libera a página com sucesso, falha ou cancelamento, verifica a geração e os timestamps e executa nova carga de recuperação.

O teste antigo `[F4-02]` do service, que apenas executava callbacks locais independentes, foi removido: ele não provava isolamento do fluxo pessoal. A preparação do novo E2E aguarda a confirmação do push de criação antes de editar, evitando confundir o conflito otimista `COMMAND_STATE_CHANGED` de operações pessoais concorrentes com bloqueio por analytics. Ensaios de preparação não são registrados como vermelhos de bugs confirmados.

## Checks e evidências

| Check | Resultado |
|---|---|
| Analytics/CLI e runtime pessoal, unitários e integração nativa | 96 aprovados; um benchmark externo pulado na execução padrão |
| UI analytics e seletor | 58 aprovados |
| Fixture HTTP independente | 3 aprovados, incluídos nos 96 |
| Addon Redmine, unitários e HTTP controlado | 140 aprovados |
| Matriz Redmine 3.4 / 5.1 / 6.0, somente leitura | 18 aprovados |
| Isolamento pessoal no Electron | 3/3 sem retries, 59,9 s na execução específica |
| Typecheck / lint raiz | Execução final: 15/15 tarefas; zero erros e 108 avisos preexistentes |
| Build e E2E integral | Desktop 7/7 tarefas e fixture aprovados; E2E final reforçado 7/7 sem retries em 2,0 min |
| Revisão independente e changeset | APPROVE para F4-01 a F4-05; status Changesets válido, patch somente da fixture de desenvolvimento |

Logs em `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`: `phase4-contract.log`, `phase4-core-tests.log`, `phase4-ui-tests.log`, `phase4-redmine-tests.log`, `phase4-redmine-matrix.log`, `phase4-isolation-e2e.log`, `phase4-isolation-strengthened.log`, `phase4-lint-final.log`, `phase4-typecheck-final.log`, `phase4-build-final.log`, `phase4-fake-build-final.log`, `phase4-electron-e2e-final.log` e `phase4-changesets.json`.

A matriz CI nativa passou a incluir a fixture HTTP nas três plataformas. A configuração remota não foi executada nesta rodada e não é apresentada como aprovada.

## Limites explícitos

- O contrato atual não expõe cancelamento universal nem botão de cancelar. A prova cobre aborto do transporte/provedor e retenção transacional. Sair da tela encerra novos ciclos de polling; uma operação já iniciada pode concluir. Não se promete interrupção física de todo addon.
- A prova de concorrência pessoal é funcional, com analytics retido na leitura de página. Não mede saturação de CPU, latência sob carga extrema, RSS global nem contenção no Redmine corporativo.
- O E2E usa o addon de desenvolvimento; a fixture independente prova HTTP real fora de Redmine. A matriz Docker foi somente leitura. Não foram feitas mutações nos servidores Redmine para afirmar descoberta universal de exclusões.
- Redmine não oferece tombstones de tarefas nem snapshot transacional entre páginas; a paginação 3.4 de apontamentos continua rejeitada quando duplica IDs. Cobertura `unverified` permanece explícita.
- Não houve nova prova de empacotamento Electron macOS/Linux. Os limites e as evidências de plataforma das fases anteriores permanecem válidos. Não foram apagadas bases do usuário nem ampliado o seed nesta etapa.

## Revisão e encerramento

O Tech Lead repetiu independentemente a fixture HTTP (3/3) e conferiu o E2E integral e os checks. A revisão identificou uma lacuna na prova do pull pessoal: despacho/contagem/fila ociosa também poderiam acompanhar falha. As asserções foram fortalecidas com resultado de sucesso, ausência de erro e importação de registro novo. O isolamento reforçado passou 3/3 e a execução integral final passou 7/7 sem retries.

Parecer final: `APPROVE` para F4-01 a F4-05, registrado pelo auditor no checklist. Não foram identificados novos bugs concretos de produção nas interações examinadas; não se declara ausência absoluta de falhas. Os itens foram encerrados após os checks finais. Não houve commit, push ou alteração no repositório do addon Redmine nesta fase.
