---
'@mr-tick/desktop': minor
'@mr-tick/ui': minor
---

feat: adiciona popover tri-modo compacto (lista, semanal, mensal) na barra de tempo e melhorias visuais

- **Popover Tri-modo de Apontamentos:** Alternador dinâmico entre visualização em Lista, Semanal e Mensal diretamente na barra de tempo (`Overview`), com suporte a DnD e persistência de ordenação no widget.
- **Desacoplamento de Range:** Isolamento total dos períodos semanal e mensal em relação aos parâmetros da URL (`ignoreUrlRange: true`), garantindo navegação independente e sem interferência mútua.
- **Identidade Visual e Anti-fundo:** Botão de adição em grupo mestre atualizado para o componente Link (`variant="link"`) com cor semântica `text-foreground` / `hover:text-foreground/80` adaptável a temas claro e escuro.
- **Padronização Visual nas 3 Visões:** Substituição de marcadores genéricos por `<DataSourceLogo />` e ícones mapeados de trackers (`TrackerIconComponent`), além da remoção de nomes brutos de datasource e exibição limpa do chip `#ID - Título` com tooltip de hover.
- **Estabilidade de Layout:** Calibração dos inputs triplos de tempo no modo compacto prevenindo corte de dígitos, preservação da coluna de sincronização e rolagem vertical suave nas tabelas.
