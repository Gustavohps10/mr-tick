# Fase 2 — base analítica local e consultas

Autorização: implementar F2-01 a F2-06 do checklist raiz. Preservar o trabalho local das fases anteriores e usar somente minor/patch. A base pessoal e seus repositórios não serão duplicados.

## Arquitetura e decisões

DuckDB Node Neo é a direção técnica, sujeita a uma prova inicial de persistência, binding Node/Electron e empacotamento. O motor é uma infraestrutura do desktop, com operações nativas assíncronas fora do renderer. O application define contratos e coordena extração/publicação; um único DuckDBAnalyticsEngine possui o armazenamento analítico. Não haverá um segundo repositório de workspace, timer, tarefa ou apontamento pessoal.

Arquivos ficam em userData/analytics, um por workspace, com nome derivado de hash do ID. Proprietário de cada geração: workspace, conexão, assinatura da autorização/configuração e seleção canônica (incluindo o significado de uma agregação remota). Reautorizar a conexão com outra identidade não concede acesso às gerações anteriores. Cada consulta revalida localmente a autorização dos inputs pelo resolver, sem exigir HTTP para consultar a última carga disponível offline.

Uma carga cria uma geração em preparação, grava cada lote e só troca o ponteiro publicado em uma transação curta ao concluir o percurso. Não manter transação aberta esperando HTTP. Falha, cursor inválido, duplicatas, mudança incompatível de schema ou autorização alterada descartam a preparação e preservam a geração publicada anterior. Preparações interrompidas pelo fechamento são limpas na próxima abertura; não são tratadas como cargas retomáveis. Checkpoints duráveis, agendamento e reconciliação continuam na fase 3.

`batch.finished` e `coverage` mantêm significados diferentes. Uma carga Redmine com várias páginas pode ser publicada atomicamente como leitura não verificada, nunca como snapshot remoto consistente. Falha no Redmine 3.4 impede publicação e mantém a versão anterior. Metadados de cobertura e atualização acompanham todos os resultados.

## Ingestão e schema

O serviço consome continuação a continuação, sem concatenar o dataset em memória. O motor grava tipos explícitos por coluna e preserva IDs/custom fields nativos. Campo ausente numa linha é NULL; campo inesperado fora do schema falha. Colunas novas durante a leitura ampliam a projeção com NULL para linhas anteriores. Mudança de tipo ou identidade da mesma coluna dentro da carga falha. Nova carga completa cria uma tabela nova, permitindo reconstrução de schema sem adaptar bases legadas nem converter valores silenciosamente.

O engine recebe somente dados analíticos, não credenciais. A fronteira de integração nativa encapsula falhas em Either<AppError,T>. A camada de persistência não coordena autenticação ou HTTP. Retenção inicial: geração publicada atual e preparação; gerações substituídas são liberadas após a publicação atômica. Não apagar diretórios ou bases do usuário.

## Consultas e consumidores

Contratos canônicos de plano cobrem projeção/cast explícito, filtros, CASE, fórmulas, agrupamento, pivot, joins e union. A UI migra suas configurações para esses contratos e envia o plano ao motor; não executa os operadores sobre a base carregada no renderer. O SQL assistido passa a ser SQL executado pelo DuckDB, com uma única consulta SELECT, projeção explícita e acesso somente aos aliases dos inputs autorizados. A validação usa o parser nativo do DuckDB, com AST e funções/tabelas permitidas, sem regex para adivinhar consultas. Acesso externo e instalação automática de extensões ficam desabilitados.

Consultas retornam projeção e página limitadas. Gráficos solicitam agrupamentos no motor sobre a geração completa antes da paginação. Reshaping para desenho não vira nova agregação de dados brutos na UI. Filtros de inspeção/drill-down também são consultas ao motor. Resultados paginados/limitações de cobertura ficam explícitos.

Agregação remota é uma execução explícita, validada contra as colunas/operadores declarados pelo provider. Sua identidade inclui agrupamentos e medidas; não substitui a carga de registros da mesma seleção. No escopo inicial, seus resultados permitem projeção/filtro/ordenação, sem assumir que médias ou medidas agregadas aceitam novo agrupamento, joins ou fórmulas. Uma fixture contratual valida esse caminho sem inventar suporte no Redmine.

## Orçamento, ciclo de vida e validação

A revisão do desenho confirmou três regras adicionais: paginação local inclui uma versão da consulta derivada das gerações dos inputs; uma publicação entre páginas invalida explicitamente essa versão, sem misturar gerações. A autorização é conferida também depois da consulta assíncrona, antes de devolver dados. Agregação remota partial sem continuação é carga incompleta e não substitui a geração publicada.

Decisões iniciais: 2 threads e 256 MiB por instância; até 2 workspaces abertos, execução serializada com fila limitada; máximo 50 mil linhas por carga e 1000 páginas; páginas de consulta até 500 linhas. Medir esses limites com a massa empresarial existente. Não são promessas de latência universal nem de memória total do app. Liberar conexões/instâncias no fechamento e manter o binding nativo fora do asar quando necessário.

Sequência: prova nativa e de persistência → contratos/engine/carga → plano/operadores → bridge/IPC e todos os consumidores → testes de falha/reabertura/schema/isolamento/agregação remota → matriz Redmine e medição → checks raiz/build/empacotamento/E2E → revisão independente → changesets/documentação/checklist. Validar execução real nos ambientes disponíveis e registrar explicitamente limites de plataforma, sem declarar builds não executados como aprovados.


A reauditoria de integração acrescentou limite de oito gerações ativas também no engine, independente do service, e oito admissões reservadas para a remoção dessas preparações. A fila normal continua limitada a 32 operações. Assim, saturação de consultas não impede a própria liberação de uma carga abortada; execução permanece serial e limitada, sem timers ou retry cego.

O editor oferece o schema efetivamente publicado do próprio nó/conexão para selecionar explicitamente colunas descobertas. Publicações agregadas mantêm a distinção entre o catálogo nativo usado na requisição remota e os grupos/aliases devolvidos. Requisições de UI levam somente os ancestrais do alvo, preservando outras publicações em uma falha de autorização.
