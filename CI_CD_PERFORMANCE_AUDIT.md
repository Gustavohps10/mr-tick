# Auditoria de performance do CI/CD

Revisão de 05/10/2026, baseada na configuração do Mr. Tick e em validação local Windows.
O relatório inicial na pasta de contexto continha estimativas; os números locais abaixo
não são uma previsão de duração ou custo dos runners do GitHub Actions.

## Configuração entregue

- Turborepo 2.11.7 fixado no package.json e no yarn.lock.
- Desenvolvimento com tarefas persistentes, sem a flag depreciada --parallel.
- Build e typecheck mantêm o grafo de dependências e usam --concurrency=100%.
- Cache local explícito em .turbo/cache. O caminho anterior .turbo já incluía esse cache;
  a hipótese de que o Turbo 2.10.12 usava node_modules/.cache/turbo estava incorreta.
- tsconfig.base.json participa dos hashes globais. Desktop build/typecheck também
  incluem src/packages/IoC.ts e src/apps/sdk/package.json.
- CI, NODE_ENV, RUNNER_OS e RUNNER_ARCH participam dos hashes. NODE_OPTIONS é repassado
  sem invalidar resultados apenas pela mudança do limite de memória.
- Unitários e UI continuam sendo executados pela configuração Vitest da raiz; tarefas
  de raiz do Turbo armazenam resultados bem-sucedidos. Não há divisão artificial de suítes.
  Markdown da raiz, workflows e changesets não são entradas dessas duas suítes.
- Os outputs de Fumadocs (.source) são restaurados junto com as tarefas correspondentes.
- O addon fake usa o build do próprio workspace e seu grafo de dependências no CI.
  E2E continuam executando de verdade; não são cacheados pelo Turbo.

## Reutilização entre jobs

O setup está em .github/actions/setup-workspace/action.yml, usado por ambos os workflows.
O Corepack é habilitado antes da consulta ao cache do Yarn.

O cache de tarefas é separado por sistema, arquitetura, Node major e produtor:
checks (test) e desktop (build-e2e). As chaves de gravação incluem lockfile, commit,
run e tentativa. Prefixos de restauração recuperam snapshots anteriores; o Turbo
decide individualmente quais tarefas têm hashes compatíveis.

release restaura o snapshot Linux de test. build-desktop restaura o snapshot Windows
de build-e2e. Esses consumidores não gravam novamente o mesmo snapshot imutável.
A separação por sistema evita assumir portabilidade de Next, módulos nativos e executáveis.

Downloads do Electron e downloads de empacotamento têm caches distintos. O job de
empacotamento é o único produtor do cache do electron-builder, evitando que um snapshot
imutável salvo antes do empacotamento deixe de persistir essas ferramentas. O cache do
Yarn guarda pacotes compactados; não substitui a instalação nem guarda node_modules.
A instalação permanece yarn install --immutable.

Artefatos de build e relatórios E2E usam compression-level: 1. Resumos do Turbo
(--summarize) são publicados para inspecionar hits, misses e duração por tarefa.
A falha em encontrar qualquer arquivo no upload do build E2E é um erro.

## Aprovação e execução dos E2E

Os seis shards permanecem em Windows, com dois workers por shard e um retry por teste.
A publicação continua dependendo de unitários, UI, typecheck, build e todos os shards E2E.
Execuções antigas de PR podem ser canceladas; publicações de main não são canceladas
por um push mais novo.

## Validação local

| Comando        | Após limpeza inicial | Repetição com cache | Hits na repetição |
| :------------- | -------------------: | ------------------: | ----------------: |
| yarn typecheck |             100,75 s |              1,97 s |             14/14 |
| yarn test:unit |              17,43 s |              1,91 s |               1/1 |
| yarn test:ui   |              31,51 s |              1,87 s |               1/1 |
| yarn build     |              60,99 s |              2,02 s |               9/9 |

Tempos de parede medidos nesta máquina Windows, incluindo inicialização do Yarn.
Unitários: 332 aprovados em 41 arquivos. UI: 210 aprovados em 22 arquivos.
Na configuração final, as duas suítes também executaram sem cache antes da repetição.
Lint: zero erros e 75 avisos existentes. Instalação imutável e actionlint aprovados.

Provas adicionais: alteração temporária de tsconfig.base.json invalida as tarefas;
IoC.ts e package.json do SDK invalidam build/typecheck do Desktop; alteração em teste
invalida a suíte; alteração apenas no workflow não invalida as suítes de raiz.
Os arquivos foram restaurados byte a byte e os hashes retornaram ao baseline.
O índice Git foi atualizado entre cenários para considerar corretamente CRLF no Windows.
RUNNER_OS separa todos os hashes no grafo avaliado.

Após remover dist, out, .next e .source mantendo somente o cache do Turbo, build
restaurou 9/9 tarefas e typecheck 14/14. Foram conferidos main/preload/renderer,
SDK, addon fake, UI, BUILD_ID do Next e .source/server.ts.

E2E completos contra os artefatos restaurados: 58 cenários concluídos com sucesso em
394,92 s (57 passaram na primeira tentativa; um passou no retry). O caso SYNC-05 de
aceitar a versão remota atingiu timeout ao esperar o botão Conflito. Em seguida,
três repetições do mesmo caso, com dois workers e sem retries, passaram em 29,2 s.
Essa intermitência foi registrada; nenhuma alteração de lógica de sincronização foi feita.

A execução fria é uma sequência: typecheck já compila dependências necessárias.
Por isso o build seguinte pode aproveitar essas dependências, mesmo após a limpeza inicial.
O cache do Yarn, os binários instalados e os dados pessoais da aplicação foram preservados.

## Próximas medições no GitHub Actions

Comparar runs frios e aquecidos no mesmo ambiente: fila, instalação, restauração/salvamento
de cache, build, transferência de artefatos e duração de cada shard. Usar os resumos do
Turbo para distinguir cache do Actions e cache por tarefa.

Cache de node_modules, mudança de workers/shards e migração para Linux precisam de
benchmark e validação de compatibilidade. Não se atribuiu o gargalo ao Defender sem medição.
Remote Cache HTTP pode reduzir a transferência de snapshots, mas exige um backend e
credenciais configurados; nenhum serviço externo foi conectado nesta entrega.

FULL TURBO significa que as tarefas solicitadas tiveram resultados válidos restaurados.
Não elimina instalação, testes E2E, empacotamento ou publicação. Changesets e mudanças reais
de inputs devem invalidar as tarefas afetadas.

## Referências

- [Turborepo 2.11.7](https://github.com/vercel/turborepo/releases/tag/v2.11.7)
- [Configuração na versão utilizada](https://github.com/vercel/turborepo/blob/v2.11.7/apps/docs/content/docs/reference/configuration.mdx)
- [Migração de --parallel](https://github.com/vercel/turborepo/blob/v2.11.7/apps/docs/content/docs/reference/run.mdx#--parallel)
- [Cache no GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
- [Recursos dos runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
