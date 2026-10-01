---
name: consolidated-commits
description: Orienta o processo de commits em lote e consolidados por funcionalidade ou correção, proibindo micro-commits fragmentados para manter o histórico de versionamento limpo e coeso.
---

# Fluxo de Commits Consolidados por Entrega

Esta skill estabelece o padrão operacional para o gerenciamento de commits no repositório.

## Diretrizes Fundamentais

1. **Proibição de Micro-Commits Fragmentados**:
   - Não crie commits para cada pequena alteração individual, ajuste cosmético ou linha modificada durante o desenvolvimento.
   - Evite dispersar alterações relacionadas em vários commits pequenos (ex: commit de classe CSS, seguido de commit de margem, seguido de commit de texto).

2. **Desenvolvimento em Lote e Validação Conjunta**:
   - Trabalhe nas alterações necessárias de forma contínua até concluir o bloco lógico ou marco proposto.
   - Realize a bateria completa de validação antes de comitar:
     - Testes unitários pertinentes (`yarn vitest run <suítes>`)
     - Linter obrigatório na raiz (`yarn lint:fix`)
     - Verificação estrita de tipos na raiz (`$env:NODE_OPTIONS="--max-old-space-size=8192"; yarn typecheck`)

3. **Commit Único e Coeso por Bloco de Entrega**:
   - Após validação bem-sucedida, crie um commit consolidado abrangendo todo o conjunto de alterações relacionadas.
   - Utilize a convenção do projeto (`feat(escopo): ...` ou `fix(escopo): ...`) com mensagem clara e representativa do bloco entregue.
