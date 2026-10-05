---
name: changeset-version-bump
description: Orienta a criação correta de changesets e o ciclo de bump de versão, proibindo pacotes ignorados (mixed changesets) e edições manuais de versão no package.json ou CHANGELOG.
---

# Fluxo de Versionamento e Changesets

Esta skill define as regras obrigatórias para criação de registros de mudança (changesets), bumps de versão e releases no monorepo e nos plugins/addons do ecossistema Mr-tick.

---

## 1. Quem sobe versão é o BOT, NUNCA a IA ou Desenvolvedor

- **Proibição de bump manual local**:
  - **NÃO** execute `yarn changeset version` localmente.
  - **NÃO** altere manualmente o campo `"version"` nos arquivos `package.json` para realizar releases.
  - **NÃO** edite ou crie seções de versão manualmente nos arquivos `CHANGELOG.md`.
- **Papel da IA / Desenvolvedor**:
  - O único papel no versionamento é **gerar o arquivo de intenção de mudança** (`.changeset/<nome-descritivo>.md`), seja via comando `yarn changeset` ou criando o arquivo `.md` correspondente.
- **Papel do CI/CD (GitHub Actions / Bot)**:
  - Ao fazer merge na branch principal (`main`), a GitHub Action (`changesets/action@v1`) é quem lê os changesets, faz o bump das versões nos `package.json`, atualiza os `CHANGELOG.md`, gera o PR de release (`changeset-release/main`) ou publica os pacotes no NPM e cria as tags no Git.

---

## 2. Proibição Absoluta de Pacotes Ignorados ("Mixed Changesets")

### O Erro
Ao incluir um pacote ignorado em um changeset com outros pacotes, a esteira quebra com o erro fatal:
```text
🦋 error Error: Found mixed changeset <nome>
🦋 error Found ignored packages: @mr-tick/landing-page
🦋 error Found not ignored packages: @mr-tick/sdk @mr-tick/ui ...
🦋 error Mixed changesets that contain both ignored and not ignored packages are not allowed
```

### Regra
1. **Sempre consultar `.changeset/config.json`**:
   - Verifique a lista de pacotes no array `"ignore"` (ex: `"@mr-tick/landing-page"`).
2. **Nunca incluir pacotes ignorados no frontmatter**:
   - Nenhum pacote que conste no array `"ignore"` pode aparecer no cabeçalho YAML de um arquivo `.changeset/*.md`.
   - Se uma alteração afetou apenas a landing page ou outro pacote ignorado, **não** crie changeset para ele.

---

## 3. Validação Obrigatória Antes de Registrar Changeset

Antes de criar ou comitar um changeset em qualquer repositório (monorepo principal ou repositórios de plugins/addons como `redmine-plugin`):

1. **Testes Unitários e de Integração**:
   - Rodar todas as suítes pertinentes (`yarn test`, `yarn test:unit`, `yarn test:ui`).
2. **Checagem Estrita de Tipos**:
   - Rodar `yarn typecheck` no repositório ou no addon afetado.
3. **Linter**:
   - Rodar `yarn lint:fix` e garantir 0 erros de lint.
4. **Garantia de Não Regressão**:
   - Garantir que contratos públicos (interfaces, DTOs, SDK) não sofreram breaking changes involuntárias sem o devido bump (`minor` ou `major`).

---

## 4. Estrutura Canônica de um Arquivo de Changeset

Os arquivos devem ser criados em `.changeset/<nome-claro-da-funcionalidade>.md` seguindo o formato:

```markdown
---
"@mr-tick/sdk": patch
"@mr-tick/application": patch
"@mr-tick/ui": patch
---

Descrição clara e objetiva do que foi corrigido, adicionado ou modificado.
```

- Tipos de bump válidos:
  - `patch`: Correções de bugs, pequenas melhorias internas ou ajustes retrocompatíveis.
  - `minor`: Novas funcionalidades compatíveis, adições a contratos ou novos métodos opcionais.
  - `major`: Mudanças que quebram contratos públicos existentes (breaking changes).
- **Apenas pacotes gerenciados pelo Changesets e não ignorados** devem ser listados no frontmatter.
