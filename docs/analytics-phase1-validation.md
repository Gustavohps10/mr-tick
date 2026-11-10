# Analytics — registro de validação da fase 1

## Achados concretos

- [x] B1 — Colisão de identidade de chamadas in-flight (P1). Consultas `/issues.json` com `{q: 'x&user_id=2'}` e `{q: 'x', user_id: '2'}` geravam a mesma chave por concatenação sem escape. Cenário reproduzido com servidor HTTP local, FetchHttpClient do SDK e RedmineClient: a segunda consulta recebeu ID 1 em vez de ID 2. Teste: `test/e2e/AnalyticsInFlightIsolation.e2e.spec.ts`. Vermelho em `phase1-inflight-http-red.log`; critério de aceite: duas respostas corretas e duas requisições distintas, mantendo coalescência de consultas idênticas. Não envolve criação/idempotência de apontamentos nem prova concorrência de escrita no Redmine real.

Logs: `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`.

- [x] B2 — Continuações concorrentes equivalentes (P2), confirmado pelo revisor. Ordem diferente de propriedades na consulta gerava duas operações sobre o mesmo cursor e uma falha falsa de offset após o primeiro avanço. Regressão determinística de provider/pager com barreira; não é prova de HTTP remoto. Log vermelho: phase1-cursor-concurrency-red.log. Aceite: uma leitura compartilhada e dois sucessos idênticos.
- [x] B3 — Seleções não suportadas reportadas no escopo (P2), confirmado pelo revisor. Projeto fornecido a journals/relações não era aplicado, mas aparecia no escopo com coverage complete; datas em datasets sem filtro temporal também eram ignoradas. Aceite: contrato declara suporte às seleções comuns, UI envia somente seleções declaradas e provider rejeita seleções não suportadas antes de acessar HTTP.

## Limites preservados

Terminar o percurso REST não prova snapshot remoto consistente. Leituras com múltiplas páginas terminam com cobertura não verificada. Duplicatas, mudanças de contagem e fim prematuro são erros explícitos, sem deduplicar e declarar completude. Redmine 3.4 conserva sua limitação de paginação.

O transporte atual decodifica o corpo antes de aplicar o limite de payload aceito. O orçamento não representa streaming nem limite físico de alocação da rede. Leituras analíticas têm cliente/fila próprios e timeout de transporte; guards descartam resultados após revogação, sem prometer cancelamento físico de consumidores independentes.

## Resultado final e revisão

F1-01 a F1-09 aprovados na revisão independente. B1, B2 e B3 passaram por vermelho/verde e conferência do revisor; a reauditoria final não identificou novos achados concretos no escopo. O revisor repetiu 27 testes do plugin e 6 do hook da UI. Não houve validação de consistência sob escritas concorrentes nem garantia de isolamento físico dos recursos compartilhados do servidor.

| Verificação final | Resultado |
|---|---|
| Lint na raiz do core | 0 erros; 108 avisos existentes |
| Typecheck na raiz do core | 15/15 tarefas aprovadas |
| Testes específicos do core e regressões operacionais | 85/85 |
| UI — analytics, filtros e escopos | 25/25 |
| Redmine — unitários e transporte HTTP | 133/133 |
| Matriz Docker ampliada | 12/12 |
| Electron — seleção, próximo lote, edição e gráfico | 1/1, sem retries |
| Builds | SDK, desktop, fixture e plugin aprovados |
| Redmine — lint/typecheck/manifesto | Aprovados |
| Changesets dos dois repositórios | Aprovados, sem major |

B2 e B3: vermelho em phase1-cursor-concurrency-red.log e phase1-unsupported-scope-red.log; verde em phase1-review-regression-green.log, phase1-redmine-unit.log e phase1-ui-tests.log. B1: phase1-inflight-http-red.log e phase1-inflight-http-green.log. As provas de B2/B3 são na camada provider/hook; o E2E Electron cobre o fluxo integrado de prévia e a matriz Docker cobre o protocolo real das três versões.

## Massa empresarial moderada

O perfil docker/seed-analytics-enterprise.rb acrescenta, por versão, 12 projetos, 24 usuários, 600 tarefas e 3000 apontamentos. Não remove nem substitui o seed base. Usa marcadores determinísticos e timestamps empatados, além de dados históricos. Foi executado nas três versões. Reexecução no 6.0 manteve 647 tarefas e 3356 apontamentos totais, comprovando a cardinalidade repetível nessa versão.

| Redmine | Total remoto de apontamentos | Páginas chamadas | Resultado |
|---|---:|---:|---|
| 3.4 | 3460 | 2 | Primeiros 100 aceitos; segunda página rejeitada por IDs repetidos |
| 5.1 | 3448 | 35 | Todos percorridos, cobertura final unverified |
| 6.0 | 3356 | 34 | Todos percorridos, cobertura final unverified |

Na rodada final, os percursos 5.1/6.0 levaram aproximadamente 20 s cada; os picos amostrados de heap do processo de teste ficaram em 30/28 MiB. São observações com outros checks em execução, não benchmarks isolados nem limites de RAM do aplicativo. O provider mantém a página corrente, última resposta repetível e identidades limitadas, sem acumular todas as linhas do scan; o teste mantém seu próprio conjunto de IDs para conferir unicidade.

Após provisionar a matriz com os mounts do compose, executar o seed base e yarn docker:seed:analytics. Para a prova ampliada em PowerShell, definir MR_TICK_ANALYTICS_ENTERPRISE=1 e executar os dois arquivos RedmineAnalyticsDataset.live.spec.ts e RedmineAnalyticsCapability.integration.spec.ts com Vitest. A suíte confere o volume mínimo quando essa flag está ativa. Nos containers já existentes foi necessário copiar o novo seed antes de executá-lo; não houve recriação de serviços nem reset de banco.

A distribuição continua usando o SDK local vinculado. Nenhum push, commit de release, publicação ou bump manual foi realizado. Armazenamento DuckDB, publicação de gerações e reconciliação permanecem nas próximas fases.
