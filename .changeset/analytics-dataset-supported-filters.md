---
"@mr-tick/application": minor
"@mr-tick/sdk": minor
"@mr-tick/ui": minor
"@mr-tick/desktop": minor
"@mr-tick/datasource-fake": minor
---

Implementa pushdown de filtros agnósticos (`supportedFilters`) em datasets de Analytics, permitindo filtragem server-side direta no provedor para múltiplos usuários, projetos, períodos e atividades, eliminando download massivo de dados in-memory, além de simplificar radicalmente a seleção de datasets na interface para exibir apenas nome canônico em negrito e rota direta (`/rota.json`), expurgando qualquer acoplamento de regra de negócio das labels.
