# Auditoria de i18n da landing — 13/10/2026

## Escopo concluído

Textos de marketing em Positioning, Integrations, OfflineArchitecture, Pricing (Free, Plus e Enterprise), Footer, Hero e DownloadView usam mensagens EN/PT-BR pelo next-intl. Billing success, navegação móvel, metadados e documentação acompanham o locale.

## Idioma e estrutura de rotas

- Primeira visita: Accept-Language. Português brasileiro direciona a /pt-br; inglês mantém /.
- Prioridade: URL explícita, cookie NEXT_LOCALE, idioma do navegador e idioma padrão. Escolha manual lembrada por um ano.
- Troca manual preserva caminho, query e âncora; conferida na landing, download, billing e docs.
- [locale]/layout.tsx é o layout raiz das páginas traduzidas. O html lang é definido no servidor; não há correção posterior por efeito cliente.
- request.ts usa next/root-params e respeita overrides explícitos de locale. requestLocale e setRequestLocale foram removidos.
- Na versão instalada do Next.js (16.2.1), rootParams e globalNotFound são APIs experimentais, habilitadas no next.config.ts. Nenhuma dependência foi atualizada nesta entrega.
- Callback OAuth está no grupo (unlocalized), preservando /oauth/callback.

## Documentação

- 11 páginas com prosa, títulos, descrições e diagramas em EN e PT-BR. Português fica em arquivos .pt-br.mdx; inglês usa os nomes sem sufixo.
- /docs e /pt-br/docs usam a árvore correspondente. Links do Navbar, Footer, SDK e servidor preservam idioma.
- Menus, índice, busca, paginação e rótulos do Fumadocs foram traduzidos.
- API de busca usa createFromSource com índices por idioma.
- Exemplos de código executável permanecem iguais nos dois idiomas para preservar os contratos. Comentários e textos de exemplo podem estar em português. Avisos existentes de APIs antigas continuam explícitos; não houve auditoria funcional dos exemplos do SDK nesta rodada.

## Correção do DB8 na demonstração

- O mock usava workspace default em todas as montagens. Instâncias sobrepostas podiam abrir o mesmo db-memory-default enquanto a anterior estava sendo encerrada.
- Cada montagem agora cria um workspace UUID próprio, compartilhado pelo bridge, WorkspaceProvider e navegação da demonstração.
- Removida a limpeza de IndexedDB do mock, que usa exclusivamente armazenamento em memória.
- Não foram alterados ignoreDuplicate, schemas ou código de sincronização do core.
- Teste reproduz DB8 com duas aberturas de identidade igual e comprova duas identidades de demonstração abertas simultaneamente sem DB8. É uma prova de identidade e armazenamento RxDB; não é um teste de replicação remota de apontamentos.
- Navegador: recarga e troca EN/PT-BR sem novos DB8 nos logs capturados nesta rodada.

## Evidências de validação

- 35 testes em seis suites: idiomas, moedas, estrelas, releases, isolamento da demonstração e cobertura da documentação.
- HTTP: 22 páginas de docs com status 200, idioma HTML e título correspondente; buscas EN e PT-BR com resultados localizados.
- Pricing: R$ 0 / R$ 19,90 e $0 / $7; período traduzido independentemente da moeda. Abas individuais e de equipes cabem em 390 px.
- Catálogo de preços não usa quantia de outra moeda; opção ausente fica indisponível e não permite checkout. Resposta assíncrona não sobrescreve escolha manual de moeda.
- /api/github-stars respondeu HTTP 200 com stars=1 na rodada anterior. Na última recarga, o upstream ficou indisponível e a rota respondeu 502 com stars=null; a UI mostrou —. Navbar e menu móvel usam a mesma contagem, sem inventar estrelas.
- Checks finais: build com 9 tarefas bem-sucedidas; typecheck com 14 tarefas bem-sucedidas; lint com zero erros e 68 avisos preexistentes.
- Logs finais da rodada: .temp/landing-i18n/followup-{tests,lint,build,typecheck}.log e docs-http-smoke.log.
- Capturas da documentação e da landing foram salvas no diretório de visualizações desta conversa.

## Limitações preservadas

Billing success foi validado como página de confirmação e instruções, sem compra real. A página não verifica a sessão de pagamento no servidor. A demonstração interativa reutiliza @mr-tick/ui, cujo conteúdo e alguns rótulos têm idioma próprio; a entrega não cria i18n para todo o desktop. Links sociais, termos e privacidade já definidos como # continuam placeholders.

O primeiro build da rodada anterior falhou por falta de espaço. Foram limpos somente .next da landing e .turbo, com autorização do usuário. A landing é ignorada pela configuração de Changesets; versões não foram alteradas.

## Troca de idioma e script do tema

- Reproduzido no navegador: a navegação cliente PT → EN remontava o layout raiz e inseria novamente o script inline emitido pelo next-themes, gerando o aviso de React sobre scripts renderizados no cliente.
- O seletor agora usa navegação de documento via location.replace e getPathname com forcePrefix. O middleware registra o idioma explícito antes de redirecionar EN para a URL canônica sem prefixo.
- Mantidos caminho, query string e hash. O documento e seu bootstrap de tema passam a carregar juntos no idioma escolhido.
- Validado no navegador EN → PT → EN e /pt-br/docs?source=locale-audit#vis%C3%A3o-geral-e-arquitetura → /docs?source=locale-audit#vis%C3%A3o-geral-e-arquitetura, com HTML lang=en e conteúdo inglês, sem novos erros de script. O console preserva apenas a ocorrência anterior à correção, capturada às 16:44:16 UTC.
- Dois testes de regressão confirmam a preferência manual em ambas as direções e a preservação dos parâmetros no redirecionamento para EN. Detecção inicial PT e persistência do cookie seguem cobertas.
- Evidências desta correção: .temp/landing-i18n/locale-switch-{tests,typecheck,lint,build}.log.
- Após reiniciar o servidor, repetida a troca PT → EN em uma nova aba: conteúdo inglês e zero entradas de erro no console capturado.

## Estrelas do GitHub no HTML inicial

- Navbar agora é um componente de servidor que consulta fetchRepositoryStars e passa o resultado para NavbarView. Desktop e menu móvel recebem a mesma prop.
- Removidos o estado inicial vazio, o useEffect de consulta e o transporte cliente /api/github-stars. A rota API foi preservada para seus consumidores externos.
- Consulta ao GitHub continua com revalidação de 3600 segundos. Se indisponível, o servidor entrega o indicador — sem inventar contagens.
- Download recebe a Navbar de servidor como slot ReactNode, preservando a fronteira entre componentes de servidor e cliente.
- Testes do transporte: oito aprovados, incluindo zero estrelas, respostas inválidas, erro de rede e contrato de cache.
- Evidências: .temp/landing-i18n/stars-ssr-{typecheck,lint,build}.log.
- Validação final SSR: home, docs e download em EN/PT-BR responderam HTTP 200 com o indicador de estrelas já presente no HTML inicial. Consulta direta ao GitHub confirmou HTTP 403 por limite de requisições; todas as páginas entregaram — consistentemente.
- Checks finais desta alteração: typecheck 14/14; build 9/9; lint zero erros e 68 avisos preexistentes. Teste HTTP registrado em .temp/landing-i18n/stars-ssr-smoke.log.
- Servidor de produção temporário na porta 3001 encerrado após a validação. Nenhum servidor de desenvolvimento foi iniciado para esta alteração.
