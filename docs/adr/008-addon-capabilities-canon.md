# ADR-008: Padronização de Capacidades (AddonCapability) e Desacoplamento de Conexões e DataSources

## Status
Aprovado

## Contexto
Historicamente, o ecossistema Mr. Tick utilizava conceitos duplicados e ambíguos para classificar addons:
- Existiam simultaneamente campos como `category` (singular), `categories` (plural) e `capabilities` em manifestos e DTOs.
- Em alguns locais, foi introduzida uma tentativa de microversionamento granular por capacidade (`contractVersion`), que gerava complexidade desnecessária visto que o ecossistema já possui o campo `requiredApiVersion` para determinar a compatibilidade global com a API/SDK do Core.
- Na camada de interface (`@mr-tick/ui`), todo vínculo de conta externa (`WorkspaceConnectionViewModel`) era tratado indistintamente como um `DataSource`, fazendo com que addons de captura e presença como o `mistertick-discord` fossem despachados para a esteira de sincronização de tarefas e apontamentos do RxDB/LocalRuntime, aparecendo erroneamente no popover do `Header`.

## Decisões

1. **Extinção Definitiva de `category` e `categories`:**
   - Todos os contratos de manifesto (`IAddonManifest`, `AddonManifestDTO`, `AddonManifestViewModel`) passam a usar exclusivamente `capabilities: readonly AddonCapability[]`.
   - A união de capacidades canônicas é definida como:
     ```ts
     export type AddonCapability =
       | 'auth'
       | 'dataSource'
       | 'watcher'
       | 'calendar'
       | 'punch'
       | 'theme'
     ```
   - A compatibilidade de cada addon com o Core passa a ser regida estritamente por `requiredApiVersion`, dispensando `contractVersion` por item de capacidade.

2. **Injeção Direta de Capacidades em Predicates Puros:**
   - Tipos, constante e predicates possuem uma implementação única em `@mr-tick/shared/helpers` e são expostos pelo `@mr-tick/sdk`. As camadas inferiores consomem shared diretamente, evitando dependência circular com o SDK:
     ```ts
     export function hasCapability(
       capabilities: readonly AddonCapability[] | undefined | null,
       capability: AddonCapability,
     ): boolean

     export function isDataSource(
       capabilities: readonly AddonCapability[] | undefined | null,
     ): boolean

     export function isWatcher(
       capabilities: readonly AddonCapability[] | undefined | null,
     ): boolean

     export function isTheme(
       capabilities: readonly AddonCapability[] | undefined | null,
     ): boolean
     ```

3. **Desacoplamento de Conexões e DataSources na Aplicação:**
   - Conexões (`connections`) representam todas as contas externas autorizadas no workspace.
   - Conexões de Fontes de Dados (`dataSourceConnections`) representam exclusivamente aquelas cujo addon possui a capacidade `dataSource` (`isDataSource(conn.addon?.capabilities)`).
   - O `SyncProvider` e o `Header` passam a operar estritamente sobre `dataSourceConnections`.
   - Telas de atribuição e busca de tarefas (`task-lookup`, `task-popover`) utilizam apenas `dataSourceConnections`.

## Consequências
- Fim de verificações redundantes ou comparadores case-insensitive (`includes('Watcher') || includes('watchers')`).
- Addons utilitários e watchers (como o Discord Presence) não entram mais na esteira de sincronização de banco de dados do Core nem geram ruído na interface do usuário.
- Modelo mental limpo, extensível e orientado a contratos no SDK.

## Validação nas fronteiras

- O catálogo e o loader de disco aceitam exclusivamente listas não vazias de capacidades canônicas, sem descritores, aliases ou duplicatas. Manifestos inválidos não são reinterpretados como fontes de dados.
- A CLI não infere `dataSource` quando faltam capacidades; o wizard exige seleção explícita e o validador recusa listas ausentes, vazias ou duplicadas.
- `AddonManifest` do bridge segue o mesmo contrato readonly dos DTOs e ViewModels.
- A alteração de capacidades não flexibiliza o contrato HTTP: respostas externas continuam exigindo `responseValidator` antes de serem usadas como tipos de domínio.

## Autenticação como capacidade explícita

`auth` declara que o addon oferece conexões de contas. É independente de `dataSource`, `watcher` e das demais capacidades: Redmine combina `auth` e `dataSource`; Discord combina `auth` e `watcher`; um tema sem contas declara somente `theme`.

Todos os perfis e autenticadores são registrados por `contributions.connections`. O loader exige `auth`, valida os perfis na fronteira e retorna `Either<AppError, void>` nos registros. `IDataSource` e `IDataSourceResolver` não fornecem perfis; não existe fallback de autenticação para datasource. O ciclo de registro e limpeza de conexões é independente do registro de providers de dados.

O core mantém identidade, cardinalidade, PKCE, tentativas OAuth, renovação e cofre. O contrato não possui `method: 'none'`: addons sem autenticação não registram autenticadores nem conexões anônimas. Addons sem contas não precisam de perfis nem exibem a seção de autenticação. A declaração não constitui isolamento de segurança do código do addon.

Essa evolução exige a linha 0.11 do SDK. Publicar o SDK e o desktop compatível precede a distribuição dos addons atualizados; os manifestos de pacotes já publicados não são reescritos como se tivessem sido recompilados.

## Schema de conexão independente do datasource

O addon registra os campos de cada perfil com `contributions.connections.registerSchema(connectionProfileId, schema)`, após `registerProfiles`. O loader exige `auth` e remove o schema no encerramento do addon ou dos perfis. A consulta no bridge exige `addonId` e `connectionProfileId`; perfil sem schema produz erro explícito. Schema vazio é permitido para OAuth sem entrada manual.

`IDataSource` fornece apenas a criação dos providers e os campos de mapeamento. Não fornece mais `getConnectionSchema`. Os campos de conexão usam `scope: 'credential'` para segredos; a ausência de scope significa configuração, independentemente do nome de aba ou campo. Nenhum consumidor infere credenciais por uma aba chamada `credentials`.

O gerenciador de conexões e o formulário são compartilhados por addons com `auth`, sem exigir `dataSource`. Uma aba explícita `kind: 'auth'` de settings preserva a apresentação própria do addon (por exemplo, a ação OAuth do Discord); na ausência dela, o caminho auth usa o formulário do perfil registrado. O gerenciador usa o autenticador padrão declarado no perfil ou no seu único papel de autorização; múltiplos papéis e autenticadores sem padrão exigem seleção explícita, sem inferir um ID a partir do connectionProfileId.

### Publicação e limites de validação

A remoção de `IDataSource.getConnectionSchema` e a substituição dos exports de formulário são quebras de contrato registradas em changeset, sem alteração manual de versões. Publicar primeiro SDK/core compatíveis. Só depois atualizar as dependências e locks dos addons pelo Yarn e gerar novos manifestos/artefatos pela CLI oficial. Os manifestos e locks publicados da linha 0.11 não demonstram compatibilidade com o novo método; a migração de fontes Redmine/Discord foi validada com SDK local vinculado, não com uma versão nova já publicada.

As provas desta refatoração cobrem registry/lifetime/handler, escopo explícito dos campos, integração UI de auth+watcher com perfil/autenticador de IDs distintos, preservação de ação OAuth própria, testes dos addons e jornada Electron com provider fake. Não demonstram uma nova autorização OAuth real, instalação limpa de release nem garantias novas do provedor remoto.
