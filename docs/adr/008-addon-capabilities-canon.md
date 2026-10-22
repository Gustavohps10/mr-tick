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
