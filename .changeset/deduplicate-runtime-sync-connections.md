---
'@mr-tick/desktop': patch
'@mr-tick/ui': patch
---

Deduplica conexões e reconciliações simultâneas no runtime de sincronização:
- `DataSourceResolver`: reutiliza instâncias de adaptadores em cache por assinatura de credencial/configuração e deduplica resoluções em voo com single-flight.
- `createSyncStore`: torna `connectDataSource` idempotente evitando reinicialização destrutiva de módulos de replicação por múltiplas janelas (janela principal e widget) e previne execuções concorrentes de `reconcile`.
