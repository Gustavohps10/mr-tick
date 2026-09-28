---
'@mr-tick/application': patch
'@mr-tick/desktop': patch
'@mr-tick/ui': patch
---

Desacopla a verificação de compatibilidade de addons da versão do executável Desktop, introduzindo a rota `bridge.system.getSdkVersion()` que resolve dinamicamente a versão da API suportada a partir do `@mr-tick/sdk`.
