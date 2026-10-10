export interface AddonTheme {
  id: string
  name: string
  description?: string
  /** Conteúdo CSS completo (100% do arquivo .css contendo :root, .dark, @theme, @layer, etc.) */
  css: string
}
