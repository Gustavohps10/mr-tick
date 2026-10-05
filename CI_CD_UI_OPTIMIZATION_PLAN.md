# Plano de otimização de UI e CI/CD

Atualizado em 2026-10-05 com a implementação de UI aplicada localmente. Mantido um único pacote; otimização de E2E permanece para a próxima etapa. As medições das primeiras rodadas abaixo são histórico dos protótipos.

## Decisão de organização

Manter um único pacote `@mr-tick/ui`, com exports explícitos `./button`, `./card`, `./popover`, `./providers`, `./pages` e os demais subpaths necessários. Não declarar export `.`. Os nomes públicos não exigem que a estrutura física interna tenha o mesmo formato.

`import { Button } from '@mr-tick/ui/button'` permanece totalmente tipado. Subpaths são independentes dos limites das tarefas do Turbo: vários exports podem compartilhar uma tarefa, e várias tarefas podem pertencer ao mesmo pacote.

A melhor alternativa inicial medida foi uma emissão de declarações pelo TypeScript, com JavaScript gerado em um único grafo de módulos compartilhados e múltiplas entradas públicas. A divisão fina de cache é tecnicamente possível, mas o protótipo por grupos teve maior custo frio e revelou riscos que precisam ser tratados antes da adoção.

## Primeira rodada: medições locais

Node 24.0.2, tsup 8.5.1 e compilador TypeScript instalado no projeto. Dependências já instaladas e outputs de dependências disponíveis. Execuções pontuais, sequenciais, com saídas em `.temp/ui-performance`; não representam uma distribuição estatística de tempos de CI.

Tempo abaixo é tempo de parede do processo. Memória é o pico observado de working set do processo Node, consultado pelo Windows a cada 200 ms; não é heap utilizado, limite de heap, nem memória total de todos os processos da pipeline. Threads do worker do tsup pertencem ao processo medido; subprocessos externos não foram somados.

| Experimento | Tempo | Memória observada | Resultado |
| --- | ---: | ---: | --- |
| Typecheck UI atual, sem incremental | 21,23 s | 1.000,2 MiB | Sucesso; 2.679 arquivos |
| Typecheck excluindo testes TSX | 20,46 s | 978,1 MiB | Sucesso; 2.648 arquivos |
| Emissão de declarações com tsc, excluindo testes TSX | 20,64 s | 969,6 MiB | Sucesso do compilador; consumidores ainda não validados |
| Typecheck de Button, Card e Popover com imports atuais | 3,23 s | 401,9 MiB | Sucesso; 1.069 arquivos, 30 fontes da UI |
| Mesmos três componentes com cn resolvido diretamente | 1,98 s | 289,2 MiB | Sucesso; 246 arquivos, 4 fontes da UI |
| tsup atual com output temporário, sem ajuste de heap | 61,87 s até falhar | 2.296,9 MiB | ERR_WORKER_OUT_OF_MEMORY na geração de DTS |
| Mesmo tsup, heap máximo configurado em 8 GiB | 61,64 s | 2.949,3 MiB | Sucesso; JavaScript 2,256 s, DTS 59,040 s |
| tsc com emissão incremental, primeira execução | 21,49 s | 979,1 MiB | Sucesso |
| Mesmo tsc incremental, sem alterações | 4,16 s | 505,8 MiB | Sucesso; reaproveitamento local |

A medição incremental repetida não comprova o comportamento após editar Button, nem substitui o cache do Turbo. Uma tarefa restaurada integralmente do Turbo normalmente não precisa executar o compilador.

A execução isolada do tsup importou a configuração real, alterando somente outDir e desabilitando a cópia de assets em onSuccess. O código instalado do tsup cria um Worker para a tarefa DTS. O teste com heap padrão falhou; ele não deve ser apresentado como benchmark de um build concluído.


## Segunda rodada: pacote único e cache por tarefa

Workspace isolado em `.temp/ui-single-package`, com cópia das fontes reais, um único pacote UI, dependências existentes e Turbo 2.11.7. A cópia substituiu imports exclusivos de cn por imports diretos de utils, excluiu testes da emissão e aplicou uma transformação local de aliases nas declarações. Naquele experimento, nenhuma dessas mudanças havia sido aplicada à UI original. A implementação posterior está registrada ao final deste documento.

O protótipo expôs cinco subpaths JavaScript (button, card, popover, providers, pages) e globals.css. Cada grupo teve uma tarefa e diretório de output próprio; build foi a tarefa agregadora. O primeiro build foi serial para evitar confundir os resultados com competição entre compiladores.

| Verificação | Resultado |
| --- | --- |
| Build frio de tarefas separadas | 7/7 tarefas; 0 hits; 43,997 s reportados pelo Turbo |
| Repetição sem mudanças | 7/7 hits; 0,218 s no relatório de execução do Turbo |
| Alteração do arquivo de Button | Reexecutou button, providers, pages e agregador; card, popover e styles tiveram HIT; 34,604 s |
| Outputs removidos, cache preservado | 7/7 hits; 0,811 s; todos os arquivos dos exports restaurados |
| Imports de Button, Card, Popover, SyncProvider e TimeEntries | Consumidor TypeScript válido passou |
| Variante inválida de Button | Rejeitada com TS2769; não houve supressão de erro |
| Runtime básico | Button e Card renderizados por SSR; Popover carregado; import da raiz rejeitado como esperado |

Os tempos de cache acima são os do resumo do Turbo, sem todo o custo de inicializar o comando Node. Não comparar diretamente 0,218 s com tempos de parede de comandos completos.

As demais alterações foram verificadas por comparação de hashes em dry runs, sem executar cada build:

| Arquivo alterado | Produtores com hash alterado |
| --- | --- |
| Card | card e pages |
| providers/index | providers |
| pages/index | pages |
| utils/cn | button, card, popover, providers e pages |
| globals.css | styles |

O agregador também foi invalidado. Providers e páginas usam Button; portanto é correto que mudanças do botão atinjam esses grupos. Não existe promessa de recompilar apenas o botão quando seus dependentes são afetados.

## Riscos identificados e corrigidos no experimento

### Bundles independentes duplicam estado

Os bundles independentes de providers e pages continham duas definições de WorkspaceContext, uma em cada arquivo. Isso confirma duplicação da definição do contexto no código gerado; não foi executado um E2E que reproduza a consequência na tela.

Esse formato foi rejeitado para o JavaScript. O bundle com múltiplas entradas e splitting em um único grafo manteve uma única definição, localizada num chunk compartilhado. Aplicar o mesmo cuidado a outros contextos, stores, queryClient e módulos de inicialização.

Se tarefas JavaScript independentes forem consideradas posteriormente, deverão consumir módulos canônicos compartilhados, sem incorporar novas cópias de estado. Não usar bundles independentes de páginas e providers como atalho de cache.

### O grafo de tipos não inclui todos os assets

Inputs gerados somente a partir dos arquivos do programa TypeScript omitiram quatro assets efetivamente importados por pages: logo-icon.svg, logo-text.svg, jira.png e youtrack.png.

Antes da correção, mudar logo-icon.svg alterava styles e o agregador, mas não pages. Uma auditoria de imports locais detectou a omissão; após regenerar os inputs, a alteração também modificou o hash de pages.

### Novos helpers precisam entrar nos inputs

Um novo helper importado pelo botão não estava na lista inicial de inputs. Mudar somente esse helper não alterou o hash dos produtores afetados; somente o agregador detectou a nova fonte através de seus inputs amplos. Isso não tornaria os outputs dos produtores corretos.

A auditoria detectou o helper faltante em button, providers e pages. Após atualizar os inputs, mudanças do helper invalidaram todos esses produtores.

A auditoria levou aproximadamente 0,35 s e falhou explicitamente quando encontrou omissões. Isso foi validado apenas no protótipo, para imports estáticos locais. Não é uma solução pronta para imports calculados, arquivos lidos por plugins ou todo o ambiente da aplicação.

Para levar cache fino à produção:

- Rodar uma auditoria ou geração determinística de inputs ANTES da invocação do Turbo, inclusive nos comandos de CI que o chamam diretamente e nos typechecks que executam builds como dependência.
- Rejeitar imports locais não resolvidos e dependências desconhecidas.
- Cobrir código, tipos, assets, CSS, configurações e dependências externas/ambiente relevantes.
- Preservar dependências de build dos outros workspaces no grafo real.
- Alterar a configuração do Turbo quando o conjunto de dependências mudar é seguro, mas pode invalidar amplamente o cache nessa execução. Não prometer que um novo import preservará todos os outros caches.
- Preferir globs conservadores para grupos coesos se o custo de manter um grafo específico superar o benefício. Globs que exageram a invalidação são preferíveis a inputs que omitem uma dependência real.

## Alternativa com um único grafo de JavaScript

A alternativa emitiu as declarações da UI completa pelo TypeScript e empacotou as mesmas cinco entradas públicas em uma chamada esbuild com splitting. Não introduziu um segundo pacote.

| Medição | Resultado |
| --- | --- |
| Tempo de parede do processo | 22,89 s |
| Pico observado do processo Node | 1.013,2 MiB |
| Declarações produzidas | 270 arquivos |
| Consumidor válido | Passou |
| Consumidor com prop inválida | Rejeitado |
| Runtime básico e ausência de export raiz | Passaram |
| Bundle browser do consumidor | Passou |
| Referências de declarações | Sem módulos não resolvidos após transformação de aliases e inclusão do recurso CSS |
| Definições de WorkspaceContext | Uma, num módulo compartilhado |

O validador tratou CSS como recurso que precisa existir, separado da resolução de módulos TypeScript. Também foi necessário fixar o tsconfig do consumidor experimental: descoberta automática inicialmente carregou aliases do monorepo e desviou parte do teste para as fontes originais. Essa tentativa não conta como validação dos exports.

O bundler emitiu avisos sobre imports sem bindings em chunks marcados como sem efeitos colaterais. Não foi demonstrada uma falha funcional por esses avisos; auditar sideEffects e módulos de inicialização durante a implementação.

Esta alternativa valida somente os subpaths testados, e não substitui os builds de desktop, landing e addons. O tsup atual possui outras entradas públicas; os números não são uma comparação funcional completa de todos os exports nem uma previsão de redução da pipeline.

## Incremental após alterações reais

Uma emissão incremental de declarações do pacote único foi medida com TypeScript, configurações compatíveis com o protótipo e limite de heap sem aumento. Apenas a cópia temporária do botão foi modificada e restaurada.

| Cenário | Tempo de parede | Pico observado |
| --- | ---: | ---: |
| Primeira emissão | 23,19 s | 1.046,4 MiB |
| Sem alterações | 3,85 s | 511,1 MiB |
| Alteração de classes do Button | 22,73 s | 1.076,6 MiB |
| Alteração do tipo público de Button | 22,53 s | 963,5 MiB |

Todos concluíram sem erros. A alteração de estilo e a mudança de contrato voltaram a acionar trabalho substancial de checagem. O ganho sem alterações não deve ser extrapolado para edições reais. Incremental permanece útil, mas não comprovou recompilação barata do botão nessa organização.

## Plano recomendado

### 1. API por subpaths no mesmo pacote

- Definir os exports explícitos, sem export raiz global, e migrar consumidores juntos.
- Manter imports diretos de utilitários; evitar barrels amplos em dependências internas.
- Verificar os aliases do desktop e do tsconfig raiz que apontam UI diretamente para src. Eles podem contornar os exports e levar a checagens diferentes entre fontes e declarações; ainda não foi reproduzida uma falha de aplicação causada por isso.
- Validar novos subpaths na resolução de Node, TypeScript, Vite e Next, incluindo dev e build.

### 2. Geração de tipos mais leve

- Trocar o bundling global de DTS por emissão de declarações por arquivo, depois de resolver aliases e recursos.
- Preservar strict, reprovação de erros e a checagem/execução dos testes. Não usar noCheck ou coerções para ganhar tempo.
- Excluir specs/tests TSX da emissão; a melhoria isolada foi pequena, mas corrige o escopo.
- Manter um grafo JavaScript com módulos de estado compartilhados, várias entradas públicas e diretivas use client corretas.
- Comparar tarefas build:js, build:types e build:styles/assets, com outputs sem sobreposição. Um export por componente não exige um compilador por componente.
- Manter build info e declarações consistentes ao restaurar cache. Não limpar outputs e depois confiar num build info que os considera existentes.

### 3. Cache fino onde compensar

- O protótipo comprovou tarefas independentes no mesmo pacote; seu custo frio foi maior que o da alternativa com um compilador de tipos.
- Investigar divisão da checagem de tipos em projetos internos com limites coesos e referências, sem criar novos pacotes npm.
- Medir efeitos de mudanças de estilo e de contrato, inclusive nas dependências. Não antecipar ganhos antes de validar essas fronteiras.
- Considerar emit por arquivo sem bundling ou módulos internos canônicos se a granularidade do JavaScript for ampliada.
- Adotar o grau de divisão que reduza o tempo das alterações reais, não apenas a quantidade de tarefas que aparece como HIT.

### 4. Memória e outras oportunidades

- Comparar concorrência pelo orçamento de RAM; 100% de CPUs pode iniciar vários compiladores pesados simultaneamente.
- A medição de 1.013 MiB é do processo principal da alternativa combinada, não de todos os processos da pipeline.
- Aumentar heap pode evitar a falha atual do worker, mas não remove o custo de bundling de DTS.
- Avaliar um target menos antigo que ES6 após definir o suporte de browsers da landing e o Electron suportado. Não foi medido nesta rodada.
- Auditar sideEffects, CSS, assets e a transpilation adicional da landing antes de remover qualquer etapa.
- Medir repetição de trabalho entre typecheck e emissão. Reutilizar informação incremental somente sem enfraquecer os checks.

### 5. E2E e preparação dos jobs

Na execução 37314644689, o setup dos shards custou 75–102 s e seus testes 50–121 s. O job Windows gastou 109 s em setup e 99 s em build. Separar custos com caches frios e quentes em várias execuções antes de tratar esses tempos como custos recorrentes.

- Instrumentar instalação, downloads, inicialização do Electron, preparação de dados e assertions.
- Comparar instalação focada e combinações de shards/workers com o mesmo conjunto de validações.
- Medir o shard mais lento e o efeito dos retries.
- Melhorar helpers com esperas por estados observáveis, sem delays artificiais.
- Avaliar reutilização do Electron por worker somente após provar reset completo e isolamento; manter processo novo nos cenários de ciclo de vida.

## Critérios para aplicar à pipeline

1. Cobrir todos os exports atuais e consumidores, não somente os cinco subpaths do piloto.
2. Rodar lint:fix, testes unitários/UI, typecheck na raiz e builds de desktop/landing/addons aplicáveis.
3. Antes de publicar esta alteração, executar os E2E completos, preservando todas as assertions. Por pedido do usuário, os E2E ficaram para a próxima etapa; nesta rodada foram executados os testes unitários e de UI.
4. Confirmar identidade compartilhada de contextos, stores e clientes em runtime.
5. Repetir benchmarks equivalentes, registrando mediana, variação e memória.
6. Testar cache frio, mudanças isoladas, novos imports, assets e configurações.
7. Remover outputs preservando cache e confirmar restauração utilizável da solução escolhida.
8. Validar invocações diretas do Turbo para impedir bypass de preparação dos inputs, se essa estratégia for adotada.

## Evidências e estado do trabalho

- Primeira rodada: `.temp/ui-performance`.
- Segunda rodada: `.temp/ui-single-package` e `.temp/ui-single-package-scripts`.
- JSONs principais: cache-measurements, dependency-audit-measurements, combined-measurement, combined-validation e incremental-edits-measurements.
- Na rodada dos protótipos, yarn typecheck na raiz passou com 14/14 tarefas restauradas do cache; essa execução não validava uma migração da aplicação. A validação da implementação está registrada abaixo.
- SSR e bundle de consumidor são provas limitadas; não exercitam Electron, IPC, persistência ou sincronização completa.
- A rodada inicial alterou somente este plano. Posteriormente, a implementação descrita abaixo alterou a UI e seus consumidores.

## Implementação aplicada ao projeto

- Um único pacote @mr-tick/ui, sem export raiz, com 40 subpaths de componentes, /utils e os exports agrupados existentes (/providers, /pages, /components e demais grupos). Os grupos antigos permanecem compatíveis.
- Desktop e landing usam imports por componente; imports internos exclusivos de cn usam lib/utils, reduzindo dependências de barrels amplos.
- JavaScript continua em um único grafo tsup com splitting, preservando módulos compartilhados.
- Declarações são emitidas por arquivo pelo TypeScript com checagem completa e noEmitOnError. Um emissor tipado resolve aliases privados e referências locais; não usa noCheck nem coerções.
- Specs TSX saíram da emissão, mas permanecem no typecheck dedicado; o tooling novo também é checado. As suítes de testes continuam executadas.
- Aliases de UI que apontavam consumidores para src foram removidos. O desktop determina os subpaths de Vite pelos exports reais do package.json.
- Watch preserva outputs existentes e atualiza declarações após compilar JavaScript; sua primeira compilação foi validada. Não foi medido o custo de uma sequência de edições em watch.
- .temp foi excluído do lint para não validar cópias de experimentos.

| Validação da implementação | Resultado |
| --- | --- |
| Primeiro build UI pelo Turbo | 27,361 s totais; JavaScript 2,079 s; declarações 21,20 s |
| Compilador de tipos em processo Node direto | 21,79 s de parede; pico observado 1.023,8 MiB; sem aumentar heap |
| Emissão | 270 declarações; 49 exports com arquivos existentes |
| Consumidor válido e prop inválida | Válido passou; inválido foi rejeitado pelo TypeScript |
| Referências de declarações | Nenhum módulo não resolvido |
| Contexto de workspace no bundle | Uma definição compartilhada; verificação estática |
| Runtime básico | SSR Button/Card, carregamento de Popover e ausência de export raiz passaram |
| Watch | JavaScript e declarações emitidos; processo encerrado após validação |
| Restauração sem outputs da UI | 5/5 hits; 647 ms no resumo Turbo; arquivos, tipos e SSR revalidados após restauração |
| Typecheck na raiz | 14/14 tarefas passaram; 10 hits, 4 executadas |
| Unitários | 332 testes passaram em 41 arquivos |
| UI | 210 testes passaram em 22 arquivos |
| Lint na raiz | Sem erros; 75 avisos existentes |
| Build completo | Desktop, landing e demais produtores passaram |

A medição de memória usa node --import tsx diretamente para observar o compilador, sem medir apenas o launcher da CLI tsx. É uma execução local pontual; não soma processos de builds paralelos. A referência anterior de aproximadamente 62 s e pico de 2,9 GiB foi obtida no bundling DTS do tsup com heap aumentado. O novo build concluiu com heap padrão, mas isso não garante ausência de OOM em qualquer carga/concorrência.

**Cache nesta entrega:** continua conservador por pacote. Alterar Button ainda invalida o build da UI e seus dependentes; export por componente não cria cache independente no Turbo. O ganho aplicado vem da geração de tipos mais leve e dos imports menores. A divisão fina permanece uma investigação posterior, condicionada aos riscos já documentados.

O tempo final de CI precisa ser medido em uma execução real. Não extrapolar o ganho local da UI para prometer uma duração da pipeline de 8m51s. E2E não foi executado nesta entrega; SSR e inspeção de contexto não substituem integração completa no Electron.

Evidências desta implementação: .temp/ui-implementation (logs de build, lint, typecheck, suítes, contracts.json, watch e types-memory-direct.json).

## Correção de diretivas de cliente

A inspeção posterior dos avisos MODULE_LEVEL_DIRECTIVE confirmou que treeshake: true habilitava uma segunda passagem de Rollup dentro do tsup. Ela descartava as diretivas use client, inclusive os banners injetados antes dessa etapa. O build anterior passou, mas os arquivos publicados não preservavam a fronteira de cliente esperada pela biblioteca.

A configuração agora desabilita somente essa passagem extra (treeshake: false no tsup), mantém options.treeShaking = true no esbuild e usa um único ponto de configuração para o banner. Não foi aplicado filtro de warnings nem modo silent.

Validação: todos os 98 arquivos JavaScript gerados contêm use client no prólogo; nenhum aviso de diretiva no build completo; desktop e landing passaram; typecheck na raiz passou com 14/14 tarefas. Na revalidação, a primeira execução de unitários falhou ao resolver pacotes locais (shared/helpers e domain); a resolução direta pelo Node funcionou e uma repetição, sem alteração de código, passou com 332 testes. A suíte de UI também passou com 210 testes. A causa dessa primeira falha não foi confirmada; não é prova de regressão de comportamento. Os 49 exports, 270 declarações, identidade estática compartilhada de WorkspaceContext e SSR básico foram revalidados. O banner pode coexistir com uma diretiva já preservada da entrada original; duas diretivas iguais não alteram a semântica.

Fontes oficiais: https://tsup.egoist.dev/ (treeshake habilita Rollup), https://esbuild.github.io/api/#tree-shaking e https://nextjs.org/docs/app/api-reference/directives/use-client. Evidências adicionais: código instalado de tsup/dist/index.js, diretivas dos arquivos finais e logs directives-* em .temp/ui-implementation.

## Import de eleição de líder do RxDB

O aviso do vite:reporter sobre leader-election veio de dois caminhos para o mesmo módulo: storage.ts o importava dinamicamente, enquanto o plugin replication do RxDB instalado já o importava estaticamente. Por isso o import dinâmico não conseguia produzir um chunk separado no desktop.

A UI agora importa RxDBLeaderElectionPlugin estaticamente. O registro continua em ensurePlugins, com a mesma guarda global por Promise. Não foram alterados multiInstance, waitForLeadership, regras de replicação ou persistência. Query builder e dev mode mantêm seus imports dinâmicos. Não foi usado filtro de warnings nem configuração artificial de chunks.

A documentação oficial apresenta o mesmo padrão de import estático: https://rxdb.info/leader-election.html. O código instalado de rxdb/dist/esm/plugins/replication/index.js confirma o import estático e o registro feito por replicateRxCollection. Validações concluídas: build completo com 9/9 tarefas passou sem avisos de import dinâmico/estático ou diretivas; typecheck passou com 14/14 tarefas; 210 testes de UI passaram, incluindo criação de banco RxDB em memória e cenários de replicação. Lint passou sem erros e com os mesmos 75 avisos. Os 49 exports, 270 declarações e SSR básico foram revalidados. Essas provas não incluem múltiplas janelas Electron nem eleição real entre processos. Evidências nos logs rxdb-* em .temp/ui-implementation.

Fontes:

- https://github.com/microsoft/TypeScript/wiki/Performance
- https://www.typescriptlang.org/tsconfig/incremental.html
- https://www.typescriptlang.org/tsconfig/paths.html
- https://turborepo.dev/docs/reference/configuration
- https://turborepo.dev/docs/crafting-your-repository/caching
- https://nodejs.org/download/release/v25.9.0/docs/api/packages.html
- https://playwright.dev/docs/test-fixtures
- https://github.com/Gustavohps10/mr-tick/actions/runs/37314644689
