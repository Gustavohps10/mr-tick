# 🛠️ Mr-tick Dev Addons

> **Ei, desenvolva seu addon aqui neste diretório!**

Esta pasta foi projetada para criação, teste e desenvolvimento isolado de addons para o **Mr-tick**, completamente desacoplada do código central do monorepo.

Addons locais seguem as regras de ignore do monorepo. A fixture canônica `datasource-fake` e as documentações são versionadas; não presuma que toda a pasta é ignorada.

---

## 📖 Como começar

Leia o guia completo de arquitetura, comandos e depuração:
👉 **[desenvolvimento-e-debug-de-addons.md](./desenvolvimento-e-debug-de-addons.md)**

---

## ⚡ Comandos Rápidos

Execute os comandos na raiz do monorepo com o **Yarn 4** configurado no projeto:

```bash
# 1. Listar status de todos os addons locais:
yarn addon:list

# 2. Conectar seu addon ao runtime do Mr-tick (via symlink/junction):
yarn addon:link meu-addon

# 3. Desenvolver com compilação em tempo real e Source Maps:
yarn addon:watch meu-addon

# 4. Remover o link quando terminar:
yarn addon:unlink meu-addon
```
