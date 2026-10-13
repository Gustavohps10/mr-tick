---
"@mr-tick/sdk": patch
"@mr-tick/shared": patch
"@mr-tick/domain": patch
"@mr-tick/application": patch
"@mr-tick/adapters": patch
"@mr-tick/ui": patch
"@mr-tick/desktop": patch
---

Adiciona ecossistema Mr. Tick Plus fim a fim: suporte ao tier `plus`, hash `sha256`, `size` e assinatura Ed25519 de pacotes `.tladdon` no `@mr-tick/sdk`, verificação offline/online de licença (`lic-2026-01`) e pacotes assinados (`cat-2026-01`), download autenticado no Cloudflare R2 com validação SHA-256, deep link `mistertick://activate?key=...` no Electron e interface de ativação e badges Plus na loja e página de addons.
