# Busca universal de tarefas — evidências de validação

Data: 2026-11-03. Desenho e execução: [plano](2026-11-03-universal-task-lookup.md).

## Comportamento entregue

- Pesquisa local imediata, por ID literal ou título, separada da seleção confirmada; navegação com setas, Enter e Escape.
- Origem explícita para referências remotas. ID ausente do cache pode ser confirmado sem esperar a rede; ausência de detalhes é apresentada como tal.
- Consulta remota compartilhada pelo processo principal, com debounce de 400 ms na UI, intervalo global mínimo de 400 ms entre operações, até três operações simultâneas e uma operação por workspace/conexão. Consultas equivalentes compartilham execução; cada consumidor conserva sua intenção pendente mais recente. HTTP 429 preserva o erro e respeita Retry-After; sem instrução válida, bloqueia novos inícios por cinco segundos. Não há retry automático ilimitado.
- Resultados remotos persistidos pelo owner canônico do workspace, sem sobrescrever tarefas locais pendentes. Estados de espera, busca, conclusão e falha exibem ícone e texto por origem.
- Catálogo local por workspace com seis categorias, IDs estáveis, nome/ícone/cor, revisão otimista e rejeição de remoção em uso. Integração à atividade de apontamentos e timerbar, sem exigir conexão remota.
- Contratos públicos `core.tasks.search` e `core.metadata.getLocal` documentados, com o mesmo serviço de lookup para consumidores do SDK.

## Vermelho e verde

O E2E TSK-05 reproduziu a contaminação entre texto e seleção: esperava `responsividade`, mas o campo continha `#MOB-315responsividade`. O CEN-01 digitou `ALPHA-101` no destino do addon e recebeu campo vazio. Ambos falharam pelo comportamento esperado, antes das correções. Registros locais: `.temp/task-lookup-red.log` e `.temp/task-lookup-addon-red.log`.

Após separar pesquisa de seleção, corrigir o foco dos seletores e isolar o contexto de cada consumidor, os mesmos caminhos passaram. A suíte final também testa origem obrigatória, resultado remoto exclusivo do lookup, disponibilidade de ID manual durante rede bloqueada, enriquecimento do cache e envio de `UNRESOLVED-123456` ao provider fake. O oráculo de envio percorre a paginação real do snapshot remoto.

Falhas intermediárias de seletores antigos e paginação incompleta do próprio teste foram corrigidas nos testes; não são apresentadas como bugs confirmados do produto. Uma tentativa do CEN-07 falhou por desanexação de opção de canal; a rodada final completa passou sem retries.

## Verificações

| Camada | Resultado | Registro local |
| --- | --- | --- |
| UI completa | 57 arquivos, 477 testes aprovados | `.temp/task-lookup-all-ui.log` |
| UI dirigida após ajustes finais | 4 arquivos, 24 testes aprovados | `.temp/task-lookup-final-directed.log` |
| Application, coordenação e provider fake | 3 arquivos, 16 testes aprovados | `.temp/task-lookup-final-unit.log` |
| Regressões da revisão: SDK, coordenador, Application e fake | 4 arquivos, 37 testes aprovados | `.temp/task-lookup-review-unit-green.log` |
| Regressões da revisão: hook, popover e destino do addon | 3 arquivos, 13 testes aprovados | `.temp/task-lookup-review-ui-green.log` |
| IPC, transporte, SDK e integrações relacionadas | 7 arquivos, 68 testes aprovados em rodada anterior; há sobreposição com a rodada dirigida | `.temp/task-lookup-related-unit.log` |
| Electron real + addons fake + Discord RPC simulado | 12 testes aprovados, 1 worker, 0 retries | `.temp/task-lookup-final-e2e.log` |
| Electron após revisão: busca remota, cancelamento e addon | 2 testes aprovados, 1 worker, 0 retries | `.temp/task-lookup-review-e2e-green.log` |
| Serviços de diagnóstico existentes | 3 arquivos, 19 testes aprovados | `.temp/task-lookup-diagnostics-unit.log` |
| Typecheck na raiz | 15/15 trabalhos aprovados | `.temp/task-lookup-typecheck.log` |
| `yarn lint:fix` na raiz | 0 erros; 108 avisos reportados | `.temp/task-lookup-lint.log` |
| Changesets | Intenção de versão validada, sem pacote ignorado no changeset novo | `.temp/task-lookup-changeset-status.json` |

E2E final:

```powershell
yarn --cwd src/apps/desktop test:e2e time-entries-task-lookup.e2e.spec.ts configurable-observers.e2e.spec.ts workspace-local-metadata.e2e.spec.ts timerbar-widget.e2e.spec.ts --grep 'TSK|CEN-01|CEN-07|LOOKUP|metadados locais|widget Electron real' --workers=1 --retries=0
```

O conjunto exercita entradas de tempo, popover/modal, timerbar/widget real, configurações de addons, reabertura de configurações, troca de workspace com evicção LRU e catálogo local após reload. Testes do owner verificam revisão concorrente, proteção de referências em uso e preservação de tarefa com alteração local pendente. Testes do coordenador usam relógio controlado para frequência, deduplicação, concorrência, cancelamento por consumidor e Retry-After.

## Cobertura de routes.ts pelo typecheck

`tsc --noEmit --listFilesOnly` no desktop inclui `src/main/routes.ts`, `src/main/index.ts` e `src/preload/index.ts`. Uma prova temporária inseriu uma atribuição inválida em routes.ts, executou **`yarn typecheck --force` na raiz** e restaurou os bytes originais em `finally`. O comando falhou com código 2 e `src/main/routes.ts(...): error TS2322: Type 'number' is not assignable to type 'string'`. Registro: `.temp/task-lookup-typecheck-coverage.log`. A execução final, sem a prova temporária, passou. O cancelamento IPC retorna `Promise<void>`, conforme o contrato de registro de rotas.

O usuário também apresentou TS2345 do editor nas rotas de diagnóstico: a inferência genérica adotava o formato do ramo 403, exigindo `error: string` também no sucesso. Os quatro callbacks agora declaram explicitamente o `Promise<ViewModel<...>>` correspondente ao handler. O usuário confirmou a resolução no editor; a revisão aprovou a tipagem, e o typecheck final da raiz passou novamente.

## Limites

Os testes não fazem requisições a Jira ou Redmine reais, nem provam OAuth, permissões ou aceitação de IDs por esses servidores. O core aceita a referência; rejeições remotas continuam explícitas no fluxo de sincronização. Busca textual depende da capacidade do provider: um provider sem suporte continua expondo seu erro canônico. Catálogo local não implica um gerenciador completo de tarefas locais.

Os arquivos de log em `.temp` são artefatos locais ignorados pelo Git. Nenhuma versão de pacote foi alterada manualmente.

## Revisão final

Revisão independente identificou dois P2: chamadas SDK sem identidade própria podiam substituir outra consulta pendente, e limpar o texto não cancelava uma intenção já enfileirada. Ambos tiveram regressão determinística vermelha antes da correção (`.temp/task-lookup-sdk-concurrency-red.log` e `.temp/task-lookup-empty-intent-red.log`).

Cada chamada SDK agora recebe identidade própria; consultas equivalentes continuam compartilhando execução pela chave. Um efeito específico para texto vazio cancela a intenção do consumidor, sem adicionar cleanup por tecla. As regressões passaram (37 testes unitários e 13 de UI), e o revisor confirmou a correção dos dois pontos, sem novos bloqueadores nesses caminhos. O TSK-06 foi ampliado para enfileirar `LOOKUP-CANCELLED` atrás da resposta remota controlada e verificar que esse ID não chega ao provider após limpar o campo.

Revisão independente **aprovada** pelo agente `tech_lead_lookup_final`, após conferir os vermelhos, os verdes, 15/15 trabalhos do typecheck, lint sem erros e 2/2 E2Es dirigidos após as correções. O revisor também aprovou os retornos explícitos das quatro rotas de diagnóstico. Nenhum novo bloqueador concreto foi identificado nos caminhos revisados.

## Refinamento visual após uso

O usuário reportou uma regressão concreta: selecionar Redmine mostrava dezenas de linhas `ID … — detalhes ainda não carregados`. O popover consultava até 50 referências de apontamentos e as renderizava fora da área rolável das tarefas; elas comprimiam os resultados e alongavam o painel. O teste de UI com cache de 50 referências reproduziu o defeito: esperava zero linhas desse histórico, recebeu 50 (`.temp/task-lookup-layout-red.log`).

A correção remove a consulta e a listagem desse histórico do popover. Uma referência livre continua válida e pode ser confirmada ao digitar: há uma única ação compacta, com ícone da fonte, ID informado e nome da conexão. Os resultados remotos priorizam a logo da fonte, e os ícones mantêm dimensões e alinhamento consistentes. O loading agora pode encolher dentro da área de resultados, mantendo a ação manual visível. A API de referências existente e os dados persistidos não foram apagados.

Validação desta correção: 15 testes de UI em três arquivos; typecheck da raiz 15/15; lint da raiz com zero erros e 108 avisos. Registros: `.temp/task-lookup-layout-green.log`, `.temp/task-lookup-layout-typecheck.log`, `.temp/task-lookup-layout-lint.log`. Addon fake, digitação por teclado e widget passaram na rodada dirigida (`.temp/task-lookup-layout-e2e.log`); o TSK-07 final passou separadamente (`.temp/task-lookup-layout-final-e2e.log`).

O TSK-07 salva um ID não resolvido, confirma sua presença no provider e no histórico canônico, reabre o popover e verifica que esse histórico não é listado. Confere ícones, ação manual única e geometria do painel/ação dentro da área visível, com capturas `.temp/task-lookup-compact.png` e `.temp/task-lookup-manual-id.png`, inspecionadas visualmente. Uma tentativa intermediária exigia imagem de logo na fonte fake, que não declara logo; a checagem agora aceita seu ícone de componente. Outra tentativa falhou no setup do Electron e não constitui evidência vermelha de comportamento.

Revisão independente da correção visual **aprovada** por `tech_lead_lookup_final`: conferiu remoção da lista duplicada, preservação do backend, ação manual única por origem, teclado, scroll contido e capturas com rodapé inteiro. Sem bloqueadores concretos identificados na simplificação.

## Validação consolidada antes dos commits

Na rodada final, a UI completa passou com 58 arquivos e 479 testes. A suíte unitária executou 818 testes: 817 passaram na execução concorrente, e o teste nativo de clique físico SendInput falhou por não registrar eventos nessa rodada. A repetição isolada do arquivo nativo passou nos dois testes, sem alteração de código ou do oráculo. Registros: `.temp/precommit-core-ui.log`, `.temp/precommit-core-unit.log` e `.temp/precommit-native-isolated.log`.

Typecheck global: 15/15 trabalhos aprovados. Lint global: zero erros, 108 avisos. Os changesets foram validados sem pacote ignorado no arquivo novo. O SDK permanece sem publicação e sem bump manual; os addons usam `portal:../metric/src/apps/sdk`. Discord teve apenas seus mocks atualizados para os métodos novos; Redmine passou em 97 testes, Discord em 76, Jira em 54 e os temas Claude/Dracula em um teste cada. Todos passaram na checagem de tipos com o SDK local.

Por instrução expressa do usuário, nenhum workflow de CI/CD foi alterado. As validações acima são locais; não representam execução ou aprovação de pipelines remotos.
