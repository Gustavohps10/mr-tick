# Inspeção real do workspace 1 — 10/11/2026

O workspace `teste` (`ws-76149702-7e62-4521-87cd-c3b9337f3e95`) foi aberto no Electron em debug por CDP. O Analytics reproduziu `ANALYTICS_STORAGE_FORMAT_UNSUPPORTED` junto a controles de criação/sincronização e a um canvas apresentado como vazio.

Uma cópia do arquivo analítico e de seu WAL foi lida em modo somente leitura: `analytics_format.version = 1`. O runtime canônico exige formato 2. Recusar esse formato é comportamento deliberado; não foi acrescentada compatibilidade, migração nem exclusão automática. A base original permanece sob gestão do usuário.

## Falhas reproduzidas e correções

- F4-B01: hidratação com erro marcava a UI como pronta, embora a persistência continuasse desabilitada. A página agora exibe estado de erro bloqueante, detalhes originais e retry explícito. Durante a leitura exibe skeleton, sem apresentar dados padrão como carregados.
- A regressão de hook confirmou também uma gravação com espaços padrão após erro de parsing dos espaços persistidos. O parsing agora encerra a hidratação antes de habilitar persistência. O E2E com estado inválido confere que a string original permanece salva.
- O erro de formato retorna `storagePath`, `storedFormatVersion` e `supportedFormatVersion` na infraestrutura. A UI consome esses detalhes diretamente, sem mapear mensagens por chave.
- O comando raiz `dev:desktop:debug` falhava porque `dev:debug` não estava registrado no Turbo. O task foi adicionado com o mesmo ciclo de build/watch de desenvolvimento; o dry-run passou.

## Evidências

Diretório: `C:/Users/Gustavo/.codex/visualizations/2026/11/09/01a1c0d8-d37a-7de1-b570-4c956015260e`.

- Repro live: `analytics-live-workspace1.png`; cópia somente leitura em `live-workspace1-storage`.
- Vermelhos: `analytics-storage-ui-red.log` (duas falhas comportamentais); `analytics-storage-e2e-red.log` (dois cenários reais de UI/IPC/native em userData isolado); `analytics-debug-launcher-red.log`.
- Verdes específicos: `analytics-storage-ui.log` (60 testes), `analytics-storage-e2e-green.log` (2/2), `analytics-debug-launcher-green.log`.
- Checks: `analytics-storage-core.log` (96 aprovados e um benchmark condicionado pulado), `analytics-storage-lint.log` (zero erros/108 avisos existentes) e `analytics-storage-checks.log` (15/15 tarefas).

Os testes com formato 1 e JSON inválido usam arquivos de fixture, não modificam a base real. O E2E vermelho comprova o estado incorreto de UI; a escrita indevida após parsing foi reproduzida no hook com bridge controlada, sem apresentá-la como perda de dados já ocorrida no workspace real.

Revisão independente, regressão integral e conferência visual posterior à correção em fechamento. O percurso completo de extração no workspace real depende de disponibilizar uma base canônica; qualquer arquivamento da base existente exige decisão explícita do usuário.
