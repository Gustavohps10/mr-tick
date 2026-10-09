# ADR 001 — Runtime local por capacidades

Data: 2026-10-08. Decisão de implementação, validada por blocos de entrega.

## Responsabilidades

O runtime lógico não depende de React, Electron, DOM, IndexedDB ou RxDB. Contratos e regras de apontamentos/timer/sugestões ficam em application, expostos por subpath local-runtime. A composição inicial roda em renderer dedicado, usando RxDB/IndexedDB por decisão de custo; não exige plugin pago.

Main hospeda addons, providers, credenciais e projeções nativas. React mantém formulários, drafts e cache visual. UI e SDK compartilham capacidades públicas. A entrada interna de persistência UI preserva snapshots completos e não é exposta ao SDK. Provider remoto pull/push não é CRUD local público.

O registry identifica workspaces independentemente da rota. Somente o executor grava apontamentos/timer/sugestões e inicia sua replicação. Leitores RxDB na UI são uma ponte de migração, sem replicadores/gravação de horas; não representam a superfície final portátil de leitura. Configuração de automações e Kanban continua fora deste cutover: não declarar autoridade única sobre todas as coleções do banco.

## Transporte e contexto

Comandos usam contexto explícito e identidade estável de operação, separada de request ID e correlação de criação remota. Resultado funcional é convertido a envelope serializável; métodos/protótipos Either não atravessam IPC.

Geração do executor invalida replies e projeções antigas. Readiness significa inicialização/recuperação concluídas, sem delays artificiais. Deadlines de transporte encerram a espera do chamador; não cancelam o efeito nem substituem ordenação. Em reset/drop, o ledger mantém a requisição e a barreira de manutenção até resposta efetiva do executor ou invalidação de geração. Eventos posteriores ao commit são separados de comandos de escrita. Timer persistido é autoridade; relógio/tray é projeção por workspace.

SDK publica um subconjunto explícito de operações por capacidades. As capacidades presentes em AddonContext são disponibilizadas ao addon carregado; isso não implica autorização granular por workspace ou concessões de manifesto já implementadas. Ele não expõe banco, snapshots internos de sincronização, container ou cofre inteiro. Addon no mesmo processo continua código executável e não constitui sandbox forte. Validação de workspace/instância e origem do addon é responsabilidade do host e executor.

## Persistência e deduplicação

Receipts usam IndexedDB nativo em banco separado por workspace, evitando dependência direta conflitante de Dexie. Sucesso da gravação de receipt depende de transaction.oncomplete, não apenas do sucesso de um request.

Schema de apontamentos evolui de versão 0 para 1 com lastLocalCommandId opcional. O plugin migration-schema distribuído no RxDB instalado executa estratégia identidade preservando dados. Incompatibilidade DB6 não apaga banco automaticamente.

Intenção prepared contém fingerprint anterior, snapshot posterior e identidade estável. O snapshot posterior grava o marcador no mesmo documento da mutação. Recuperação reconhece marcador mesmo após confirmação remota alterar metadados, ou verifica precondição antes de aplicar intenção. Não presume transação atômica entre banco de receipts e RxDB. Concorrência que invalida a precondição deve produzir rejeição durável sem anunciar sucesso ou reexecutar cegamente.

Origem, partição, userData e nomes dos bancos existentes permanecem estáveis. Migração deve preservar IDs, journal, creation/confirmation state, tombstones, checkpoints e identidade das replicações. Reset/drop precisa coordenar executor, leitores, receipts e metadados do workspace. A barreira cobre todo o ciclo, incluindo fechamento de leitores: CRUD público, persistência privada e uma segunda manutenção são rejeitados antes de liberar leitores. Uma resposta tardia pode concluir a manutenção depois do deadline; apenas a conclusão real ou invalidação permite reabrir os leitores.

## Espera remota e disponibilidade local

A fila de comandos locais serializa mutações e recuperação de receipts. Operações de sincronização manual usam outra fila por workspace: a espera de forceSync/reconcile por um provider não impede CRUD, timer ou consulta de status local. A replicação continua com um único dono; os updates remotos mantêm os controles de concorrência por documento existentes.

Reset/drop/close fecham a entrada e aguardam operações remotas já admitidas antes de destruir o banco ou executor. O deadline do transporte não libera esse lease. Um provider que nunca responde pode adiar a manutenção/encerramento; não se declara cancelamento remoto que a infraestrutura não oferece. Evoluir cancelamento requer propagá-lo até o provider e confirmar que nenhuma escrita tardia continua possível.
## Evolução de ambiente

Mover somente RxStorage ao main é diferente de mover RxDatabase, replicação e runtime completos. A segunda opção exige nova composição e adaptadores compatíveis. Backend REST local inicial depende do renderer executor vivo; backend Node autônomo exige armazenamento apropriado e migração validada.

Futuro cutover de ambiente interrompe e coordena escritas, valida backup/import, preserva dedup/checkpoints ou planeja resync seguro, ativa um novo executor e aposenta o anterior. Os contratos e regras portáveis são reaproveitados; a infraestrutura não é automaticamente compatível.

## Critérios de validação

Verificar renderer dedicado com dados reais, autoridade única de horas, SDK operando persistência real, contexto fora da rota ativa, journal de timer, geração após reload, respostas perdidas, dedup após confirmação remota, reset coordenado e UI otimista com ID estável. Existência de E2E anterior não comprova esses limites novos.

Arquiteto registra decisões e revisa limites; coder e integrador implementam seus arquivos; revisor verifica evidências e mantém checklist de sincronização/idempotência quando aplicável. Aprovação de um plano não equivale a aprovação de toda implementação.

## Migração de addons e consumidores

Os contratos anteriores de timer/apontamentos não são mantidos como compatibilidade. O SDK reexporta ITimeEntriesAPI e ITimerAPI como aliases das capacidades públicas comuns. Um addon precisa selecionar workspace e conexão explicitamente; não herda a página aberta. Cada mutação recebe identidade estável fornecida pelo chamador.

Exemplo de criação, usando IDs obtidos do contexto/tarefa selecionados:

```ts
const operation = { commandId: crypto.randomUUID(), entryId: crypto.randomUUID() }
const result = await context.timeEntries.create(workspaceId, {
  connectionInstanceId,
  dataSourceId,
  taskId,
  activityId,
  timeSpentSeconds: 1800,
  comments: 'Documentação revisada',
}, operation)
```

Guardar operation junto à intenção antes da chamada. Se a resposta for perdida, repetir a mesma chamada com a mesma identidade e o mesmo conteúdo. Não gerar novo commandId/entryId para o retry. Usar a mesma identidade com conteúdo diferente é erro; uma edição intencional usa novo commandId e mantém entryId do registro.

```ts
const pauseOperation = { commandId: crypto.randomUUID(), entryId: activeEntry.entryId }
const paused = await context.timer.pause(workspaceId, pauseOperation)
```

start recebe workspaceId, LocalTimerInput e operation; pause/resume/stop recebem workspaceId e operation. UI usa localRuntime e a fachada interna de persistência quando precisa preservar snapshot completo. bridge.timer.start/pause/resume/stop não são o caminho de operações de negócio novo.

Os exemplos representam chamadas do contrato, não uma promessa de envio remoto imediato. Verificar Either antes de usar o resultado. Uma aplicação consumidora externa precisa compilar usando somente o SDK distribuído, sem paths do monorepo nem pacotes privados disponíveis por acidente; o build das declarações deve incorporar os contratos necessários.
