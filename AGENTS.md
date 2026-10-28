# Padrões de Código e Restrições de Tipagem

Ao escrever ou modificar código neste projeto, você DEVE seguir rigorosamente estas regras (sem exceções):

1. **Tipagem Estrita Absoluta**: NUNCA utilize `any` ou `unknown` em código de produção. O projeto adota tipagem forte e precisa em todos os locais de produção. Em mocks de testes unitários e E2E, o uso de `as unknown as` é permitido para criação de test doubles/mocks parciais sem exigir implementação integral de interfaces extensas.
2. **Sem Type Casting e Assertions Forçadas**: NÃO utilize gambiarras com type casting (`as`, `satisfies`) nem construções acrobáticas de tipos forçados em código de produção. A lógica, interfaces e contratos de produção devem ser exportados e tipados de forma limpa para garantir que os tipos fluam naturalmente sem coerção. Em mocks de testes unitários e E2E, o uso de `as` é permitido para tipagem de doubles e mocks de teste conforme autorização do usuário.
3. **Nomenclatura Limpa**: NÃO utilize prefixos em variáveis ou parâmetros (ex: NUNCA use `_` como prefixo, como `_event` ou `_req`). Siga a nomenclatura limpa.
4. **Sem Timers Artificiais**: NUNCA utilize "gambiarras" com `setTimeout`, delays ou timeouts artificiais para tentar resolver problemas de concorrência ou espera.
5. **Sem Gambiarras**: O código gerado deve sempre respeitar a arquitetura existente. Se uma tipagem não encaixa, corrija as interfaces em vez de forçar o tipo.
6. **Sem Adivinhações de Chaves/IDs (No Hardcoding/Guessing)**: O código não deve "presumir" o nome de chaves, IDs de abas ou propriedades criadas pelo usuário (por exemplo, buscando via `includes('credentials')` ou `id === 'auth'`). Renderize e processe os dados de forma dinâmica e agnóstica para permitir que os addons e usuários montem as estruturas livremente.
7. **Compatibilidade PowerShell (Windows)**: NUNCA utilize `&&` para encadear comandos no shell. Utilize sempre `;` como separador de instruções no PowerShell.
8. **Arquitetura de Domínio e Hydrate**: O domínio abriga as entidades, suas regras e controle de estado. O método `hydrate` deve ser usado EXCLUSIVAMENTE em Repositórios/Providers para restaurar dados salvos no banco/provedor para a entidade em memória sem repassar por métodos de validação. NUNCA utilize `hydrate` em Services. Em Services, você deve obter, manipular e salvar usando os métodos de domínio e instâncias criadas normalmente (ex: via `.create`).
9. **Sem Fallbacks Ocultos ou "Burros" (Proibição de `||`, `??` ou operadores ternarios ? : Cegos)**: JAMAIS utilize lógicas de fallback com `||` ou `??` ou ? : para mascarar valores ausentes ou adivinhar defaults (ex: `data?.task?.id ?? original.task?.id ?? ''`, `tempData || {}`). O operador `??` só deve ser utilizado em casos extremos onde um valor padrão é estritamente especificado pela regra de negócio. Se um valor é opcional ou tem lógica de geração, seja explícito: utilize guard clauses com `if`, trate casos ausentes de forma transparente e falhe rápido em vez de maquiar dados.
10. **Sem Assunção Cega de Índices de Coleção (`[0]`)**: NUNCA assuma o primeiro elemento de um array como fallback de preenchimento automático (ex: `activities[0]?.id` ou `connections[0]`). Se o dado não foi explicitamente selecionado pelo usuário ou retornado pelo backend, mantenha o estado limpo/ausente e exija a seleção explícita.
11. **Sem Remendos em Código Defeituoso (Refatoração Limpa Ativa)**: NUNCA tente colocar "band-aid" ou remendar lógicas tortas existentes. Se identificar que um fluxo está arquiteturalmente errado, remova a gambiarra e arquitete a solução da forma correta, mais escalável, robusta e performática possível (nível Senior PRO).
12. **Contratos e Ciclo de Vida de Negócio Ponta a Ponta**: Ao criar ou alterar entidades, serviços ou mutações, assegure que TODOS os campos de negócio (ex: tarefas, atividades, comentários, durações, conexões) tenham seu ciclo de vida completo tratado. Devem existir métodos de domínio correspondentes, testes unitários, validações e persistência em todas as camadas (UI -> Local DB -> Push Service -> Remote Provider). NUNCA silencie ou omita a gravação de campos existentes.
13. **Isolamento de Identificadores (Sem Contaminação de Chaves Compostas)**: Chaves compostas locais (como `${connectionInstanceId}::${sourceId}`) pertencem exclusivamente ao schema e indexação do banco local (RxDB). NUNCA envie chaves compostas para chamadas de API, DTOs de push remoto ou entidades de domínio que esperam o identificador puro da entidade de origem (`sourceId`). Sanitize e isole os identificadores na borda.
14. **Early Return Obrigatório (Sem `else` / `else if`)**: NUNCA utilize `else` ou `else if`. Sempre utilize early return para sair rápido de funções, guard clauses e fluxos condicionais. Se encontrar código fora do escopo da sua tarefa com o padrão antigo contendo `else`, mantenha como está; em qualquer código novo ou do escopo trabalhado, aplique early return rigorosamente.
15. **Switch Cases Elegantes para Mapeamentos**: Utilize `switch/case` quando necessário para mapeamento de constantes, enums ou múltiplos estados de forma elegante e limpa como Senior PRO.
16. **Ifs Simples Sem Chaves Desnecessárias**: Em `if`s simples com apenas uma instrução, evite o uso de chaves `{}` desnecessárias. Exemplo incorreto: `if (condicao) { minhalogica() }`. Exemplo correto: `if (condicao) minhalogica()`.
17. **Mensagens de Erro Transparentes do Servidor**: No tratamento de erros vindos do servidor ou provedor remoto, exiba exatamente a mensagem ou chave original recebida (`messageKey`, `message`, `details`) sem tentar converter, traduzir ou mascarar. Se vier somente uma key (ex: `TEMPO_INCONSISTENTE`), exiba a key diretamente como string.
18. **Typecheck Sempre na Raiz**: SEMPRE execute a verificação de tipos na raiz do monorepo (`metric`) utilizando `yarn typecheck` (que dispara o pipeline do Turborepo para todos os pacotes e aplicações). NUNCA assuma que checar apenas um subdiretório é suficiente.
19. **Tratamento Funcional de Erros com Either (Proibição de Exceptions e String Matching de Erro)**: O projeto NÃO trabalha com exceptions (`throw`) para controle de fluxo nem captura genérica de erros com `try/catch` para tentar inferir tipos (ex: NUNCA faça `if (error instanceof AppError)` nem `error.message.includes('401')`). Erros de rede, requisições externas e integrações com provedores DEVEM ser capturados e encapsulados no nível mais baixo possível (na camada de transporte / HTTP Client / Provider) e convertidos imediatamente em instâncias de `Either<AppError, T>`. As camadas superiores (Services, Use Cases) devem operar exclusivamente sobre `Either` com verificação de status (`result.isFailure()`), repassando falhas via `forwardFailure()` ou tratando `failure.statusCode` de forma determinística e tipada.
20. **Comunicação Ativa e Correção na Raiz de Falhas Arquiteturais**: Ao identificar falhas graves de arquitetura, incompatibilidades estruturais de contratos ou incoerências conceituais (como métodos artificiais inseridos fora de seus contratos para contornar problemas de tipagem ou fluxo), NUNCA aplique gambiarras ou desvios provisórios. Corrija o problema diretamente na raiz (nas interfaces, contratos de domínio e camada de transporte corretas). Sempre informe explicitamente o usuário ao identificar falhas arquiteturais desse porte, apresentando a causa raiz e o plano estrutural antes de avançar.
21. **Continuidade Otimista de UI e Transição Atômica de Rascunhos (Prevenção de Flickering e Gaps de DOM)**: Em interfaces reativas com tabelas e listas locais (RxDB / TanStack Query):

- **Identificadores Estáveis desde o Rascunho**: Drafts (rascunhos em memória) DEVEM nascer com identificadores UUID definitivos (`crypto.randomUUID()`) e a flag `isDraft: true`. Ao persistir o rascunho, o `id` DEVE ser mantido idêntico para garantir que a reconciliação do React DOM reutilize o mesmo nó sem desmontar/remontar a linha (`unmount -> mount`).
  - **Transição Atômica sem Gaps Temporais**: NUNCA remova um rascunho do estado local (`setDraftEntries`) antes que o registro salvo já esteja presente no cache da query (`queryClient.setQueriesData`). A injeção da nova entidade persistida no cache DEVE preceder ou ocorrer atomicamente com a remoção do rascunho para que a linha nunca desapareça por nenhum frame ("some e volta").
  - **Sem Invalidações Redundantes Agressivas sobre Observables**: Quando houver uma subscription reativa contínua do banco local (ex: RxDB `rxQuery.$`), NUNCA dispare `invalidateQueries({ refetchType: 'all' })` em mutações rotineiras de criação/edição. Atualize o cache otimisticamente e deixe o stream do banco sincronizar a coleção sem forçar múltiplos refetches concorrentes que causam oscilação de estados de fetching.
  - **Expansão Síncrona no Frame Zero**: Estados de expansão de grupos e sublinhas (ex: tickets) DEVEM ser avaliados de forma síncrona no momento da renderização (ou controlando explicitamente apenas o conjunto de itens fechados `collapsedGroups`). NUNCA utilize `useEffect` pós-render para descobrir e abrir novos grupos, pois isso força um frame de grupo fechado seguido de re-render para abrir (glitch visual).
  - **Estabilidade Posicional**: Rascunhos e registros em edição devem seguir ordenação natural por data/horário coerente (`startDate DESC`). NUNCA force rascunhos para o rodapé da lista caso possuam horário definido, prevenindo saltos físicos de posição na tabela após o salvamento.

22. **Isolamento de Wizards e Modais de Criação (Sem Contaminação de Contexto Global Ativo)**:

- **Sem Consumo Cego do Contexto Global**: Modais e wizards de criação de recursos NUNCA devem inicializar formulários ou estados padrão a partir de hooks de contexto global (ex: `useWorkspace()`) que representem a entidade ativa em segundo plano na tela. Se o usuário está criando um novo item, o formulário deve nascer completamente limpo e agnóstico da rota ativa.
  - **Transição Tardia de Ativação**: A troca ou navegação para o novo recurso só deve ocorrer na conclusão explícita do wizard (ex: no botão "Finalizar" da última etapa). NUNCA altere o ID do recurso ativo globalmente durante etapas intermediárias (Step 1 -> Step 2), pois isso afeta os providers da aplicação em background, altera flags como `isLoading`, provoca desmontagem de componentes e gera recarregamento ou fechamento involuntário do modal ("flicker" de reabertura).
  - **Escopo Estrito em Operações Intermediárias**: Chamadas de API para vincular dados, instâncias ou plugins dentro do wizard DEVEM receber explicitamente o identificador da entidade sob criação do wizard, NUNCA herdando contextos de dados conectados à entidade ativa na tela.

23. **Comandos de Lint Sempre com Fix na Raiz**: NUNCA execute comandos de verificação pura de lint (como `yarn lint` ou `eslint`). Quando precisar verificar ou corrigir linter, execute SEMPRE `yarn lint:fix` na raiz do monorepo.
24. **Toolkit Oficial no SDK e Proibição de Scripts Ad-Hoc em Addons**: NUNCA crie scripts auxiliares ou ad-hoc (como arquivos `.js` soltos em diretórios de plugins/addons) para contornar limitações de empacotamento, versionamento, sincronização de manifestos ou pipelines. O SDK (`@mr-tick/sdk`) é o toolkit oficial e deve cobrir nativamente 100% das necessidades do desenvolvedor de addons. Ao identificar qualquer lacuna arquitetural ou deficiência no ferramental, NUNCA crie gambiarras ou desvios no addon: pare, explique a lógica e a causa raiz ao usuário antes de qualquer código, e resolva diretamente na raiz (evoluindo o SDK no monorepo, publicando a nova versão e consumindo-a de forma limpa e canônica).
25. **Confirmação Prévia Obrigatória para Ações Críticas**: Para quaisquer comandos ou operações com impacto crítico — tais como `git push`, envio de requisições de escrita para APIs remotas/produção, comandos SQL destrutivos (`DELETE`, `DROP`, `TRUNCATE`), deleção em massa de arquivos/diretórios, `git merge`, `git reset --hard` ou operações que afetem branches principais/remotas — você DEVE SEMPRE solicitar confirmação explícita do usuário antes de rodar, explicando o que será executado e o impacto. NUNCA execute ações críticas de forma autônoma sem a aprovação prévia do usuário.
26. **Git Pull Obrigatório Antes de Codificar**: SEMPRE antes de iniciar qualquer desenvolvimento, escrita de código, criação de branches ou modificação de arquivos em qualquer repositório (seja no monorepo, em plugins/addons ou submódulos), execute `git pull` para sincronizar a branch local com a remota. Isso previne atritos, desvios e conflitos com commits automáticos de pipelines de CI/CD (como releases de versionamento e atualizações de manifesto) ou commits de outros contribuidores.
27. **Proibição de Bump Manual de Versão (Versionamento Exclusivo via Changesets e CI/CD)**: NUNCA altere manualmente os campos `version` em arquivos `package.json` ou `manifest.yaml` nem edite `CHANGELOG.md` manualmente. O versionamento de todos os pacotes e aplicações do monorepo é 100% automatizado pelo bot de CI/CD conforme documentado em `GITFLOW.md`. Desenvolvedores e agentes devem EXCLUSIVAMENTE criar arquivos de changeset (bump files) no diretório `.changeset/` (ex: `.changeset/<nome-descritivo>.md`) especificando os pacotes afetados (`@mr-tick/sdk`, `@mr-tick/desktop`, etc.) e o nível semântico (`patch`, `minor`, `major`), deixando o cálculo e publicação para a pipeline oficial.
28. **Padronização de Largura, Dimensionamento, Scroll e Skeletons de Modais Shadcn UI (Prevenção de Overflow, Estrangulamento e Layout Shifts)**:

- **Largura Proporcional e Responsiva**: Modais de configuração, listagens densas, mapeamentos ou formulários com seletores ricos (ícones, paletas de cores, botões de ação) NUNCA devem utilizar larguras subdimensionadas (como `sm:max-w-md` ou `sm:max-w-lg` que sufocam o conteúdo e provocam vazamento horizontal). Utilize a escala padrão recomendada de UI: `w-[95vw] max-w-3xl sm:max-w-3xl` para modais de densidade média, ou `w-[95vw] max-w-4xl sm:max-w-4xl` para modais ricos de mapeamento/configurações, e `max-w-6xl` para visualizações complexas/tabelas.
  - **Arquitetura de Layout Tripartido e Contenção Estrita (`p-0 gap-0`)**:
    - O `DialogContent` DEVE conter `overflow-hidden flex flex-col min-w-0 max-h-[85vh] p-0 gap-0` para isolar cabeçalho, corpo e rodapé em blocos estanques sem paddings externos conflitantes.
    - `DialogHeader`: DEVE conter `shrink-0 border-b px-6 py-4` (com `pr-8` para prevenir colisão com o botão de fechar `X`).
    - Corpo Rolável: DEVE conter `min-h-0 flex-1 overflow-y-auto px-6 py-4`, garantindo rolagem nativa suave, confinada estritamente entre o header e o footer.
    - `DialogFooter`: DEVE conter `shrink-0 border-t bg-muted/20 px-6 py-3 flex items-center justify-end gap-2` com fundo opaco, impedindo que elementos rolados passem de forma transparente por baixo dos botões ou colidam com as ações.
  - **Flexibilidade Horizontal**: Em linhas com layout `flex items-center justify-between`, envolva textos e descrições com `min-w-0 flex-1 truncate` e seletores fixos (botões, ícones, paletas) com `shrink-0`.
  - **Prevenção de Scroll Duplo e Alturas Rígidas**: NUNCA utilize alturas estáticas ou arbitrárias em vh no elemento rolável interno (como `max-h-[60vh]` ou `h-[500px]`), pois isso quebra a responsividade vertical em telas menores (notebooks/split screen).
  - **Skeletons Obrigatórios em Estados Assíncronos via TanStack Query (`queryClient`)**:
    - Sempre que um modal depender de dados remotos carregados via `useQuery`, desestruture `isLoading` e exiba OBRIGATORIAMENTE componentes `<Skeleton />` estruturados espelhando as sessões, títulos, botões e cards do modal.
    - NUNCA renderize mensagens de lista vazia (ex: "Nenhum campo requer mapeamento") enquanto a consulta assíncrona estiver pendente (`isLoading: true`), evitando falsos negativos e flashes visuais bruscos (glitches) na interface.

29. **Restrições de Arredondamento de Bordas (Border Radius Máximo `-lg`)**:

- NUNCA utilize classes de arredondamento superiores a `rounded-lg` (como `rounded-xl`, `rounded-3xl` ou `rounded-full`, exceto quando estritamente aplicável a avatares circulares ou status dots puramente esféricos de tamanho 1:1).
  - Para containers, cards, barras e painéis, priorize `rounded-lg` ou `rounded-md`. Utilize `rounded-xl` somente quando estritamente necessário para superfícies flutuantes ou modais destacados.

30. **Estratégia de Commits Consolidados por Bloco de Entrega (Proibição de Micro-Commits Fragmentados)**:

- NUNCA crie commits isolados para cada alteração pontual, ajuste cosmético ou linha modificada durante o desenvolvimento.
  - Agrupe modificações relacionadas e valide o conjunto completo (código, testes unitários, linter e typecheck na raiz).
  - Realize commits coesos e consolidados que representem uma etapa completa de trabalho, uma funcionalidade inteira ou um pacote de correções em conjunto, mantendo o histórico do Git limpo, rastreável e sem poluição de micro-commits desnecessários.

31. **Injeção Estrita de Dependências em IoC (Proibição de `?:`)**:

- NUNCA declare parâmetros de construtor como opcionais (`?:`) em classes gerenciadas por IoC/DI (Services, Use Cases, Handlers, Repositories).
- Toda dependência que a classe necessita para operar deve ser declarada como obrigatória e sem `?:`.
- O uso de `?:` mascara falhas de registro no container de IoC e força o espalhamento de verificações nulas (`if (this.dep) ...`) no meio da regra de negócio. Se um comportamento for opcional para certos cenários (ex: testes ou modo headless), utilize o padrão Null Object (`NoOp`) registrado no container, garantindo determinismo total do grafo de dependências.

32. **Validações Simples e Semânticas em TypeScript (Princípio da Menor Verificação Correta)**:

- Produza código TypeScript limpo, conciso e idiomático, confiando nos contratos tipados e evitando validações redundantes ou defensivas especulativas. Utilize a verificação mais simples que preserve a semântica do domínio.
- NUNCA utilize `typeof` redundante em propriedades que já possuem contrato tipado confiável no TypeScript (ex: `typeof input.maxDevices === 'number'`). Se o campo é opcional, verifique presença com `if (input.maxDevices !== undefined)` para números/booleanos (preservando `0` e `false`), ou `const key = input.encryptedActivationKey?.trim(); if (key) { ... }` para strings úteis.
- Restrinja `typeof` estritamente a cenários que demandam distinção em runtime: type guards canônicos de baixo nível (`isRecord`, `isString`), narrowing de uniões primitivas genéricas (`string | number`) e tratamento de erros ou dados externos desconhecidos (`unknown`) nas bordas do sistema.

33. **Proibição Geral de Compatibilidade com Dados e Contratos Legados**:

- NUNCA manter compatibilidade com dados, bases, configurações, credenciais ou contratos antigos na máquina do usuário.
- O código deve remover suporte legado e implementar diretamente a arquitetura canônica adequada.
- A autenticação não precisa devolver `member` se desnecessário.
- Os identificadores (IDs) devem seguir estritamente o domínio/provedor sem conversões artificiais string/int motivadas por legado.
- O usuário é o único responsável pelo descarte/limpeza de bases antigas; o código não deve executar rotinas de destruição/reset cego de dados do usuário.

34. **Proibição Terminante de SELECT * e Carregamento Total para Filtragem em Memória**:

- É terminantemente PROIBIDO carregar todos os dados ou coleções inteiras na memória (equivalente a `SELECT *`) para posteriormente filtrar, buscar ou projetar dados na camada de aplicação.
- Repositórios devem expor APENAS operações básicas, coesas e estritamente tipadas (`getById`, `remove`, `list` com filtros explícitos no contrato e retorno restrito aos campos necessários, com paginação quando aplicável).
- São proibidos métodos ad-hoc ou gambiarras criados sob medida para conveniência de consumidores específicos.
- A orquestração e regras de negócio devem residir fora do repositório, preservando integralmente a atomicidade, isolamento, journal e rotinas de retry.

35. **Um Repositório por Classe de Domínio**:

- É terminantemente PROIBIDO criar múltiplos repositórios ou classes de repositório paralelas para uma mesma entidade de domínio.
- Toda e qualquer estratégia interna de persistência (particionamento, índices, arquivos auxiliares, cache ou sharding) deve ser encapsulada estritamente dentro do repositório canônico existente daquela entidade (ex: `JSONWorkspacesRepository`).
- NUNCA crie novos repositórios, aliases paralelos ou camadas desnecessárias para contornar ou alterar estratégias de armazenamento.

36. **Fluxos distintos para correção de bug e refatoração arquitetural**:

- Para bug de comportamento confirmado, registrar o cenário, produzir teste determinístico vermelho pela falha esperada, corrigir na camada responsável, obter verde e revisar. Não confundir falha de infraestrutura com evidência vermelha.
- Para refatoração arquitetural aprovada, implementar todo o escopo ponta a ponta, incluindo consumidores e addons afetados, e testar as partes conforme avançar. Os blocos do plano são marcos de organização, não encerramentos independentes. Não exigir vermelho artificial por mudança estrutural.
- Somente após a implementação integral da refatoração, executar `yarn typecheck` e `yarn lint:fix` na raiz de `metric`, corrigir os resultados e então solicitar revisão final do Tech Lead. As regras 18 e 23 definem onde executar os comandos, não exigem executá-los após cada bloco parcial.
- Se surgir um bug concreto durante a refatoração, tratá-lo separadamente pelo ciclo vermelho → correção → verde. Não marcar a refatoração concluída nem chamar o Tech Lead antes de implementar e validar o conjunto aprovado.

37. **Responsabilidade Única e Contrato Próprio dos Repositórios**:

- Cada repositório implementa somente o contrato de persistência da sua entidade, sem estender contratos de lifecycle, cofre ou registro de credenciais. Herança de `BaseRepository` é permitida quando já integra o padrão do projeto e não mistura responsabilidades.
- O repositório de workspace busca, grava, atualiza e remove os seus dados; usa transações e constraints para consistência da própria persistência. Não coordena escrita, limpeza, recuperação ou fases do cofre.
- Services de application orquestram os métodos de domínio, o repositório e o cofre por dependências independentes. Se uma operação entre banco e cofre precisar de registro recuperável, persista a operação fora do repositório de workspace com o mínimo de contrato e campos justificados por cenários concretos.
- Não crie repositórios paralelos para a mesma entidade, herança artificial, métodos ad-hoc ou protocolo genérico para contornar a separação das camadas.

### Exemplos da regra 37: repositório pequeno, service coordenando o fluxo

**Correto — um contrato por entidade, com operações de persistência somente daquela entidade:**

```ts
interface IWorkspacesRepository {
  create(workspace: Workspace): Promise<Either<AppError, void>>
  getById(id: string): Promise<Either<AppError, Workspace | undefined>>
  list(
    filter: WorkspaceFilter,
    page: Page,
  ): Promise<Either<AppError, PagedWorkspaces>>
  update(workspace: Workspace): Promise<Either<AppError, void>>
  remove(id: string): Promise<Either<AppError, void>>
}
```

Os nomes e tipos acima são ilustrativos: usar os tipos e pastas do projeto; a fronteira de transação deve ser uma capacidade específica da infraestrutura, sem framework genérico. `list` filtra e pagina no banco; não carrega todos os workspaces para filtrar no service. `update` persiste a entidade recebida, sem decidir regras de negócio nem disparar outro componente. O repositório pode executar SQL, mapear linhas, aplicar constraints e participar de uma transação do banco. Ele não abre uma operação de negócio que também governa cofre ou Blob Storage.

**Errado — responsabilidades estranhas ao repositório de workspace:**

```ts
interface IWorkspacesRepository {
  beginLifecycle(operation: WorkspaceLifecycleOperation): Promise<void>
  advanceLifecycle(operationId: string, phase: LifecyclePhase): Promise<void>
  saveCredential(workspaceId: string, token: string): Promise<void>
  uploadAvatar(workspaceId: string, bytes: Uint8Array): Promise<void>
  recoverPendingVaultWrites(): Promise<void>
}
```

Esses métodos coordenam processos, segredos ou armazenamento externo; não são `create/get/list/update/remove` de `Workspace`. Também é errado implementar `IWorkspacesRepository` junto com interfaces de cofre, registro de credenciais ou lifecycle na mesma classe. Não criar métodos ad-hoc por consumidor para esconder essa lógica.

**Correto — fluxo no service, usando componentes independentes:**

1. O handler chama o service com dados tipados. O service carrega a entidade pelo repositório e chama seus métodos de domínio para decidir a mudança.
2. O service delimita a transação de banco por uma capacidade específica da infraestrutura para persistir os metadados pelo repositório. O repositório executa apenas a escrita da entidade nessa transação.
3. Depois, o service tenta gravar o arquivo no Blob Storage ou a credencial no cofre por outro adapter. Nenhuma transação SQLite torna essa chamada externa atômica.
4. Se a chamada externa falhar, o service decide e executa a compensação ou recuperação definida para esse caso. O repositório apenas persiste o estado solicitado; eventual registro recuperável da operação externa tem responsabilidade e contrato próprios, fora do repositório de workspace, e só existe quando um cenário concreto o exigir.

Exemplo: alterar o avatar não autoriza `workspaceRepository.uploadAvatar(...)`. O domínio valida a mudança; o service coordena `workspacesRepository.update(...)` e `blobStorage.put(...)`, trata falha entre essas etapas e mantém os metadados coerentes. Seguir rigorosamente as classes, contratos e pastas existentes; não introduzir `BaseRepository`, Unit of Work, saga, framework ou camada nova apenas para acomodar o exemplo. `BaseRepository` é exceção somente se já for padrão real do projeto.

38. **Espaçamento e Respiração de Código (Proibição de Código Colado)**:
    - Ao escrever ou modificar código em qualquer arquivo do ecossistema, NUNCA deixe declarações, estruturas de controle e blocos colados uns aos outros sem respiração visual.
    - **Pulo de 1 Linha Obrigatório**: Sempre pule 1 linha elegantemente antes e depois de blocos como `switch`, `if` (com corpo em bloco multilinhas ou chaves `{ ... }`), laços de repetição (`for`, `while`), blocos `try/catch` e declarações de classes ou métodos.
    - **Escopos Simples sem Pulo Forçado**: Deixe sem pulo de linha APENAS guard clauses ou escopos simples e diretos de 1 linha que façam sentido visual contínuo em sequência (exemplo: `if (!siteUrl) return ...` seguido imediatamente de `if (!token) return ...`).
    - Métodos de classes e declarações de exportação de topo devem sempre ter 1 linha em branco de respiro entre si. O código deve priorizar ritmo de leitura, legibilidade e elegância visual, evitando aglomerações.

39. **Proibição de Imports Inline dentro de Funções ou Tipos (`import('...')`)**:
    - NUNCA utilize importações dinâmicas inline de tipos (como `import('@mr-tick/sdk').MetadataDTO`) dentro de generics, assinaturas de métodos ou no corpo de funções.
    - Todos os tipos, contratos, DTOs e utilitários necessários DEVEM ser importados explicitamente no topo do arquivo via declaração de cabeçalho (`import { type MetadataDTO } from '@mr-tick/sdk'`).
