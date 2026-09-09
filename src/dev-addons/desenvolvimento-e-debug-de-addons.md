# 🧩 Guia de Desenvolvimento e Depuração de Addons (Mr-tick)

Este documento descreve a arquitetura de desenvolvimento desacoplada para extensões (addons) do **Mr-tick**, utilizando links simbólicos (**symlinks/junctions**) para permitir compilação rápida, isolamento de dependências e depuração direta (**debug com breakpoints e sourcemaps**).

---

## 1. Visão Geral da Arquitetura

Para manter o monorepo leve e a aplicação de produção completamente desacoplada de código de teste ou mock, os addons de desenvolvimento residem nesta pasta:

```text
src/dev-addons/
├── README.md
├── desenvolvimento-e-debug-de-addons.md
├── datasource-fake/
├── discord-for-tests/
├── fake-watcher-for-tests/
├── metric-ai-for-tests/
├── purple-theme/
├── redmine-for-tests/
└── supabase-theme/
```

- **Pasta Desacoplada**: A pasta `src/dev-addons` tem seus pacotes internos ignorados no `.gitignore` (mantendo apenas as documentações `.md`) e não faz parte dos `workspaces` do monorepo.
- **Armazenamento Nativo de Addons**: O Mr-tick carrega extensões instaladas a partir do diretório de dados do usuário (`userData`):
  - **Windows**: `%APPDATA%\mr-tick\addons\` (ex: `C:\Users\<Usuario>\AppData\Roaming\mr-tick\addons\`)
  - **macOS**: `~/Library/Application Support/mr-tick/addons/`
  - **Linux**: `~/.config/mr-tick/addons/`
- **Link Simbólico (Symlink / Junction)**: O script de automação conecta uma pasta de `src/dev-addons/<addon>` diretamente para a pasta de addons do Mr-tick. O aplicativo reconhece o addon como instalado fisicamente no disco.

```text
┌──────────────────────────────────────────────┐
│        Código Fonte de Desenvolvimento       │
│  src/dev-addons/purple-theme/                │
│  ├── manifest.yaml                           │
│  ├── src/index.ts                            │
│  └── dist/index.js (com index.js.map)        │
└──────────────────────┬───────────────────────┘
                       │
             Symlink / Junction
                       │
                       ▼
┌──────────────────────────────────────────────┐
│          Mr-tick Runtime (userData)          │
│  %APPDATA%/mr-tick/addons/@mr-tick_purple... │
│  (Lido nativamente pelo AddonsFacade)        │
└──────────────────────────────────────────────┘
```

---

## 2. Gerenciador de Addons Dev (`scripts/dev-addons.ts`)

Os comandos são agnósticos a qualquer package manager (**npm**, **yarn**, **pnpm** ou **bun**):

### 📋 Listar Addons
Exibe todos os addons locais e se já estão linkados ao Mr-tick:
```bash
npm run addon:list   # ou yarn addon:list / pnpm addon:list / bun run addon:list
```

*Exemplo de saída:*
```text
STATUS     | NOME                      | ID                             | PASTA                 
-----------------------------------------------------------------------------------------------
✅ LINKED   | DataSource Fake (Testes)  | mr-tick-datasource-fake        | datasource-fake       
✅ LINKED   | Purple Neon               | @mr-tick/purple-theme          | purple-theme          
❌ UNLINKED | Supabase Emerald          | @mr-tick/supabase-theme        | supabase-theme        
```

### 🔗 Linkar Addon(s)
Cria o link simbólico na pasta de addons do Mr-tick:
```bash
# Linkar um addon específico:
npm run addon:link purple-theme

# Linkar todos os addons encontrados:
npm run addon:link all
```

### 🧹 Deslinkar Addon(s)
Remove o link simbólico com segurança (sem apagar os arquivos de origem):
```bash
# Deslinkar um addon específico:
npm run addon:unlink purple-theme

# Deslinkar todos:
npm run addon:unlink all
```

### 🔨 Compilar com Source Maps
Gera a pasta `dist/` com bundle CJS/ESM e mapa de fontes (`.map`) para depuração:
```bash
# Compilar um addon:
npm run addon:build purple-theme

# Compilar todos os addons:
npm run addon:build all
```

### ⚡ Monitorar em Tempo Real (`watch`)
Deixa o compilador rodando em segundo plano. Qualquer alteração em `src/` recompila o addon instantaneamente:
```bash
npm run addon:watch purple-theme
```

---

## 3. Estrutura Padrão de um Addon

Cada pasta dentro de `src/dev-addons/<nome-do-addon>` deve conter minimamente:

### A. `manifest.yaml`
Metadados essenciais para o Mr-tick identificar a categoria, versão e recursos do plugin:
```yaml
AddonId: '@mr-tick/meu-addon'
Version: 1.0.0
Category: Themes # Opções: Themes | DataSources | Watchers | Punch
Name: Meu Addon
Author: Mr-tick
ShortDescription: Descrição curta para listagem na interface.
Description: Descrição completa detalhando o funcionamento do addon.
Tags:
  - teste
  - desenvolvimento
```

### B. `src/index.ts`
Implementação da interface `IAddon` do `@mr-tick/sdk`:
```typescript
import type { AddonContext, AddonSettingsSchema, IAddon } from '@mr-tick/sdk'

export default class MeuAddon implements IAddon {
  private context: AddonContext | null = null

  activate(context: AddonContext): void {
    this.context = context
    console.log(`[MeuAddon] Ativado com ID: ${context.addonId}`)
  }

  deactivate(): void {
    console.log('[MeuAddon] Desativado')
  }

  async getSettingsSchema(): Promise<AddonSettingsSchema> {
    return []
  }

  async executeAction(actionId: string): Promise<unknown> {
    console.log(`[MeuAddon] Executando ação: ${actionId}`)
    return { isSuccess: true }
  }
}
```

---

## 4. Guia de Depuração (Debug)

O uso de symlinks preserva os **Source Maps** (`.js.map`), o que possibilita depurar o código TypeScript original sem intermediários.

### Depuração do Processo Renderer (Interface, Menus, Modais)
1. Inicie o Mr-tick no modo de desenvolvimento:
   ```bash
   npm run dev:desktop
   ```
2. Abra as Ferramentas do Desenvolvedor do Chromium no app:
   - Pressione **`Ctrl + Shift + I`** (Windows/Linux) ou **`Cmd + Option + I`** (macOS).
3. Vá até a aba **Sources**:
   - Pressione `Ctrl + P` para buscar arquivos.
   - Digite o nome do arquivo TypeScript do seu addon (ex: `index.ts` ou `purpleCss.ts`).
4. Coloque **Breakpoints** clicando na numeração da linha.
5. Dispare a ação no app (ex: clique no botão do addon ou altere um tema). O Chromium pausará a execução diretamente no seu código TypeScript.

---

### Depuração do Processo Principal (Node.js Main Process)
Se o addon executa lógica em background, integração com sockets, pipes locais ou chamadas de sistema:
1. Inicie o desktop com a flag de inspeção:
   ```bash
   npm run dev:desktop -- --inspect=9229
   ```
2. No VS Code, utilize uma configuração de depuração `launch.json`:
   ```json
   {
     "type": "node",
     "request": "attach",
     "name": "Attach to Mr-tick Main",
     "port": 9229,
     "restart": true,
     "sourceMaps": true,
     "skipFiles": ["<node_internals>/**"]
   }
   ```
3. Defina pontos de interrupção (breakpoints) diretamente nos arquivos `.ts` dentro de `src/dev-addons/<nome-do-addon>/src/`.
4. Ao invocar as ações do plugin, a depuração interrompe a linha exata no editor.

---

## 5. Ciclo de Trabalho Recomendado

1. Abra um terminal e execute o watcher do addon que você está desenvolvendo:
   ```bash
   npm run addon:watch meu-addon
   ```
2. Em outro terminal, mantenha o aplicativo executando:
   ```bash
   npm run dev:desktop
   ```
3. Edite o código em `src/dev-addons/meu-addon/src/index.ts`.
4. O `tsup` recompilará os arquivos na pasta `dist` em ~30ms.
5. Na janela do Mr-tick, pressione **`Ctrl + R`** para recarregar a interface ou chame a ação novamente. As alterações são aplicadas imediatamente com depuração ativa.
