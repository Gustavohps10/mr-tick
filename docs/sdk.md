# SDK

O SDK reúne ferramentas para criar extensões do Mr. Tick sem alterar o aplicativo. Ele permite conectar ferramentas de trabalho, consultar tarefas, registrar apontamentos e sugestões, adicionar ações e criar temas. Essas extensões são chamadas de addons.

O pacote público `@mr-tick/sdk` é o ponto de entrada para addons. Os guias de schemas de conexão acompanham o SDK 0.12 publicado no npm e `requiredApiVersion: '>=0.12.0'`; o empacotamento deriva o intervalo da versão do SDK usado pela CLI.

## Conceitos

| Conceito     | Responsabilidade                                                                |
| ------------ | ------------------------------------------------------------------------------- |
| Capability   | Classificação no manifesto: auth, dataSource, watcher, calendar, punch ou theme |
| Contribuição | Registro em runtime de comandos, menus, settings, conexões, datasource ou temas |
| Conexão      | Conta externa no escopo de um workspace, com identidade e autorizações          |
| Datasource   | Providers de tarefas, apontamentos, membros e metadados                         |

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

## Evolução em desenvolvimento para Jira Cloud

As mudanças abaixo ainda dependem da próxima publicação minor do SDK e do desktop; não estão no pacote npm 0.12. O addon Jira usa o SDK local durante essa validação e exige API 0.13 antes de ser distribuído.

- `MemberDTO.id` preserva a identidade nativa do provedor (`string | number`). Informações de administração e histórico do membro são opcionais quando a API não as fornece.
- `core.connections.completeAuthentication(scope, response)` aceita `response.configuration` explícita. O core verifica a tentativa OAuth e sua geração e encaminha a configuração para a mesma operação de autorização; não grava tokens em settings.
- `TimeEntryPullPageDTO.kind` distingue `changes` de `snapshot`. A omissão significa snapshot. Um change feed tem seleção limitada e checkpoint próprio; seus registros podem mudar entre chamadas, portanto o consumidor não exige que páginas diferentes tenham o mesmo snapshot. Isso não implementa tombstones nem garante retenção ilimitada no provedor.
- `IHttpRequestOptions.readErrorMessage(payload)` permite ao addon selecionar mensagens canônicas do erro remoto. O transporte preserva o status; sem decoder, o desktop continua retornando apenas o status seguro. O decoder não deve devolver o corpo inteiro ou campos de credenciais.
- Respostas JSON HTTP 204/205 são representadas por `null`; um pedido explícito por texto preserva o corpo vazio. A validação da resposta continua obrigatória.

Schemas customizados da área de autenticação podem incluir campos editáveis e ações OAuth. O renderer oferece salvar/cancelar apenas quando o schema contém campos editáveis, mantendo o escopo do workspace escolhido.

A apresentação `kind: 'auth'` declarada pelo addon governa a autenticação também quando há um datasource. O formulário genérico aparece apenas na ausência dessa apresentação; a área Fonte de dados mantém os mapeamentos e orienta contas pendentes para Autenticação.
