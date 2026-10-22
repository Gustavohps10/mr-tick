# @mr-tick/sdk

O SDK reúne ferramentas para criar extensões do Mr. Tick sem alterar o aplicativo. Ele permite conectar ferramentas de trabalho, consultar tarefas, registrar apontamentos e sugestões, adicionar ações e criar temas. Essas extensões são chamadas de addons.


SDK público para addons do Mr. Tick. Instale o pacote publicado no npm; não importe pacotes privados do monorepo. A linha 0.10 usa capabilities canônicas e separa autenticação de conexões dos providers de dados.

## Modelo público

- `AddonContext.core`: runtime, workspaces, connections, tasks, metadata, timer e timeEntries.
- `AddonContext.contributions`: commands, menus, settings, connections, dataSources e themes.
- `AddonContext.host`: events, notifications, vault e oauth.
- `IDataSourceInstance`: tasksProvider, timeEntriesProvider, membersProvider e metadataProvider.

O manifesto declara `capabilities` e `requiredApiVersion`. Perfis e autenticadores são registrados em runtime. `IHttpClient` exige validador de resposta. APIs funcionais retornam `Either`; os helpers OAuth de baixo nível mantêm seus contratos de Promise específicos.

## Guias

- [Primeiro addon](https://mistertick.com/docs/quickstart)
- [Capabilities](https://mistertick.com/docs/capabilities)
- [Conexões e autenticação](https://mistertick.com/docs/apis/connections)
- [OAuth PKCE](https://mistertick.com/docs/apis/oauth-pkce)
- [Cofre, settings e eventos](https://mistertick.com/docs/apis/vault-and-events)
- [Sincronização](https://mistertick.com/docs/sync-engine)

Registre contribuições em `activate` e retorne sem aguardar o runtime. Feche recursos próprios em `deactivate`. Addons executam código confiável no main do Electron, sem sandbox para código não confiável. Versões são publicadas pelo fluxo de Changesets/CI; não faça bump manual.
