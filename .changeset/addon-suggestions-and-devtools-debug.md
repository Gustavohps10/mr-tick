---
"@mr-tick/desktop": patch
"@mr-tick/ui": patch
---

Melhorias no ciclo de vida de addons, sugestões de apontamento e suporte a depuração remota:
- Suporte a depuração remota no Electron via porta 9333 (`dev:debug`) e ferramenta `app:inspect`.
- Sincronização imediata do workspace ativo ao inicializar addons instalados no `AddonLoader`.
- Badges dinâmicos com ícones oficiais de addons (Discord e genéricos) na tabela e no banner de sugestões.
- Ajuste de espaçamentos nas colunas e no popover de seleção de tarefa na tabela de apontamentos.
