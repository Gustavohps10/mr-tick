# Desenvolvimento e depuração de addons

## Contratos atuais

Use o [guia de addons](../../docs/sdk.md), as [capabilities](../apps/landing-page/content/docs/capabilities/index.pt-br.mdx) e o [guia de autenticação](../apps/landing-page/content/docs/capabilities/auth.pt-br.mdx). O manifesto usa capacidades canônicas; addons que autenticam declaram `auth` e registram a autenticação separadamente dos providers do datasource.

## Ambiente local

Execute na raiz do monorepo:

```powershell
yarn addon:list
yarn addon:build datasource-fake
yarn addon:link datasource-fake
yarn dev:desktop:debug
```

`addon:link` cria o vínculo de desenvolvimento; não substitui instalação de pacote nem validação de uma dependência publicada. Use `yarn addon:watch nome-do-addon` para recompilar e `yarn addon:unlink nome-do-addon` para remover o vínculo pelo tooling oficial.

Cada addon deve ter package.json, manifest.yaml, fontes e build coerentes. Consulte o [primeiro addon](../apps/landing-page/content/docs/quickstart.pt-br.mdx) para um exemplo compilável. Addons que conectam contas declaram `auth` e registram perfis com `contributions.connections.registerProfiles`, independentemente de oferecerem `dataSource`.

## Testar mudanças no SDK sem esperar uma release

Para testar alterações locais nos contratos ou na implementação do SDK, use o SDK compilado do monorepo. Não é necessário publicar uma versão no npm nem esperar a pipeline de release.

Com o aplicativo fechado, siga esta ordem:

1. **Deslinkar todos os addons** com `yarn addon:unlink all`, executado na raiz de `metric`.
2. **Remover as cópias instaladas dos addons** dos diretórios de instalação usados pelo perfil de teste. Confira o destino mostrado por `yarn addon:list`; o tooling usa `%APPDATA%\mr-tick\addons` no Windows quando `MR_TICK_ADDONS_PATH` não está definido. Confira também outros destinos usados pelo aplicativo nesse teste. A limpeza é das instalações dos addons, preservando os repositórios com as fontes, workspaces, bancos e credenciais.
3. **Recompilar o SDK local e todos os addons envolvidos.** Recompile também o desktop quando houver mudanças no core ou no loader. Os addons devem ser compilados e ter seus tipos validados contra esse SDK local; reconstruir apenas o aplicativo ou usar os tipos antigos do npm não valida o novo contrato.
4. **Relinkar os addons recompilados**, usando `yarn addon:link nome-do-addon` para cada um. Abra novamente o aplicativo e execute os testes dos fluxos afetados.

A sequência é: **deslinkar → remover instalações anteriores → recompilar → relinkar → testar**. Ela evita carregar um pacote antigo instalado enquanto se tenta validar o código local.

### Cuidados com os comandos existentes

- `addon:unlink` pode restaurar uma instalação do catálogo que estava em backup; por isso, confira e limpe as cópias instaladas depois de deslinkar.
- Ao deslinkar um addon externo, o tooling também desfaz seu vínculo com o SDK local e pode restaurar a dependência do npm. Prepare novamente o SDK local para a compilação e a checagem de tipos; o vínculo do addon no aplicativo só deve ficar ativo para o teste depois da recompilação.
- `yarn addon:build all` inclui addons externos somente quando já estão linkados. Depois de deslinkar todos, selecione cada addon externo explicitamente ou use o build do próprio repositório, preservando a resolução do SDK local.
- `yarn addon:link all` vincula apenas os addons internos de `src/dev-addons`. Para Redmine, Discord, Dracula e outros repositórios externos, use o nome de cada pasta explicitamente.
- O desktop em desenvolvimento permite testar uma API ainda não publicada quando tanto o addon instalado quanto sua dependência `node_modules/@mr-tick/sdk` são links, e essa dependência aponta para o mesmo SDK local usado pelo host. `addon:link nome-do-addon` prepara esses vínculos para repositórios externos. O aplicativo empacotado continua validando `requiredApiVersion` normalmente. Não altere versões de publicação manualmente para viabilizar o teste.

Esse procedimento valida o desenvolvimento local. Antes de distribuir os addons, volte a validar com o SDK publicado, a dependência npm e o lockfile alinhados, conforme a seção abaixo.

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
