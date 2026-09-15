# MR-TICK — Arquitetura de Extensibilidade e Plugins (Addons)

Este documento consolida a arquitetura oficial de extensibilidade do **MR-TICK**, definindo os **4 Pilares Principais de Addons**, o ciclo de vida e a integração nativa com o **`@mr-tick/sdk`**.

---

## 1. Visão Geral da Arquitetura

O MR-TICK opera com uma arquitetura **Local-First** desacoplada. Os plugins são organizados estritamente em torno de **4 Pilares Principais**:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          MR-TICK CORE (RxDB)                            │
│  • Gerenciador de Apontamentos (Time Entries)                           │
│  • Motor de Sugestões de Apontamento (Timeline)                         │
│  • Timer Runtime (Ao vivo, Pausado, Sincronizado)                       │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   DataSources    │       │     Watchers     │       │    Calendars     │
│ (Jira, Redmine)  │       │ (Discord, Git)   │       │ (Google, Outlook)│
│ Puxa tarefas e   │       │ Monitora o PC e  │       │ Traz reuniões do │
│ envia log.       │       │ gera sugestões.  │       │ dia p/ virar log.│
└──────────────────┘       └──────────────────┘       └──────────────────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │      Punch       │
                           │(Pontomais, Ahgora│
                           │ Bate ponto formal│
                           └──────────────────┘
```

---

## 2. Os 4 Pilares de Addons

### A. 📦 DataSources (Fontes de Dados & Tarefas)

- **Objetivo**: Conecta o Mr-tick às plataformas oficiais de gestão de projetos.
- **Exemplos**: Jira, Redmine, YouTrack, GitHub Issues, Trello, Linear.
- **Responsabilidades**:
  - Listar e buscar tarefas atribuídas ao usuário no workspace ativo (`fetchTasks`).
  - Sincronizar e enviar os apontamentos de horas concluídos no Mr-tick (`logTime`).

---

### B. 👁️ Watchers (Monitoramento & Sugestões)

- **Objetivo**: Observadores em segundo plano que monitoram o ambiente de trabalho do usuário ou escutam eventos nativos (`context.events`) para sugerir blocos de tempo ou atualizar status de presença externamente.
- **Exemplos**:
  - **Discord Voice**: Detecta saída de chamadas de voz e gera sugestão de tempo.
  - **Discord Rich Presence**: Atualiza o status do Discord quando o timer do Mr-tick inicia ou pausa.
  - **Git & IDE Watcher**: Detecta tempo ativo em repositórios locais ou no VS Code.
- **Responsabilidades**:
  - Escutar eventos locais ou do sistema (`timer:start`, `timer:stop`, `system:idle`).
  - Emitir sugestões de apontamento com 1 clique para a timeline do usuário.

---

### C. 📅 Calendars (Agendas & Reuniões)

- **Objetivo**: Integração com agendas corporativas para exibir os compromissos do dia e permitir transformar reuniões em logs de tempo com 1 clique.
- **Exemplos**: Google Calendar, Microsoft Outlook Calendar, Cal.com.
- **Responsabilidades**:
  - Importar reuniões e eventos agendados para o dia (`fetchTodayEvents`).
  - Permitir conversão rápida de eventos da agenda em apontamentos vinculados a tarefas.

---

### D. ⏱️ Punch (Ponto Eletrônico & Jornada)

- **Objetivo**: Integração com sistemas formais de bate-ponto corporativo para conferência de jornada de trabalho vs horas dedicadas a tarefas.
- **Exemplos**: Pontomais, Secullum, Ahgora, Tangerino.
- **Responsabilidades**:
  - Executar batidas de ponto (Entrada, Almoço, Volta, Saída).
  - Consultar saldo de jornada e espelho de ponto para prevenção de divergências.

---

## 3. Manifesto e Configurações Dinâmicas (`context.settings.register`)

Os metadados do Addon (`id`, `name`, `version`, `categories`) residem exclusivamente no `manifest.yaml`. As opções e abas de configuração são registradas dinamicamente dentro de `activate` através de `context.settings.register`:

```typescript
import type { IAddon, AddonContext } from '@mr-tick/sdk'

export default class MeuAddon implements IAddon {
  public async activate(context: AddonContext): Promise<void> {
    // 1. Registra abas e campos de configuração de forma declarativa
    context.settings.register([
      {
        id: 'geral',
        label: 'Geral',
        groups: [
          {
            id: 'preferencias',
            label: 'Preferências',
            fields: [
              {
                id: 'apiKey',
                label: 'Chave de API',
                type: 'password',
                required: true,
              },
              {
                id: 'autoSync',
                label: 'Sincronização Automática',
                type: 'boolean',
                defaultValue: true,
              },
            ],
          },
        ],
      },
    ])

    // 2. Acesso ao storage seguro isolado por workspace
    const apiKey = await context.storage.get('apiKey')

    // 3. Escutando eventos nativos do timer
    context.events.onTimerStart((payload) => {
      console.log('Timer iniciado para a tarefa:', payload.taskId)
    })
  }

  public async deactivate(): Promise<void> {
    // Limpeza de timers, listeners ou conexões
  }
}
```

---

## 4. Tabela Resumo dos Pilares

┌─────────────────┬──────────────────────────────────────────────────────────────────┐
│ Pilar │ O que faz no Mr-tick? │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ **DataSources** │ Puxa tarefas de plataformas externas e envia os logs de tempo. │
│ **Watchers** │ Monitora apps/eventos e sugere blocos de tempo na timeline. │
│ **Calendars** │ Traz reuniões do dia da agenda e converte em apontamentos. │
│ **Punch** │ Registra o ponto eletrônico e verifica o saldo de jornada. │
└─────────────────┴──────────────────────────────────────────────────────────────────┘

---

## 5. Empacotamento e Distribuição (Padrão da Indústria com `tsup`)

### ⚡ Por que o `tsup` é o padrão da indústria?

O **`tsup`** (baseado no **`esbuild`**) é o bundler padrão moderno adotado por grandes ecossistemas (como _Raycast_, _Nuxt_, _Vite SSR_, _tRPC_ e extensões Desktop):

1. **Zero-Config TypeScript:** Compila TS para JS e gera arquivos de tipagem `.d.ts` instantaneamente.
2. **Alta Performance:** Construído em Go (esbuild), empacota bundles complexos em milissegundos.
3. **Distribuição Standalone:** Permite embutir todas as dependências de terceiros no arquivo final, eliminando a necessidade de pastas `node_modules` no computador do usuário final.

---

### 📦 Configuração Oficial Recomendada (`tsup.config.ts`)

Todo Addon do Mr-tick deve conter o seguinte `tsup.config.ts` na raiz do seu projeto:

```typescript
import { cpSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  banner: {
    // Compatibilidade nativa para bibliotecas dependentes de require() em ambiente ESM
    js: `import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`,
  },
  dts: { resolve: true },
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/.*/], // 👈 EMBUTE TODAS AS DEPENDÊNCIAS NO BUNDLE FINAL
  tsconfig: './tsconfig.build.json',
  onSuccess: async () => {
    // Garante que o ícone oficial acompanhe o pacote
    try {
      cpSync('src/icon.png', 'dist/icon.png')
    } catch {}
  },
})
```

---

### ⚠️ Diagnóstico e Solução de Problemas Comuns

#### 1. Erro: `Cannot find package '@mr-tick/sdk' imported from ...`

- **Causa:** O bundler gerou um arquivo JS com `import { ... } from 'xyz'` externo. Como o Mr-tick apenas descompacta o `.tladdon` sem rodar `npm install` no cliente, o Node não encontra o pacote.
- **Solução:** Adicione `noExternal: [/.*/]` no `tsup.config.ts`. Isso força o bundler a inliner todo o código necessário dentro do `dist/index.js`.

#### 2. Erro: `Dynamic require of "util" (ou outro módulo) is not supported`

- **Causa:** Alguma dependência embutida (ex: parsers XML, Markdown, HTTP) usa `require('util')` internamente. No padrão ESM do Node.js, a variável global `require` não existe por padrão.
- **Solução:** Defina `platform: 'node'` e injete o banner `createRequire` no topo do bundle:
  ```typescript
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`,
  }
  ```

#### 3. Erro: `YAML anchors &ref_0` ou quebras de linha `>-` no `manifest.yaml`

- **Causa:** O serializador YAML padrão pode tentar reutilizar referências de memória quando campos como `packages` ou `changelog` possuem arrays idênticos.
- **Solução:** Execute o script `yarn sync:manifest` que utiliza `js-yaml` com as opções `{ lineWidth: -1, noRefs: true }`.

---

### 🚀 Fluxo de Publicação do Pacote (`.tladdon`)

```bash
# 1. Compilar o bundle standalone
yarn build

# 2. Empacotar o Addon e atualizar o manifesto
yarn Mr-tick pkg ./ --download-url "https://github.com/usuario/meu-addon/releases/download/v0.1.0/meu-addon-0.1.0.tladdon"

# 3. Sincronizar formatação e screenshots
yarn sync:manifest

# 4. Publicar Release via Tag Git
git tag v0.1.0
git push origin main --tags
```
