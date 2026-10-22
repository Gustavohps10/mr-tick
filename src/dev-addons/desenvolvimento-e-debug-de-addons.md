# Desenvolvimento e depuração de addons

## Contratos atuais

Use o [guia de addons](../../docs/sdk.md), as [capabilities](../apps/landing-page/content/docs/capabilities/index.pt-br.mdx) e o [guia de conexões](../apps/landing-page/content/docs/apis/connections.pt-br.mdx). O SDK 0.10 exige `capabilities` canônicas; autenticação é contribuição separada dos providers do datasource.

## Ambiente local

Execute na raiz do monorepo:

```powershell
yarn addon:list
yarn addon:build datasource-fake
yarn addon:link datasource-fake
yarn dev:desktop:debug
```

`addon:link` cria o vínculo de desenvolvimento; não substitui instalação de pacote nem validação de uma dependência publicada. Use `yarn addon:watch nome-do-addon` para recompilar e `yarn addon:unlink nome-do-addon` para remover o vínculo pelo tooling oficial.

Cada addon deve ter package.json, manifest.yaml, fontes e build coerentes. Consulte o [primeiro addon](../apps/landing-page/content/docs/quickstart.pt-br.mdx) para um exemplo compilável. Manifestações de perfis de conexão ficam em runtime: datasources usam `getConnectionProfiles()` e watchers usam `contributions.connections.registerProfiles`.

## Inspeção

```powershell
yarn app:inspect --action inspect
yarn app:inspect --action screenshot
```

A inspeção usa CDP do renderer na porta 9333. Código do addon roda no main, portanto breakpoints de addon exigem o inspector Node do main, não apenas DevTools da UI. Não altere credenciais ou dados do usuário para reproduzir problemas; use perfis isolados de teste.

## Antes de distribuir

- Valide com o SDK publicado no npm e lockfile normal, sem vínculo local de SDK na entrega.
- Rode testes do addon, checagem de tipos e build.
- Valide o manifesto e gere `.tladdon` pela CLI do SDK.
- Use Changesets para versionamento; não altere versões nem changelog manualmente.
- Preserve falhas do provedor, valide respostas HTTP e anuncie somente garantias remotas efetivamente suportadas.
