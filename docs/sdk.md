# SDK

O SDK reúne ferramentas para criar extensões do Mr. Tick sem alterar o aplicativo. Ele permite conectar ferramentas de trabalho, consultar tarefas, registrar apontamentos e sugestões, adicionar ações e criar temas. Essas extensões são chamadas de addons.


O pacote público `@mr-tick/sdk` é o ponto de entrada para addons. Os guias de schemas de conexão acompanham a próxima linha 1.0 do SDK, ainda dependente da publicação e `requiredApiVersion: '>=1.0.0'`; o empacotamento deriva o intervalo da versão do SDK usado pela CLI.

## Conceitos

| Conceito | Responsabilidade |
| --- | --- |
| Capability | Classificação no manifesto: auth, dataSource, watcher, calendar, punch ou theme |
| Contribuição | Registro em runtime de comandos, menus, settings, conexões, datasource ou temas |
| Conexão | Conta externa no escopo de um workspace, com identidade e autorizações |
| Datasource | Providers de tarefas, apontamentos, membros e metadados |

Uma conexão de watcher não é datasource e não entra na replicação de tarefas/apontamentos. O manifesto usa somente `capabilities`, sem descritores versionados por capacidade. Autenticação fica em `contributions.connections`; o core coordena tentativas, cofre e renovação.

## Guias públicos

- [Início](../src/apps/landing-page/content/docs/index.pt-br.mdx)
- [Primeiro addon](../src/apps/landing-page/content/docs/quickstart.pt-br.mdx)
- [Capabilities](../src/apps/landing-page/content/docs/capabilities/index.pt-br.mdx)
- [Autenticação](../src/apps/landing-page/content/docs/capabilities/auth.pt-br.mdx)
- [OAuth PKCE](../src/apps/landing-page/content/docs/apis/oauth-pkce.pt-br.mdx)
- [Cofre, settings e eventos](../src/apps/landing-page/content/docs/apis/vault-and-events.pt-br.mdx)
- [Sincronização](../src/apps/landing-page/content/docs/sync-engine.pt-br.mdx)

## Referências técnicas

- [Contexto do core e lifecycle](sdk-core-capabilities.md)
- [Timer e apontamentos locais](sdk-local-runtime.md)
- [ADR-008](adr/008-addon-capabilities-canon.md)
- [Addon Redmine](https://github.com/Gustavohps10/redmine-plugin)
- [Addon Discord](https://github.com/mistertick/discord-addon)

Addons executam código confiável no main; as APIs com escopo não são sandbox de código de terceiros. Um sucesso local não comprova confirmação remota.

Schemas de conexão são registrados por perfil em `contributions.connections.registerSchema(connectionProfileId, schema)`, independentemente dos providers do datasource. O bridge exige addon e perfil explícitos; campos secretos usam `scope: 'credential'`.
