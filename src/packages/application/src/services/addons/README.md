# Addons Subcontext (`services/addons`)

Gerencia o catálogo, a governança, as configurações declaradas e o licenciamento dos **Addons** instalados no aplicativo.

## 🎯 Responsabilidades

- **Gerenciamento do Pacote:** Importação (instalação de arquivo/pacote), atualização de versão e verificação de integridade do manifesto.
- **Acesso e Licenciamento:** Validação de tier (Free vs Plus) e políticas de acesso aos recursos estendidos dos addons.
- **Configurações Declaráveis (Settings):** Leitura e salvamento seguro de configurações declaradas em runtime pelo schema de settings do addon (ex: temas, flags, opções de tela).

## 📦 Serviços Contidos

| Serviço | Caso de Uso |
| :--- | :--- |
| `AddonAccessService` | Verifica se o workspace/usuário tem permissão para acionar capacidades do addon |
| `ImportAddonService` | Processa o pacote do addon, valida o manifesto e registra o plugin no sistema |
| `UpdateAddonService` | Atualiza a versão física do addon respeitando compatibilidade de contratos |
| `LicensingService` | Consulta e valida a licença do produto para addons que exigem tiers superiores |
| `GetAddonSettingsService` | Recupera as configurações aplicadas com projeção/redação de segredos |
| `SaveAddonSettingsService` | Salva patches de configurações isoladas por escopo declarado |

## 🛡️ Invariantes e Regras de Negócio

1. **Separação Rígida entre Settings e Segredos (M03 / M08):** Configurações comuns (booleans, strings, selects) são salvas em repositório de settings. Campos marcados como segredos/senhas nunca são retornados abertos para a UI e transitam via cofre.
2. **Escopos Declarados:** Configurações podem ter escopo global, escopo por workspace ou escopo por conexão. Nenhuma gravação pode vazar de um escopo para outro.
3. **Addon não é Conexão:** O Addon é o código reutilizável. Múltiplas conexões podem apontar para o mesmo Addon (ex: duas contas diferentes do mesmo addon Redmine).

## 🚫 O que NÃO deve ficar aqui
- Chamadas HTTP diretas para servidores de terceiros (pertencem ao próprio Addon ou a `connections/`).
- Gerenciamento de tokens de autenticação ou fluxo OAuth (pertencem a `connections/`).
- Armazenamento em arquivos locais diretos sem passar por repositórios tipados.
