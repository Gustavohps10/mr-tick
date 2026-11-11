# Fase 4 — validação integral de analytics

Escopo autorizado: F4-01 a F4-05 do checklist do ecossistema. As fases anteriores já estão consolidadas; esta etapa completa as provas e corrige somente falhas concretas encontradas.

1. Confrontar os cenários do checklist com as suítes existentes: identidade, empates temporais, continuidade, reabertura, falha entre páginas, alterações retroativas, exclusões, filtros e autorização. Registrar arquivo, camada exercitada e limite da prova.
2. Acrescentar uma fixture HTTP independente de Redmine e do addon fake, usando o transporte HTTP e DuckDB reais. Exercitar identidade textual/composição de escopo, checkpoints opacos, repetição segura da fronteira e reinício após falha/cancelamento entre páginas. Retomada significa reiniciar pelo último checkpoint publicado; páginas parcialmente ingeridas não são retomadas.
3. Provar o fluxo pessoal no Electron enquanto uma extração analítica está efetivamente retida, depois de sucesso, falha e cancelamento. Usar barreiras Promise no addon de desenvolvimento, comandos reais do runtime pessoal e conferência da publicação anterior e de seus marcos. Substituir a alegação anterior baseada em funções locais simuladas.
4. Cancelamento nesta prova significa aborto do transporte/provedor e rejeição da carga incompleta, preservando a versão publicada e liberando staging. Não introduzir um botão de cancelamento nem prometer interrupção física de todos os providers: o contrato atual não expõe cancelamento universal. Sair da tela interrompe novos ciclos de polling; uma requisição já iniciada tem seu próprio ciclo de conclusão.
5. Executar as suítes pertinentes, matriz Redmine somente leitura, typecheck e lint na raiz; gerar os builds antes do E2E. Solicitar revisão independente após os checks; corrigir achados reproduzidos pelo ciclo vermelho → correção → verde → reauditoria e só então encerrar os itens.

Não modificar nem comitar o addon Redmine nesta etapa sem necessidade concreta. Não fazer commit/push automaticamente. Changesets de eventuais mudanças funcionais continuam somente minor/patch. Não apagar bases do usuário nem aumentar o seed sem necessidade.

As provas funcionais de concorrência não são um benchmark de contenção extrema nem uma garantia física de RSS/latência. Cobertura remota não verificada e limitação de paginação Redmine 3.4 permanecem explícitas.
