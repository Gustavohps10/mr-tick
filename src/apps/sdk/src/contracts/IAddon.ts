import { AddonContext } from './AddonContext'

export interface AddonActionResponse {
  isSuccess: boolean
  error?: string
  display?: {
    title?: string
    message?: string
    avatarUrl?: string
    data?: Record<string, string>
  }
}

// Regra: unicos metodos existentes no addon sao: activate, deactivate - qualquer coisa alem disso deve ser implementada internamente via context
export interface IAddon {
  activate(context: AddonContext): Promise<void> | void
  deactivate(): Promise<void> | void
}
