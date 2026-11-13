# Validação da fase 3 — atualização e reconciliação analítica

Data: 10/11/2026. Status: F3-01 a F3-06 concluídos; revisão independente e reauditoria aprovadas.

## Escopo conferido

- Estratégias genéricas por descriptor: `changes` com política explícita de exclusões, `windowRescan` por coluna de data e substituição completa. O core não seleciona estratégias pelo nome do provedor.
- Checkpoint e estado de sincronização publicados na mesma transação DuckDB que a geração. Falhas entre páginas preservam dados e marcos anteriores. Delta vazio preserva a geração quando sua cobertura permanece igual.
- Atualização por upsert/tombstones ou troca da subjanela recente de 14 dias UTC; alterações fora da janela e ausência sem tombstones dependem da reconciliação completa. Reconciliação devida após seis horas e botão manual `Sincronizar` solicitam `full`.
- Manual `full` aguarda uma atualização rápida em andamento da mesma seleção; cargas iguais compartilham execução. Alteração de escopo mantém seleções distintas. Evolução incompatível entre base e delta promove uma vez para carga completa; divergência dentro de uma extração falha.
- Espaços, datas, frequência e publicações são hidratados do DuckDB. Polling padrão de cinco minutos, opção manual e frequência personalizada; execução limitada ao ciclo de vida da tela Analytics. Atualização preserva gráficos, expõe progresso por lote e trata erros estruturados. Falhas de autorização revogam somente a conexão afetada.
- Formato analítico v2 com `analytics_sync_states` e `analytics_workspace_settings`. Arquivos antigos são recusados explicitamente; não há migração nem exclusão automática de bases do usuário.

## Checks executados

| Verificação | Resultado |
|---|---|
| Analytics/CLI, incluindo DuckDB real | 71 aprovados; 1 benchmark externo pulado na execução padrão |
| UI analytics e seletor | 58 aprovados em 5 arquivos |
| Addon Redmine, unitários e HTTP controlado | 140 aprovados em 21 arquivos |
| Redmine Docker 3.4 / 5.1 / 6.0, leitura real | 18 aprovados em 2 arquivos |
| Typecheck raiz `metric` | 15/15 tarefas aprovadas; 11 em cache na execução final |
| Lint raiz `metric` | 0 erros; 108 avisos preexistentes |
| Typecheck e lint Redmine | Aprovados, sem erros |
| Build desktop / fixture / Redmine | Aprovados; desktop 7/7 tarefas |
| E2E Electron sem retries | 4 aprovados em 1,2 minuto na execução final |
| Changesets | Status válido; intenções minor/patch, sem bump manual |

Evidências desta rodada: `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`, arquivos `phase3-core-final.log`, `phase3-ui-final.log`, `phase3-redmine-tests.log`, `phase3-redmine-matrix.log`, `phase3-typecheck-final.log`, `phase3-lint-final.log`, `phase3-redmine-typecheck.log`, `phase3-redmine-lint.log`, `phase3-build-final.log`, `phase3-fake-build.log`, `phase3-redmine-build.log`, `phase3-electron-e2e-final.log` e `phase3-changesets.json`.

## Camadas e limites das provas

Os testes do service usam DuckDB real e providers controlados para comprovar múltiplas páginas, falha intermediária, retenção de marcos, janelas e alterações retroativas, exclusões explícitas/ausentes, mudança de autorização, schema, coalescência e fila de reconciliação manual. Testes do engine conferem merge transacional, reabertura, estado persistido e isolamento.

Os testes de UI usam JSDOM/bridge simulada; não comprovam transporte remoto nem pintura Recharts. O E2E Electron percorre interface, IPC, service e DuckDB com o addon sintético: carga e edição de fonte, agregação remota, restauração após reload sem atualização no modo manual, delta com upsert/exclusão, reconciliação manual e compartilhamento entre nós. Também cria um apontamento pessoal enquanto um pull pessoal está retido, observando independência funcional; isso não equivale a um benchmark de contenção sob carga extrema.

A matriz Docker usa somente leitura dos servidores locais, incluindo snapshot/checkpoint e `changes` de tarefas nas três versões e recorte `spent_on`. Mutações incrementais e exclusões determinísticas são exercitadas pela fixture; a matriz não altera registros reais para provar CDC. O Redmine não oferece tombstones de tarefas, nem snapshot transacional entre páginas. O 3.4 continua sujeito à limitação de paginação de apontamentos registrada nas fases anteriores; a extração rejeita IDs repetidos.

Polling e política de cadência são funções da tela e do serviço, não um daemon. A publicação local atômica não torna a leitura remota transacional. Não há retomada de páginas parcialmente ingeridas após reinício. Bases/formato v1 não são apagados para acomodar testes.

O pacote nativo Windows foi validado na fase 2; esta rodada valida o build e o runtime Electron atualizado, sem repetir o empacotamento de distribuição nem acrescentar prova de macOS/Linux Electron. As limitações de plataforma da [fase 2](analytics-phase2-validation.md) continuam explícitas.

## Revisão e encerramento

Primeira revisão: `request_changes` por três achados, registrados pelo auditor no checklist. Correções implementadas e aprovadas após os checks finais e a reauditoria:

| Achado | Vermelho | Correção e verde |
|---|---|---|
| F3-B01, autorização na hidratação | `phase3-authorization-core-red.log` comprova o resolver; `phase3-hydrate-red.log` comprova publicação obsoleta após leitura nativa | Snapshot de autorizações revalidado após todas as leituras do vault e novamente após a leitura do engine. `phase3-core-final.log`, incluindo barreiras durante a primeira/segunda leitura do vault e rotação durante leitura de publicação. |
| F3-B02, erro de JOIN invalida conexão saudável | `phase3-authorization-core-red.log` e `phase3-authorization-ui-red.log` | Service/engine identificam `details.connectionInstanceIds`; hooks consomem esse escopo explícito. `phase3-core-final.log` e `phase3-ui-final.log`. |
| F3-B03, falha silenciosa ao salvar configurações | `phase3-settings-red.log`, erro ignorado e polling 2000 aceito apesar do máximo IPC 1440; `phase3-settings-unmount-red.log`, última gravação cancelada ao sair da tela | Saves serializados, confirmação somente após sucesso, erro/detalhes visíveis e retry da mesma seleção; intervalo validado antes da alteração. `phase3-ui-final.log` inclui retorno à configuração inicial durante uma gravação pendente e conclusão da fila após sair da tela. |

O primeiro teste do service no arquivo `phase3-authorization-core-red.log` falhou na preparação e não é aceito como vermelho de hidratação; essa prova foi substituída pela asserção comportamental válida em `phase3-hydrate-red.log`. As regressões do resolver usam domínio real/vault controlado; a hidratação usa DuckDB real e barreiras Promise; os hooks usam bridge simulada. Não constituem E2E de servidor remoto ou desenho Recharts.

O Tech Lead repetiu independentemente 44 testes unitários e 40 de UI, conferiu os vermelhos/verdes e os checks finais e emitiu `APPROVE` para F3-01 a F3-06. O próprio auditor encerrou F3-B01 a F3-B03 e registrou que não identificou novos achados concretos nas interações examinadas. Não se declara ausência absoluta de falhas. Os seis itens da fase 3 foram concluídos no checklist após esse parecer.

Cenários executados antecipam parte da fase 4; os itens F4 permanecem sujeitos à sua auditoria integral. Changesets continuam somente minor/patch. Não houve commit, push, publicação ou bump manual nesta continuação.
