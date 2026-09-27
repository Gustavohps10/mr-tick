---
'@mr-tick/desktop': minor
'@mr-tick/ui': minor
---

fix(mapping): resolve campo de mapeamento pós-autenticação via instância ativa de datasource

Corrige falha arquitetural onde `getMappingFields` era chamado antes da autenticação,
retornando sempre uma lista vazia pois o `IDataSource` estático não possui contexto de
credenciais ou URL do servidor remoto.

**Mudanças:**
- `IAddonsAPI.getMappingFields` agora aceita `workspaceId` e `connectionInstanceId` opcionais
- `AddonsHandler.getMappingFields` prioriza resolver a instância autenticada via `IDataSourceResolver`
  quando `workspaceId` + `connectionInstanceId` estão presentes; mantém fallback para addons estáticos
- `MappingConfigModal` propaga `workspaceId` e `connectionInstanceId` para o backend
- `AddonFieldRenderer` e `MappingFieldItem` propagam os props de contexto de conexão
- `DataSourceConnectionsContext` expõe `workspaceId` no contrato do contexto
- `DataSourceInstancesManager` exibe botão "Configurar Mapeamento" por instância **conectada**,
  abrindo o `MappingConfigModal` com o contexto correto de autenticação
