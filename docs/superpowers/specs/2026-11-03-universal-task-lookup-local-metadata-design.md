# Busca universal de tarefas e metadados locais

Data: 2026-11-03. Estado: implementação validada; refinamento visual após uso registrado no relatório de validação. O escopo mantém a proposta de metadados locais e referências livres, sem gerenciador completo de tarefas locais.

## Intenção e requisitos confirmados

O workspace pode possuir N fontes remotas e deve permitir uso exclusivamente local, sem autenticação em Jira, Redmine ou outro provedor. O usuário poderá configurar seus próprios metadados locais.

A origem é selecionada explicitamente antes da escolha ou digitação da tarefa. O usuário confirmou que pode digitar um ID como `123456` e confirmar mesmo sem tarefa correspondente no cache. A consulta remota não bloqueia essa seleção; a escrita remota posterior pode ser rejeitada pelo provedor e deve expor o erro canônico.

Tarefas existentes no cache devem aparecer rapidamente por ID ou título. Consultas remotas acontecem em paralelo à consulta local e alimentam o cache. O comportamento deve ser compartilhado por apontamentos, calendário, timesheet, timerbar, widget, controles de addons como Discord e consumidores futuros, com core agnóstico ao provedor.

Requisito adicional confirmado pelo usuário: controlar a frequência das buscas para proteger o servidor e apresentar loading explícito, com ícones e textos relevantes. Esse controle pertence à capacidade compartilhada; não pode depender de cada tela implementar seu próprio throttle.

## Evidências da investigação inicial

- `components/task-popover.tsx` usa `value={taskId}` no campo de busca, enquanto mantém `searchQuery` separado. A digitação chama o setter de tarefa, misturando pesquisa com seleção.
- `components/addons-manager/addon-task-destination-control.tsx` fornece tarefas e callback de busca ao popover, mas não fornece `taskId`/`onTaskIdChange`. O popover pode depender do contexto opcional do tracker ou de um setter vazio. É um caminho concreto a reproduzir para o sintoma de digitação; ainda não constitui vermelho comportamental.
- O campo compacto trata Enter, mas não implementa navegação por setas nos resultados.
- Popover e modal possuem implementações separadas de consulta local e remota e classificam apenas texto numérico como ID remoto.
- O efeito remoto do popover usa `workspace?.id` mesmo quando recebeu `workspaceId` explícito. A chave de cache compacta omite a identidade do workspace/banco.
- A confirmação por Enter pode consultar um ID local sem filtrar a conexão. Com N origens, um mesmo ID precisa manter sua identidade completa.
- O helper de enriquecimento remoto grava diretamente no banco da UI e converte falha em lista vazia. A nova responsabilidade deve ficar na aplicação/runtime, preservando erros tipados.

Essas observações orientam a investigação e o desenho; os bugs a corrigir exigem reprodução determinística e vermelho antes da mudança de comportamento.

## Experiência proposta

1. Selecionar a origem `Local` ou uma conexão disponível do workspace. Nenhuma origem é adivinhada pela posição na lista. Se o apontamento já tem origem, ela é apresentada explicitamente.
2. Digitar no campo de pesquisa. Esse texto é estado próprio e não altera a referência já escolhida.
3. Exibir resultados locais por ID e título imediatamente, sem aguardar a rede. Mostrar separadamente o progresso remoto e manter os resultados locais utilizáveis.
4. Oferecer uma opção explícita `Usar ID «texto digitado» nesta origem`, inclusive se a busca estiver pendente, vazia ou com erro. Seu ID permanece opaco, sem exigir somente números nem interpretar convenções de Jira no core.
5. Selecionar um resultado ou essa opção confirma a referência e fecha o seletor. Pesquisar por título não modifica silenciosamente o apontamento. A ação de usar texto como ID fica identificada como tal.

Setas movem a opção ativa; Enter confirma a opção ativa. A opção de usar ID participa da navegação. Sem navegação/seleção ativa, Enter confirma o ID digitado quando origem e texto útil estiverem presentes. Escape fecha sem confirmar a pesquisa. Tab mantém a navegação de foco acessível. Resultados que chegam da rede não roubam o foco nem trocam a opção ativa por índice; a identidade da opção é estável.

Trocar a origem limpa pesquisa, opção ativa e referência incompatível, sem transportar atividade/status de uma origem para outra. Trocar de workspace invalida o escopo inteiro. Comentário do apontamento é preservado quando não depende da origem.

O modal avançado compartilha pesquisa, seleção e origem; continua oferecendo filtros e paginação. Uma visão agregada pode listar várias origens identificadas, mas a confirmação de um ID livre exige origem única explícita. Ao abri-lo pelo popover, preservar origem e texto.

## Referências e escrita

A referência selecionada distingue origem local de conexão remota e contém workspace e ID de domínio. Chaves compostas do storage nunca são IDs enviados ao provedor. Um resultado com detalhes e uma referência ainda não resolvida são estados distintos: não fabricar título, status ou tarefa sincronizada para representar um ID digitado.

Referências remotas não resolvidas podem compor apontamentos e destinos de addons sem consulta prévia obrigatória. Isso não significa criar uma tarefa remota: o push é o do apontamento associado à referência. Autorização, atividade e demais campos obrigatórios continuam sendo validados pelo domínio/provedor, sem inventar defaults.

Refinamento visual solicitado após uso: o histórico dessas referências sem detalhes **não compõe a listagem do popover**. Sem pesquisa, listar apenas tarefas com detalhes disponíveis. Ao digitar, oferecer uma única ação de usar o ID, com ícone e nome da origem, sem repetir um catálogo de IDs desconhecidos. Resultados e skeletons compartilham a área contida; a ação manual permanece visível durante o carregamento.

Na origem local, a referência permanece local e nunca entra em fila remota. A criação de um apontamento local sem tarefa continua possível. Digitar um ID local cria uma referência, sem cadastrar silenciosamente uma entidade tarefa completa. Um gerenciador completo de tarefas locais não faz parte desta entrega; os metadados já atendem os campos aplicáveis dos registros locais, especialmente atividades.

Decisão proposta pelo autor após revisão: referências confirmadas devem reaparecer na busca por ID, inclusive após reinício, identificadas como sem detalhes enquanto não resolvidas. São referências efetivamente usadas em apontamentos ou configurações persistidas, não todo texto pesquisado. A aplicação consulta essas referências na persistência canônica de seus donos com filtro e paginação e compõe os candidatos; não cria tarefa fictícia nem repositório paralelo de tarefas. Quando os detalhes chegarem, o candidato mantém sua identidade e é enriquecido, sem duplicação.

Escopo adotado na implementação autorizada: configurar o catálogo local e usar referências livres nos apontamentos. O gerenciador completo de tarefas locais com título/status/prioridade permanece fora desta entrega, conforme a proposta; cadastrar uma opção no catálogo não cria uma tarefa.

## Consulta compartilhada e persistência

A aplicação/runtime coordena consulta local e remota. UI apresenta estados e envia intenções; addons usam a mesma capacidade pública do core/SDK. Não criar um motor próprio de busca no Discord nem deixar o componente visual responsável por persistência.

- Consulta local filtrada e paginada no repositório canônico, com retorno dos campos necessários. Proibido carregar a coleção inteira e filtrar em memória.
- Consulta remota concorrente à local, por origem explicitamente solicitada, com limite de concorrência e paginação. Seleção com origem única consulta somente aquela conexão; busca agregada consulta as conexões explicitamente incluídas.
- O adaptador do provedor distingue suas capacidades de consulta por ID e busca textual. O core não deduz isso por expressão numérica. Para texto digitado, a intenção inclui busca textual e tentativa de resolução exata; o adaptador decide como atender sem duplicar chamadas equivalentes. Provedor sem busca textual sinaliza a limitação sem impedir ID manual.
- Persistência dos resultados remotos pelo caminho canônico do owner, respeitando alterações locais pendentes. Não sobrescrever registros locais modificados com um `bulkUpsert` indiscriminado.
- Deduplicação pela identidade de origem e ID, com contexto de workspace; mesmo ID em conexões distintas representa tarefas distintas.
- Chaves de consulta incluem workspace, origem, texto, filtros e paginação. Respostas antigas não substituem resultados de outra pesquisa ou workspace. Cancelar quando o transporte permitir e descartar resposta obsoleta no consumidor.
- Falhas por origem ficam visíveis separadamente, com `Either<AppError, T>` e details estruturados. Uma conexão com falha não remove resultados válidos das demais. Tentar novamente deve ser possível; falha não pode ficar memorizada como busca concluída para sempre.
- Nenhum timer artificial para sincronização. O controle temporal legítimo de frequência de rede descrito abaixo não serve como mecanismo de consistência e nunca atrasa a consulta local ou a confirmação de ID.

## Controle de frequência e estados visíveis

Decisão técnica proposta: throttle com execução trailing, mantendo apenas a intenção mais recente. Como política inicial de busca interativa, intervalo mínimo de 400 ms entre inícios de consultas remotas do mesmo escopo de conexão; uma política declarada pelo provedor ou um bloqueio do servidor pode exigir um intervalo maior. Esse número é uma decisão inicial do autor a validar, não uma garantia de compatibilidade com todo servidor.

O limite é coordenado pelo owner/runtime e compartilhado entre modal, popover, widget e addons. A chave de coordenação deve corresponder ao escopo real de rate limit do provedor: conexões que compartilhem credenciais/instalação precisam compartilhar o orçamento quando aplicável. O core recebe essa capacidade/política do adaptador, sem conhecer regras de Jira ou Redmine nem expor credenciais.

Decisão de implementação para manter simplicidade e proteger inclusive fontes com credenciais compartilhadas: orçamento global conservador, com intervalo mínimo de 400 ms entre inícios e no máximo três operações simultâneas. Cada consumidor mantém apenas sua intenção pendente mais recente, sem cancelar consultas necessárias a outro consumidor. `Retry-After` bloqueia novos inícios no orçamento compartilhado. Não é necessário identificar ou comparar segredos para compartilhar o limite.

- No máximo uma consulta de lookup em execução por escopo de limite; enquanto ela estiver em andamento, substituir a intenção pendente pelo texto mais recente, sem enfileirar todos os prefixos digitados.
- Resolução por ID e busca textual pertencem à mesma operação lógica e compartilham orçamento de transporte, inclusive se o adaptador precisar de mais de uma chamada HTTP. Paginação também respeita esse orçamento.
- Requisições equivalentes em andamento são compartilhadas por seus consumidores. Resultados remotos recentes podem ser reutilizados com política explícita de validade, a definir no plano conforme a infraestrutura existente; presença de tarefa no cache não impede renovação remota quando necessária.
- Intenções vazias, consumidores fechados e gerações de pesquisa substituídas não iniciam requisições. Um consumidor se desligar não cancela uma requisição ainda necessária a outro. Resposta obsoleta pode enriquecer o cache do seu escopo, mas não substituir a pesquisa ativa nem escrever em outro workspace.
- HTTP 429 mantém o status e os detalhes canônicos e respeita `Retry-After` válido. Durante o bloqueio, nenhuma interação de lookup contorna o limite. Sem instrução válida do servidor, aplicar a política explícita e limitada do transporte; não repetir indefinidamente nem fazer retry imediato por tecla.
- Falha de autenticação exige ação do usuário e não provoca repetição automática. Offline mantém a operação local e expõe a indisponibilidade remota. O botão de tentar novamente também respeita orçamento e bloqueio.

Estados visuais são derivados do estado tipado da operação, com mensagens por origem quando houver busca agregada:

| Estado | Apresentação proposta |
| --- | --- |
| Consulta local inicial pendente | Skeleton apenas na área que ainda não tem dados e texto acessível de carregamento. |
| Intenção aguardando liberação do throttle | Ícone de relógio e `Aguardando para buscar em «origem»…`. |
| Consulta remota em execução | Spinner e `Buscando em «origem»…`, sem esconder candidatos locais. |
| Consulta remota concluída | Ícone de confirmação e `Busca atualizada em «origem»`; distinguir tarefa confirmada pelo provedor de ID ainda sem detalhes. |
| Sem correspondências | `Nenhuma tarefa encontrada em «origem»` e opção de usar o ID digitado. Só exibir após a consulta relevante concluir. |
| Offline | Ícone de conexão indisponível e `Sem conexão. Exibindo dados locais.` |
| Rate limit | Ícone de relógio/alerta e `Limite de consultas em «origem». Aguardando liberação.`; informar horário de liberação quando conhecido, sem countdown que reanuncie a cada segundo. |
| Erro remoto | Ícone de alerta, identificação da origem, erro canônico e ação de retry quando aplicável. |

Usar região de status acessível com anúncios moderados; cor sozinha não comunica estado. Resultados e opção de ID manual permanecem disponíveis durante espera, rede, erro e bloqueio. Não usar toast por tecla ou substituir a lista inteira por spinner em cada atualização. Falha remota não deve aparecer como ausência de tarefa ou falha de gravação de um apontamento ainda não enviado.

## Metadados locais por workspace

Decisão proposta: nova aba `Metadados locais` nas configurações do workspace. Sua localização exata segue a navegação existente. Pode coexistir com conexões remotas; não exige login nem addon instalado.

Usar as categorias do contrato canônico existente: status de tarefas, prioridades, atividades, tipos/status de rastreamento, papéis de participantes e tipos de estimativa. A interface usa os nomes semânticos já adotados no produto. Permitir criar, renomear, configurar ícone/cores e remover itens sem uso; não criar categorias dinâmicas arbitrárias nesta entrega.

IDs estáveis e persistidos, nomes úteis e regras explícitas de duplicidade por categoria/workspace. Remoção de item referenciado exige substituição explícita compatível ou é rejeitada com explicação estruturada; nunca deixar referência quebrada. Nenhuma categoria ganha um primeiro item selecionado automaticamente.

Reutilizar entidade/repositório canônico de metadados, evoluindo seu escopo para representar origem local sem conexão falsa ou credenciais fictícias. Persistência pelo owner/runtime e atualizações reativas compartilhadas entre janelas. Não persistir esse catálogo somente em localStorage e não criar repositórios paralelos por consumidor.

Metadados locais aplicam-se à origem Local. Não alteram os IDs ou as opções aceitas por Jira/Redmine; personalização visual de metadados remotos existente permanece uma responsabilidade distinta. O catálogo suporta as categorias existentes, mas não adiciona novos campos a formulários que hoje não os oferecem.

## Validação e conclusão

Antes de corrigir busca/teclado, reproduzir por E2E determinístico a digitação no destino de addon e os caminhos afetados do popover. Comprovar vermelho pelo comportamento esperado, não por seletor/infraestrutura.

Cobrir seleção por clique e teclado, ID remoto inexistente no cache, IDs numéricos e opacos, pesquisa por título, resultado local disponível com rede bloqueada, resposta remota enriquecendo cache, erro em uma origem, retry, IDs iguais em duas origens, troca de origem/workspace e respostas fora de ordem. Conferir que digitar não altera o apontamento antes de confirmar e que ID manual chega puro à camada de push.

Verificar throttle com relógio controlado nos testes da aplicação: rajada de teclas mantém apenas a intenção mais recente, intervalo mínimo é respeitado, consumidores compartilham chamada, erro permite retry sem furar limite, 429 bloqueia até a liberação e não há requisição tardia após fechar/trocar escopo. E2E deve conferir estados visuais e manter resultado local/ID manual utilizáveis durante uma resposta remota controlada, sem sleeps artificiais.

Cobrir workspace sem conexões, CRUD dos metadados locais, referências em uso, persistência após reinício e atualização entre janelas. Exercitar integração nas entradas de tempo, timerbar/widget e destino de addon; contratos e testes do SDK devem demonstrar comportamento equivalente para consumidores futuros.

Respeitar integralmente AGENTS. Durante a implementação, executar testes dirigidos; depois do escopo integral, `yarn typecheck` e `yarn lint:fix` na raiz de metric, resolver resultados e obter revisão independente do conjunto. Bugs de sincronização/idempotência que surgirem seguem o checklist e auditor próprios. Sem compatibilidade legada, exclusão de dados do usuário, push ou publicação nesta aprovação de desenho.

Limites: fixtures locais não demonstram OAuth, permissões ou comportamento do servidor real. Validação dirigida com os addons existentes é necessária; ausência de tarefa no cache não garante aceitação remota. Antes de executar operações em serviços reais, observar a autorização explícita exigida por AGENTS.
