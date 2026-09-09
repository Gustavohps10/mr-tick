# 🛠️ Mr-tick Dev Addons

> **Ei, desenvolva seu addon aqui neste diretório!**

Esta pasta foi projetada para criação, teste e desenvolvimento isolado de addons para o **Mr-tick**, completamente desacoplada do código central do monorepo.

Tudo o que for criado aqui dentro é automaticamente ignorado pelo controle de versão (Git), com exceção das documentações explicativas.

---

## 📖 Como começar

Leia o guia completo de arquitetura, comandos e depuração:
👉 **[desenvolvimento-e-debug-de-addons.md](./desenvolvimento-e-debug-de-addons.md)**

---

## ⚡ Comandos Rápidos

Qualquer comando de automação funciona com seu gerenciador de pacotes preferido (**npm**, **yarn**, **pnpm** ou **bun**):

```bash
# 1. Listar status de todos os addons locais:
npm run addon:list   # ou yarn addon:list / pnpm addon:list / bun run addon:list

# 2. Conectar seu addon ao runtime do Mr-tick (via symlink/junction):
npm run addon:link meu-addon

# 3. Desenvolver com compilação em tempo real e Source Maps:
npm run addon:watch meu-addon

# 4. Remover o link quando terminar:
npm run addon:unlink meu-addon
```
