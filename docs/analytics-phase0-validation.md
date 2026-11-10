# Validação da fase 0 de Analytics

Escopo: capacidade genérica independente, contratos, registro, resolução por conexão, ciclo de vida, bridge/IPC, consumidores e separação do addon Redmine. Não inclui persistência DuckDB, executor de lotes, atualização incremental ou reconciliação analítica.

## Evidências

- Core: testes de capacidade, CLI, loader, resolver, handlers e fixture analítica. O loader registra `auth + analytics` sem datasource; o resolver usa autorização e credenciais da conexão diretamente.
- Ciclo de vida: desconexão durante chamada, desativação, capability desabilitada, unregister e novo registro invalidam resultados/provedores antigos. Os testes usam barreiras determinísticas, sem delays de sincronização.
- UI: catálogo e filtros vêm de analytics; criação exige seleção explícita; resultados ficam isolados por nó, workspace, conexão e escopo.
- Redmine: testes unitários e de transporte HTTP; matriz adicional somente de leitura nos containers 3.4, 5.1 e 6.0 verifica catálogo, schema, dataset e opções de filtro sem criar datasource pessoal.
- Electron: fluxo com addon de desenvolvimento, seleção de conexão/dataset, extração, edição da fonte e publicação de gráfico. A independência `auth + analytics` é comprovada nas camadas loader/resolver, não por esse E2E.

## Regressão concreta encontrada durante a refatoração

O cache da UI podia servir dados de outra fonte ao usar o mesmo dataset como chave alternativa. O teste de hook falhou pelo comportamento esperado: uma fonte ainda sem resultado recebeu linhas de outra fonte. A correção removeu essa chave alternativa, vinculou o cache ao escopo solicitado e passou a descartar respostas superadas por uma edição da fonte.

O teste passou após a correção e há uma regressão adicional para resposta atrasada após edição. A prova é de hook/componente com bridge controlada; não representa uma prova E2E de sincronização remota. Logs históricos: `phase0-source-isolation-red.log` e `phase0-source-isolation-green.log`.

## Limites conhecidos

Redmine e a fixture declaram snapshots com cobertura `unverified`; a tela informa essa condição. Os contratos distinguem snapshot, mudanças e agregação remota, mas esses dois últimos modos não estão implementados nos providers atuais. Solicitações de modos/continuidade não suportados falham explicitamente.

Os guards invalidam resultados após mudanças de ciclo de vida, sem prometer cancelamento físico de HTTP. Os limites de extração e paginação do Redmine permanecem registrados nas próximas fases do checklist. O timeout padrão de 5 segundos do teste de integração foi insuficiente em uma rodada; a matriz final usa orçamento de 30 segundos, sem alterar timeout de produção.

Os logs ficam em `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`. A distribuição pública depende da publicação anterior do SDK com o novo contrato; a validação local usa `yarn link` oficial.

## Resultado final

| Verificação | Resultado |
|---|---|
| Core — lint na raiz | 0 erros; 108 avisos |
| Core — typecheck na raiz | 15/15 tarefas aprovadas |
| Core — contratos, capacidades, handlers e providers | 57/57 testes |
| Core — regressões operacionais afetadas | 35/35 testes |
| UI — analytics e filtros | 22/22 testes |
| Redmine — testes unitários/HTTP | 111/111 testes |
| Redmine — matriz Docker de leitura | 3/3 testes |
| Electron — fluxo analítico sem retries | 1/1 teste |
| Builds | Desktop, fixture e addon aprovados |
| Redmine — lint, typecheck e manifesto | Aprovados |
| Changesets — status nos dois repositórios | Aprovados; entrega registrada como minor por orientação do usuário |
| Revisão independente | F0-01 a F0-07 aprovados; 10 testes críticos repetidos pelo revisor |

O build final também comprovou a correção do import do helper de escopo: ele pertence a application, é reexportado pelo SDK e não faz a UI carregar os utilitários Node de criptografia do SDK. Após a revisão independente, os checks e o E2E foram repetidos com essa organização final. Nenhuma publicação foi realizada.
