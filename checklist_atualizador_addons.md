# Checklist — Atualizador de Addons & Notificação de Versão

Este documento registra o trabalho de planejamento, testes determinísticos, implementação e auditoria do sistema de atualização e compatibilidade de addons.

---

## 🎯 Escopo da Entrega
1. **Detecção de Atualização (`updateAvailable`):**
   - Comparação semântica de versões (`SemVer`: `localVersion < remoteVersion`).
   - Verificação de compatibilidade (`remote.requiredApiVersion <= hostSdkVersion`).
2. **Serviço de Atualização com Hot-Reload Gracioso:**
   - Desativação em memória do addon atual (`AddonLoader.deactivateAddon`).
   - Backup temporário dos arquivos locais (`<addonId>.backup`).
   - Download e extração do novo pacote compactado.
   - Carregamento e ativação da nova versão em memória (`AddonLoader.loadAndActivateFromDisk`).
   - **Rollback Atômico:** Em caso de falha de inicialização da nova versão, restaurar a pasta `.backup` e reativar a versão antiga.
3. **Notificação de Nova Versão na UI:**
   - Emissão de evento / badge visual quando um addon instalado tiver nova versão compatível disponível no catálogo.
   - Diálogo com notas de atualização (changelog) e botão de "Atualizar Agora".

---

## 📋 Itens de Trabalho (Fluxo Vermelho ➔ Verde ➔ Auditoria)

- [x] **Item 1: Detecção e Comparação de Versões Disponíveis**
  - **Gravidade:** Média
  - **Cenário:** Addon instalado na versão `0.7.0`, catálogo remoto oferece `0.8.0` compatível com o host.
  - **Critério de Aceitação:** `AddonItem` ou `AddonManifestDTO` retorna `updateAvailable: true`, `latestVersion: '0.8.0'` e `downloadUrl` do pacote mais recente.
  - **Status do Teste:** Aprovado (`AddonsFacade.spec.ts`).

- [x] **Item 2: Trava de Incompatibilidade de Versão na Atualização**
  - **Gravidade:** Alta
  - **Cenário:** Catálogo remoto possui versão `1.0.0` de um addon, mas ela exige `requiredApiVersion: 2.0.0` (incompatível com o host atual `1.0.0`).
  - **Critério de Aceitação:** Não sinalizar `updateAvailable: true` para instalação automática que quebraria o app; indicar `incompatible: true` com a versão necessária informada.
  - **Status do Teste:** Aprovado (`AddonsFacade.spec.ts`).

- [x] **Item 3: Fluxo de Atualização com Backup e Rollback Atômico**
  - **Gravidade:** Crítica
  - **Cenário:** Usuário dispara atualização; se a extração ou ativação da nova versão falhar, o sistema restaura o backup imediatamente sem corromper o addon existente.
  - **Critério de Aceitação:** Sucesso ➔ addon atualizado para a nova versão e pasta `.backup` removida. Falha ➔ addon anterior restaurado e ativo, retornando `Either.failure(AppError)`. Injeção estrita de dependências sem `?:` via `IAddonReloader`.
  - **Status do Teste:** Aprovado (`UpdateAddonService.spec.ts` e `AddonsFacade.spec.ts`).

- [x] **Item 4: Integração no Handler IPC e Notificação na UI**
  - **Gravidade:** Média
  - **Cenário:** O canal `addon:update` executa o job de atualização reportando progresso via `jobEmitter`. Notificação toast ativa quando há versões compatíveis mais recentes.
  - **Critério de Aceitação:** UI recebe eventos de download, extração, conclusão e exibe feedback via Toast e refresh da lista de addons ao clicar em "Atualizar plugin".
  - **Status do Teste:** Aprovado (`yarn typecheck` 14/14 pacotes e `yarn lint:fix` 0 erros).

- [x] **Item 5: Teste E2E Playwright Automatizado com Dados Mockados**
  - **Gravidade:** Alta
  - **Cenário:** Testar no Electron real com Playwright os cenários de: (1) Happy path com detecção de versão, badges visuais, toasts de notificação e disparo de IPC `ADDONS_UPDATE`; (2) Rollback/falha simulada com renderização de toast de erro.
  - **Critério de Aceitação:** `yarn --cwd src/apps/desktop test:e2e addons-updater.e2e.spec.ts` executado com 2/2 testes aprovados.
  - **Status do Teste:** Aprovado (`src/apps/desktop/e2e/addons-updater.e2e.spec.ts` 2 passed em 7.1s).
