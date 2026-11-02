# Seleção de tarefas em addons

O seletor já é fornecido pelo host através do campo público `task-reference`.
O addon declara o campo no seu schema de configurações; não precisa construir
um popup, consultar o RxDB nem importar componentes React internos.

```ts
import type { AddonSettingsTaskReferenceField } from '@mr-tick/sdk'

const targetTask: AddonSettingsTaskReferenceField = {
  id: 'targetTask',
  type: 'task-reference',
  label: 'Tarefa para associar',
  description: 'Escolha a conexão e a tarefa desta regra.',
  includeMetadata: true,
}
```

O valor é `AddonTaskReferenceValue`: `workspaceId`, `connectionInstanceId`,
`taskId` e metadados opcionais. `taskId` preserva o identificador da origem.
O addon pode usar seu próprio rótulo e descrição. `includeMetadata` habilita
o seletor de atividade da conexão; omita quando o addon só precisar da tarefa.

O controle existente `AddonTaskDestinationControl` usa as operações públicas
`core.listConnections`, `core.listTasks`, `core.getTask` e `core.getMetadata`.
O workspace é explícito, a conexão exige escolha e a busca é paginada.
Selecionar outra conexão limpa a referência anterior. Respostas antigas
de outras buscas ou conexões não substituem a seleção atual.

## Reuso da interface existente

`TaskLookup` continua sendo o modal avançado dos apontamentos e `TaskPopover`
continua sendo seu editor compacto, incluindo atividade e comentário.
As partes visuais de resultados foram extraídas para `TaskLookupResults` e
`TaskLookupTaskDetails`, usadas pelos seletores existentes. O seletor de conexão
compartilhado é `TaskConnectionSelect`.

Essas partes recebem dados e callbacks tipados; não consultam provedores,
banco ou contexto global. O adaptador dos apontamentos mantém os dados locais;
o adaptador declarativo dos addons mantém a ponte pública e sua paginação.
Comentários e regras de apontamento permanecem no editor de apontamentos.

O popup tem largura de 460px limitada à tela, títulos em até duas linhas,
ID e metadados secundários, rolagem contida, estados de carregamento/erro e
botões acessíveis pelo teclado. O modal avançado usa a mesma apresentação de
título e identificador, preservando seus filtros e sua lista virtualizada.


A conexão é apresentada com o nome da identidade e o nome do addon instalado,
sem substituir nomes por IDs técnicos. O catálogo global só resolve apresentação;
o workspace de consulta de tarefas continua vindo explicitamente do campo.
Quando faltam tanto identidade quanto catálogo, a opção fica indisponível com
uma mensagem explícita, em vez de usar o ID como rótulo.

No editor compacto, conexão e busca ficam acima dos resultados. Atividade e
comentário ficam juntos no bloco **Detalhes do apontamento**, fora da rolagem
da lista. O comentário aceita várias linhas com Shift+Enter; Enter mantém a
confirmação existente. O layout reduz a densidade em telas estreitas sem cortar
os campos.
