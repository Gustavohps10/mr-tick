# Documentação técnica do Mr. Tick

## Onde começar

- [SDK](sdk.md): mapa das referências e conceitos públicos.
- [Execução local](como-rodar.md): ambiente do monorepo.
- [Testar o SDK sem esperar uma release](../src/dev-addons/desenvolvimento-e-debug-de-addons.md#testar-mudanças-no-sdk-sem-esperar-uma-release): deslinkar, remover instalações anteriores, recompilar e relinkar os addons com o SDK local.
- [Runtime local do SDK](sdk-local-runtime.md): timer, apontamentos, sugestões e identidade de operação.
- [Contexto e capacidades do core](sdk-core-capabilities.md): consultas, escopos e lifecycle.
- [Autenticação](../src/apps/landing-page/content/docs/capabilities/auth.pt-br.mdx): perfis, autenticadores e credenciais.
- [OAuth PKCE](../src/apps/landing-page/content/docs/apis/oauth-pkce.pt-br.mdx): fluxo atual e callbacks por ambiente.

## Acesso por agentes

O portal usa a integração oficial do Fumadocs para oferecer a mesma documentação em texto:

- `/llms.txt`: índice dos dois idiomas.
- `/llms-full.txt`: conteúdo completo dos dois idiomas.
- `?locale=pt-br` ou `?locale=en`: limita esses dois arquivos ao idioma escolhido.
- `/docs.md` e `/docs/<página>.md`: páginas em inglês.
- `/pt-br/docs.md` e `/pt-br/docs/<página>.md`: páginas em português.
- `/api/mcp`: MCP de leitura, com `list_pages`, `get_page` e `search`. A busca aceita `locale`.

Para conectar um agente após a publicação, use `https://mistertick.com/api/mcp` como URL do servidor. Em desenvolvimento, use a origem local. Não é necessário configurar um provedor de IA nem uma chave de modelo para servir esses conteúdos.

## Organização do conteúdo

O portal em [content/docs](../src/apps/landing-page/content/docs) contém os guias públicos em inglês e português. Use `capabilities/` para capacidades declaradas pelo addon e `apis/` para recursos de apoio. A página de autenticação reúne os conceitos, os perfis de conexão e os autenticadores, inclusive para addons sem datasource.

Os documentos `sdk-*.md` desta pasta descrevem composição e limites do host. ADRs registram decisões e evolução; blocos históricos explicitamente superados não são exemplos de implementação atual. A [ADR-008](adr/008-addon-capabilities-canon.md) fixa os valores de capabilities e a separação de conexões/datasources.

Ao alterar contratos públicos, atualize as duas línguas, navegação, exemplos e links afetados. A fonte de verdade é o código exportado por [SDK](../src/apps/sdk/src/index.ts), [data-source](../src/apps/sdk/src/data-source.ts) e contratos da Application. Exemplos completos devem compilar contra o SDK publicado, sem imports privados do monorepo.
