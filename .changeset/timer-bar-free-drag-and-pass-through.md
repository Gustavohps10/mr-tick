---
'@mr-tick/ui': patch
---

Aprimora a Timer Bar em modo widget (janela flutuante transparente):
- Adiciona seletor de Orientação (Horizontal / Vertical) nas configurações em substituição à bússola de ancoragem (restrita ao modo workspace).
- Habilita arrasto 2D bidimensional livre sem travas em um único eixo, com clamping responsivo às bordas.
- Blinda a transparência de cliques contra o bloqueador fantasma via MutationObserver para fechamento de overlays/portais Radix, detecção precisa de eventos globais de ponteiro e garantia de inicialização com repasse de mouse events.
- Adiciona suíte de testes de componentes cobrindo 100% dos cenários de orientação, arrasto 2D e transparência de cliques.
