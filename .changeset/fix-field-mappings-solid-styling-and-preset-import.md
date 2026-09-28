---
'@mr-tick/desktop': patch
'@mr-tick/ui': patch
---

fix(ui): solid styling for activity badges, preset import with empty colors, and mapping reflection

- Corrige estilização de badges de atividade para utilizar cor de fundo 100% sólida e opaca (`color-mix` sRGB), eliminando vazamento visual/transparência de itens inferiores em agrupamentos sobrepostos.
- Torna o importador de presets flexível para aceitar definições com campos de cor vazios (`color: ""`).
- Ajusta botão de exportação no `MappingConfigModal` para iniciar com o rótulo "Copiar JSON" e permitir cópia manual ou sob clique.
- Atualiza componentes de visualização (`time-entries-table-columns`, `calendar-view`, `timesheet-view`, `task-lookup`) para refletir mapeamentos dinâmicos salvos no `localStorage`.
- Adiciona testes unitários abrangentes e testes E2E Playwright no Electron validando importação de preset com 20 campos, exportação e persistência.
