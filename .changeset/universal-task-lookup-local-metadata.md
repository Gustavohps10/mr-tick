---
'@mr-tick/sdk': minor
'@mr-tick/application': minor
'@mr-tick/ui': minor
'@mr-tick/desktop': minor
'@mr-tick/datasource-fake': patch
---

Adiciona busca universal de tarefas com pesquisa local imediata, consulta remota compartilhada e limitada, persistência pelo owner, navegação por teclado e confirmação de IDs ainda sem detalhes no cache. Expõe busca explícita e leitura de metadados locais no SDK, e integra o comportamento às entradas de tempo, timerbar, widget e seletores de addons.

Adiciona catálogo de metadados locais por workspace, com edição de nomes, ícones e cores, proteção de revisões concorrentes e rejeição de remoção de itens em uso. Amplia o datasource fake e os testes para validar digitação, loading, limites de rede e IDs manuais.

Mantém o popover compacto: referências de apontamentos sem detalhes não compõem a lista de tarefas. A confirmação do ID digitado aparece como uma única ação com ícone da origem, preservando sua visibilidade durante o loading.
