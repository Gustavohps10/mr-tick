# Analytics — plano e decisões da fase 1

Autorização: usuário solicitou montar o plano e implementar a fase 1. Preservar alterações locais da fase 0; somente minor/patch. O checklist raiz é o registro de aceite F1-01 a F1-09.

## Comportamento pretendido

Uma chamada entrega um lote, nunca esconde falha como conclusão. O chamador segue uma continuação opaca para obter o próximo lote. O cursor pertence ao provider da conexão e ao mesmo escopo/filtros/tamanho de lote. Uma falha permite repetir a chamada sem avançar o cursor. A UI apresenta uma página de prévia por vez; não acumula silenciosamente o dataset inteiro para construir totais globais. A ingestão durável e a publicação de cargas continuam na fase 2.

## Decisões de implementação

1. Contrato: acrescentar informações de lote (índice, offset e percurso concluído) e motivo de cobertura. `partial` com continuação indica que a leitura prossegue. Percurso concluído não implica snapshot consistente: Redmine não oferece essa garantia entre requisições, portanto leituras com múltiplas páginas terminam com cobertura não verificada, mesmo em 5.1/6.0 com contagem estável e sem duplicatas. Apenas uma resposta atômica que cobre o escopo pode declarar complete. A última página isolada nunca representa todo o escopo; a UI mantém explícita a condição de prévia quando há mais de um lote. Essa distinção foi confirmada na revisão independente do plano.
2. Provider Redmine: substituir os datasets CSV de tarefas/apontamentos por datasets JSON canônicos, com IDs nativos, filtros enviados ao servidor e custom fields identificados por ID nativo. Sem aliases legados nem fallback CSV→JSON. CSV não fornece identidade de apontamentos e a exportação de issues pode ser truncada; sua leitura antiga não será mantida como caminho analítico concorrente.
3. Listas REST paginadas (tarefas, apontamentos, projetos, usuários, queries, memberships): uma página remota por chamada. Falhas, metadados inconsistentes, páginas vazias antes do total, duplicatas e mudança de contagem produzem erro explícito. No 3.4/versão desconhecida, apontamentos com múltiplas páginas nunca recebem garantia de completude; documentar a limitação em vez de deduplicar e declarar sucesso.
4. Endpoints que exigem projeto (versões, categorias, memberships) exigem seleção explícita. Históricos/relações exigem uma tarefa explícita, pois Redmine não fornece lote de detalhes de journals; não criar N+1. Coleções nativamente não paginadas são respostas atômicas, com orçamento de payload; não inventar paginação remota inexistente.
5. Filtros: aceitar IDs nativos/operações públicas, sem resolver nomes por varreduras. Retirar fallback users→memberships. Erro 403 de usuários permanece 403. O catálogo de filtros pagina explicitamente, com limite de opções e erro ao exceder; não apresenta catálogo truncado como completo.
6. Atom: reutilizar parsing da descoberta operacional, expor dataset de descoberta de tarefas por janela/projeto, sem filtro pessoal. Enriquecer IDs pela consulta REST em lote. Cobertura sempre não verificada: feed não é snapshot completo nem feed de exclusões. Falha de Atom não dispara varredura alternativa silenciosa.
7. Orçamento inicial, decisão técnica desta implementação: lotes REST até 100 linhas (padrão 100); uma requisição HTTP analítica ativa por conexão e fila limitada; timeout de transporte 30 s; payload aceito até 2 MiB; no máximo 16 leituras paginadas ativas, expiração por inatividade de 10 min e máximo de 50 mil IDs por leitura. Limites falham explicitamente. São limites conservadores configurados no código, não metas de desempenho medidas. A validação do tamanho após decodificação limita payload aceito, sem prometer streaming ou limite físico de alocação do transporte atual.
8. Deduplicação: reutilizar InFlightRequests por instância, corrigir identidade de parâmetros se necessário e coalescer somente chamadas idênticas. Não introduzir cache global. O cancelamento lógico de uma leitura não aborta consumidores HTTP independentes; guards da fase 0 continuam rejeitando resultados após desativação/desconexão. Não prometer cancelamento físico novo.
9. UI: botão explícito de próximo lote para fontes, mantendo apenas a página atual, seus metadados e a indicação de prévia/cobertura. Escopo alterado reinicia a leitura; resposta superada não substitui estado atual. Gráficos sobre prévias permanecem identificados como prévias, sem promessa de totais globais.

## Sequência e critérios de aceite

Implementar contratos e provider paginado; converter todos os datasets e filtros; adicionar descoberta Atom; integrar prévia/continuação na UI. Durante implementação, testes específicos de cursor, retry, falha, isolamento, limites, IDs/custom fields e erros 403. Bugs concretos têm vermelho/verde registrado, sem fabricar vermelho para refatoração.

Validar contratos com fixture independente e testes de transporte HTTP, matriz Docker somente leitura em 3.4/5.1/6.0 e E2E Electron. Após escopo integral: lint:fix/typecheck na raiz de ambos repositórios, builds, CLI validate, revisão independente e changesets. Marcar apenas itens efetivamente comprovados; documentar limites de snapshot remoto e não confundir ambiente estático com garantia sob escritas concorrentes.

## Ajustes confirmados na revisão técnica

O manifest declara selection: {dateRange, project} para os parâmetros comuns de seleção. Omissão significa não suportados. Essa declaração evita acoplar o core a nomes de filtros de um provedor. A UI usa catálogo por workspace/conexão para normalizar a consulta e a identidade do cache; o provider rejeita seleções que o endpoint não aplica. A chave de coalescência de continuação é canônica, independente da ordem de propriedades da requisição e dos objetos de intervalo.

O seed adicional autorizado usa 12 projetos, 24 usuários, 600 tarefas e 3000 apontamentos por versão, com grupos de timestamps empatados. O perfil é opt-in, aditivo e tem limites máximos de 2000 tarefas/10000 apontamentos. Endpoints nativamente atômicos não recebem paginação remota fictícia; suas respostas ficam sujeitas ao orçamento de payload aceito.
