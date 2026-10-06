---
"@mr-tick/application": patch
"@mr-tick/desktop": patch
"@mr-tick/ui": patch
---

Resolução determinística de workspace no boot via busca por ID na seleção persistida sem limite de paginação (TB-003), ciclo de prontidão assíncrona nas views semanal e mensal prevenindo falso vazio (TB-004), tratamento de interrupções de arraste por pointercancel, lostpointercapture e blur com retenção do deslocamento (TB-005), overlay nativo Win32 não ativável com pré-build e harness C++/SendInput para auditoria de click-through, foco e hover; e testes E2E de paridade bi-janelar e performance (POP-01, POP-05, POP-06).
