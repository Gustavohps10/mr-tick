---
"@mr-tick/application": minor
"@mr-tick/adapters": minor
"@mr-tick/shared": minor
"@mr-tick/ui": minor
"@mr-tick/desktop": minor
---

Implementação do atualizador automático de addons com hot-reload gracioso e rollback atômico:
- Detecção semântica de novas versões disponíveis e validação de compatibilidade com a versão da API do Host.
- Hot-reload com desativação em memória, backup temporário e restauração automática (rollback) em caso de falha de ativação da nova versão.
- Injeção estrita de dependências sem parâmetros opcionais (`?:`) no IoC/DI.
- Interface visual no Gerenciador de Addons com abas dedicadas, badges de versão, toasts informativos e disparo de atualização.
- Cobertura completa com testes unitários e suíte E2E automatizada no Playwright com Electron.
