---
'@mr-tick/ui': patch
---

Garante que o TitleBar permaneça em camada prioritária absoluta (z-[100]) e com pointer-events-auto explícito em seus controles para manter estados de hover e cliques ativos mesmo com diálogos e modais abertos, ajusta backdrops/overlays para iniciarem abaixo do topo (top-9), e aplica filtro sutil de luminosidade balanceado por tema (brightness-[0.97] no modo claro e dark:brightness-90 no modo escuro).
