# Local Runtime Subcontext (`services/local-runtime`)

O **Coração Determinístico Local-First** do Mr. Tick. Responsável por orquestrar o ciclo de vida do cronômetro (timer), enfileirar comandos locais e mediar resoluções de conflitos sem bloqueio de rede.

## 🎯 Responsabilidades

- **Fila Serializada por Workspace:** Enfileira comandos sequenciais (`tails.get(workspaceId)`) garantindo que duas ações simultâneas não colidam em estado inconsistente.
- **Máquina de Estados do Timer:** Controla rigorosamente as transições `start` -> `pause` -> `resume` -> `stop`.
- **Cálculo Determinístico de Tempo:** Computa com precisão de milissegundos o tempo decorrido (`timeSpentSeconds`) e os períodos de pausa acumulados (`pauseSeconds`).
- **Resolução de Conflitos e Identidade:** Trata apontamentos criados offline que ainda não possuem ID remoto, preservando a intenção de criação ou alteração do usuário.

## 📦 Componentes Contidos

| Arquivo | Responsabilidade |
| :--- | :--- |
| `LocalRuntime.ts` | Ponto de entrada de requisições e comandos (`ILocalRuntimeAPI`), gerenciador de executores e fila por workspace |
| `local-runtime-rules.ts` | Regras puras e imutáveis de transição de comandos (planning de comandos, cálculo de tempo e status do timer) |
| `local-time-entry-identity.ts` | Helpers de identidade e estado remoto (detecção de operações pendentes, conflitos e sanitização de IDs) |

## 🛡️ Invariantes e Regras de Negócio

1. **Zero Bloqueio de Rede:** O `LocalRuntime` responde com latência local imediata. Nenhuma chamada de rede síncrona é permitida dentro deste motor.
2. **Idempotência por `commandId`:** Comandos reenviados com o mesmo `commandId` não geram novos apontamentos nem reiniciam timers duplicados.
3. **Imutabilidade de Regras:** O cálculo de tempo e as transições em `local-runtime-rules.ts` são funções puras e determinísticas, testáveis sem qualquer mock de persistência ou SO.
4. **Respeito à Manutenção:** Se um workspace estiver em processo de manutenção/migração, novos comandos são rejeitados com `WORKSPACE_MAINTENANCE` de forma segura.

## 🚫 O que NÃO deve ficar aqui
- Chamadas a APIs externas (pertencem a `sync/` e aos addons).
- Consultas diretas ao cofre do sistema (pertencem a `connections/`).
- Código acoplado a Electron, IPC ou APIs do navegador (o runtime é agnóstico e opera via contratos).
