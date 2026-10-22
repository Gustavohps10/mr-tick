---
"@mr-tick/sdk": minor
"@mr-tick/application": minor
"@mr-tick/adapters": minor
"@mr-tick/shared": minor
"@mr-tick/ui": minor
"@mr-tick/desktop": minor
---

Padronização canônica das capacidades de addons em todo o ecossistema Mr. Tick:
- Substituição integral de categorias (`category`/`categories`) e descritores legados por `capabilities: AddonCapability[]` (`'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'`).
- Remoção definitiva de união de tipos (`AddonCapability | AddonCapabilityDescriptor`) mantendo uma única fonte da verdade estrita.
- Simplificação do versionamento de contratos centralizado na compatibilidade SemVer do SDK, eliminando micro-versionamento per-capability (`contractVersion`).
- Helpers canônicos centralizados em `@mr-tick/shared/helpers` e reexportados pelo SDK (`hasCapability`, `isDataSource`, `isWatcher`, `isTheme`).
- Limpeza de fallbacks cegos PascalCase e categorias legadas nos utilitários da CLI (`manifest`, `sync`, `pkg`, `validate`).
- Atualização e alinhamento dos serviços de aplicação (`ImportAddonService`, `UpdateAddonService`), adaptadores (`AddonsFacade`), UI (`SyncProvider`, modais e componentes de tarefas) e runtime desktop (`AddonLoader`, ciclo de vida e dispatch de provedores).
