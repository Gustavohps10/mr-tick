---
name: source-over-documentation
description: Define como resolver divergências entre a implementação atual e arquivos Markdown possivelmente desatualizados.
---

# Fonte de Verdade: Código-fonte

Ao analisar ou modificar este repositório, considere o código-fonte atual como a fonte de verdade sobre o comportamento implementado.

## Regra de precedência

- Se uma regra, descrição ou exemplo em qualquer arquivo `.md` divergir do comportamento demonstrado pelo código-fonte, prevalece o código-fonte.
- Documentação pode estar desatualizada; não presuma que ela descreve fielmente a implementação atual.
- Confirme o comportamento lendo os pontos relevantes da implementação e, quando aplicável, testes, configurações e contratos. Não resolva divergências usando apenas a documentação.
- Trate a documentação como contexto para intenção, arquitetura proposta e histórico, não como prova suficiente do comportamento vigente.

## Como lidar com divergências

- Ao explicar o comportamento existente, descreva o que o código realmente faz e indique a divergência documental relevante.
- Ao implementar uma mudança, siga os requisitos explícitos do pedido e os contratos validados. A precedência do código-fonte serve para identificar o comportamento atual; ela não substitui nem invalida um pedido explícito para mudar esse comportamento.
- Atualize a documentação diretamente relacionada quando a mudança deixar uma descrição obsoleta, seguindo os padrões do repositório.
- Não altere documentação ou código fora do escopo apenas para eliminar divergências não relacionadas.
